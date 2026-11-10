<?php

namespace Tests\Feature\Api;

use App\Models\Driver;
use App\Models\Item;
use App\Models\LedgerEntry;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use App\Models\Vendor;
use App\Support\OrderView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ShopperFlowTest extends TestCase
{
    use RefreshDatabase;

    private Order $order;
    private Driver $driver;
    private array $lines = [];
    private Item $cheaperBread;
    private Item $fancyBread;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $this->withoutVite();
        Http::fake();
        Storage::fake('local');
        Event::fake([\App\Events\OrderUpdated::class, \App\Events\DriverOfferCreated::class]);

        // A Zvino-run grocery store with a few products.
        $store = Vendor::firstOrFail();
        $store->update(['is_shopper_store' => true, 'kind' => 'grocery', 'auto_accept' => true]);
        $cat = $store->categories()->create(['name' => 'Bakery']);
        $mk = fn ($name, $zig, $usd) => Item::create(['vendor_id' => $store->id, 'category_id' => $cat->id, 'name' => $name, 'price_zig' => $zig, 'cost_usd' => $usd, 'is_available' => true]);
        $milk = $mk('Milk 2L', 60, 2.40);
        $bread = $mk('White Bread', 30, 1.10);
        $eggs = $mk('Eggs 6', 40, 1.50);
        $this->cheaperBread = $mk('Brown Bread', 25, 0.95);
        $this->fancyBread = $mk('Artisan Sourdough', 90, 3.50);

        $this->driver = Driver::where('status', 'approved')->with('user')->firstOrFail();
        $base = Order::where('fulfilment', 'delivery')->whereNotNull('user_id')->firstOrFail();
        $o = $base->replicate(['reference']);
        $o->fill(['reference' => 'SHOP1', 'vendor_id' => $store->id, 'status' => 'accepted', 'driver_id' => $this->driver->id, 'substitution_pref' => 'best',
            'payment_status' => 'paid', 'shopping_started_at' => null, 'shopping_finished_at' => null, 'refunded_zig' => 0, 'ready_at' => null, 'picked_up_at' => null, 'delivered_at' => null])->save();
        $o->items()->delete();
        foreach ([[$milk, 2], [$bread, 1], [$eggs, 1]] as [$item, $qty]) {
            $this->lines[] = OrderItem::create(['order_id' => $o->id, 'item_id' => $item->id, 'name' => $item->name, 'quantity' => $qty, 'unit_price_zig' => $item->price_zig, 'line_total_zig' => $item->price_zig * $qty]);
        }
        $this->order = $o->fresh();
    }

    private function url(string $path = ''): string
    {
        return "/api/driver/jobs/{$this->order->id}/shop$path";
    }

    public function test_driver_shops_the_order_customer_is_refunded_and_driver_reimbursed(): void
    {
        [$milk, $bread, $eggs] = $this->lines;
        $customer = $this->order->user;
        $walletBefore = (float) $customer->walletTransactions()->where('type', 'credit')->sum('amount_zig');
        Sanctum::actingAs($this->driver->user);

        // Can't skip straight to "picked up".
        $this->postJson("/api/driver/jobs/{$this->order->id}/pickup")->assertStatus(422);

        $this->getJson($this->url())->assertOk()->assertJsonPath('total', 3)->assertJsonPath('lines.0.aisle', 'Bakery');
        $this->postJson($this->url('/start'))->assertOk();
        $this->assertSame('preparing', $this->order->fresh()->status);
        $this->assertSame('Shopping your items', OrderView::forCustomer($this->order->fresh())['banner']['title']);

        // Milk: only 1 of 2. Bread: swapped for a cheaper loaf. Eggs: out.
        $this->postJson($this->url("/items/{$milk->id}"), ['status' => 'partial', 'found_qty' => 1])->assertOk();
        $this->getJson($this->url("/search?for={$bread->id}"))->assertOk()->assertJsonFragment(['name' => 'Brown Bread']);
        $this->postJson($this->url("/items/{$bread->id}"), ['status' => 'replaced', 'replacement_item_id' => $this->fancyBread->id])->assertStatus(422); // far dearer: not allowed
        $this->postJson($this->url("/items/{$bread->id}"), ['status' => 'replaced', 'replacement_item_id' => $this->cheaperBread->id])->assertOk();
        $res = $this->postJson($this->url("/items/{$eggs->id}"), ['status' => 'missing'])->assertOk();
        $this->assertEqualsWithDelta(60 + 5 + 40, $res->json('refund.zig'), 0.01);

        // The customer sees the progress and changes live.
        $view = OrderView::forCustomer($this->order->fresh());
        $this->assertSame(3, $view['shopping']['done']);
        $this->assertCount(3, $view['shopping']['changes']);

        // Till: slip required; paid with the driver's own money.
        $this->postJson($this->url('/finish'), ['till_total_usd' => 4.10, 'paid_with' => 'own_cash'])->assertStatus(422);
        $this->post($this->url('/finish'), ['till_total_usd' => 4.10, 'paid_with' => 'own_cash', 'slip' => UploadedFile::fake()->image('slip.jpg')], ['Accept' => 'application/json'])->assertOk();

        $order = $this->order->fresh();
        $this->assertSame('picked_up', $order->status);
        $this->assertSame(4.10, $order->till_total_usd);
        Storage::disk('local')->assertExists($order->till_slip_path);
        $this->assertEqualsWithDelta(105, $order->shopping_refund_zig, 0.01);
        $this->assertEqualsWithDelta($walletBefore + 105, (float) $customer->walletTransactions()->where('type', 'credit')->sum('amount_zig'), 0.01, 'refund in the wallet');
        $this->assertTrue(LedgerEntry::where('order_id', $order->id)->where('account_type', 'driver')->where('description', 'like', 'Shopping paid at the till%')->exists(), 'driver reimbursed');

        // Admin sees the till, the expected amount and the slip.
        $admin = User::where('role', 'super_admin')->firstOrFail();
        $this->actingAs($admin)->get("/admin/orders/{$order->id}")->assertInertia(fn ($p) => $p->where('order.shopping.till_total_usd', 4.1)->where('order.shopping.has_slip', true));
        $this->actingAs($admin)->get("/admin/orders/{$order->id}/till-slip")->assertOk();

        // Delivered: the Zvino-run store's sales stay with Zvino (nothing to pay out to the "store").
        app(\App\Services\OrderService::class)->setStatus($order, 'delivered');
        $this->assertEqualsWithDelta(0, (float) LedgerEntry::where('order_id', $order->id)->where('account_type', 'vendor')->sum('amount_zig'), 0.01);
    }

    public function test_refund_only_customers_get_no_replacements_and_everything_must_be_ticked(): void
    {
        $this->order->update(['substitution_pref' => 'refund']);
        Sanctum::actingAs($this->driver->user);
        $this->postJson($this->url("/items/{$this->lines[1]->id}"), ['status' => 'replaced', 'replacement_item_id' => $this->cheaperBread->id])->assertStatus(422);
        $this->postJson($this->url("/items/{$this->lines[0]->id}"), ['status' => 'found'])->assertOk();
        $this->post($this->url('/finish'), ['till_total_usd' => 4, 'paid_with' => 'zvino_card', 'slip' => UploadedFile::fake()->image('slip.jpg')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('items');

        // Another driver can't touch it.
        $other = Driver::where('status', 'approved')->where('id', '!=', $this->driver->id)->first();
        if ($other) {
            Sanctum::actingAs($other->user);
            $this->getJson($this->url())->assertNotFound();
        }
    }

    public function test_background_polling_no_longer_blocks_other_buttons(): void
    {
        $admin = User::where('role', 'super_admin')->firstOrFail();
        for ($i = 0; $i < 8; $i++) {
            $this->actingAs($admin)->getJson('/admin/alerts')->assertOk();
        }
        // The sync button allows 4 a minute: polling above must not count against it.
        $this->actingAs($admin)->post('/admin/suppliers/tmpnp/sync')->assertStatus(302);
    }
}

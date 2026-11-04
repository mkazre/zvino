<?php

namespace Tests\Feature\Admin;

use App\Events\OrderUpdated;
use App\Models\HomeBlock;
use App\Models\Item;
use App\Models\Order;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        \Illuminate\Support\Carbon::setTestNow('2026-11-04 12:00:00');
        Cache::flush();
        $this->seed();
        Http::fake();
        Event::fake([OrderUpdated::class]);
    }

    private function staff(string $role): User
    {
        return User::where('role', $role)->firstOrFail();
    }

    public function test_every_admin_screen_renders_for_super_admin()
    {
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $admin = $this->staff('super_admin');
        $order = \App\Models\Order::where('status', 'delivered')->first();
        $live = \App\Models\Order::where('status', 'placed')->first();
        $vendor = \App\Models\Vendor::first();
        $driver = \App\Models\Driver::first();
        $customer = User::where('role', 'customer')->has('orders')->first();

        $urls = [
            '/dashboard', '/dashboard?range=90', '/admin/orders', '/admin/orders?status=active', "/admin/orders/{$order->id}", "/admin/orders/{$live->id}",
            '/admin/dispatch', '/admin/dispatch/live', '/admin/refunds', '/admin/support', '/admin/reviews', '/admin/catalog', '/admin/vendors', "/admin/vendors/{$vendor->id}",
            '/admin/drivers', "/admin/drivers/{$driver->id}", '/admin/zones', '/admin/users', "/admin/users/{$customer->id}", '/admin/staff',
            '/admin/home-builder', '/admin/rewards-promos', '/admin/campaigns', '/admin/payouts', '/admin/reports', '/admin/audit', '/admin/pos', '/admin/kitchen', '/admin/catering', '/admin/hampers', '/admin/companies',
            '/admin/search?q=ZV', '/admin/orders/export', '/admin/users/export', '/admin/reports/export/orders',
        ];
        foreach (array_keys(config('zvino_settings')) as $g) {
            $urls[] = "/admin/settings/$g";
        }
        $urls[] = '/admin/settings/pages';
        $urls[] = '/admin/settings/templates';

        foreach ($urls as $url) {
            $this->actingAs($admin)->get($url)->assertOk();
        }
    }

    public function test_roles_only_reach_their_screens()
    {
        $this->actingAs($this->staff('cashier'))->get('/dashboard')->assertRedirect(route('admin.pos'));
        $this->actingAs($this->staff('cashier'))->get('/admin/catalog')->assertForbidden();
        $this->actingAs($this->staff('kitchen'))->get('/dashboard')->assertRedirect(route('admin.kitchen'));
        $this->actingAs($this->staff('kitchen'))->get('/admin/pos')->assertForbidden();
        $this->actingAs($this->staff('vendor_manager'))->get('/admin/vendors')->assertForbidden();
        $this->actingAs(User::where('role', 'customer')->first())->get('/dashboard')->assertForbidden();
    }

    public function test_vendor_manager_cannot_edit_another_vendors_items()
    {
        $other = Item::where('vendor_id', '!=', $this->staff('vendor_manager')->vendor_id)->first();
        $this->actingAs($this->staff('vendor_manager'))->patch("/admin/catalog/items/{$other->id}/toggle")->assertForbidden();
    }

    public function test_pos_sale_lands_on_kitchen_display_and_advances()
    {
        $cashier = $this->staff('cashier');
        $item = Item::where('vendor_id', $cashier->vendor_id)->first();

        $this->actingAs($cashier)->post('/admin/pos/sales', [
            'vendor_id' => $cashier->vendor_id, 'method' => 'cash',
            'lines' => [['item_id' => $item->id, 'quantity' => 2]],
        ])->assertSessionHas('success');

        $order = Order::where('source', 'pos')->firstOrFail();
        $this->assertSame('paid', $order->payment_status);
        $this->assertEquals($item->effectivePrice() * 2, $order->total_zig);

        $kitchen = $this->staff('kitchen');
        $this->actingAs($kitchen)->get('/admin/kitchen')->assertInertia(fn ($p) => $p->component('admin/kitchen')->where('tickets.0.reference', $order->reference));

        $this->actingAs($kitchen)->patch("/admin/api/orders/{$order->id}/stage");
        $this->assertSame('cooking', $order->fresh()->kitchen_stage);
        $this->actingAs($kitchen)->patch("/admin/api/orders/{$order->id}/stage");
        $this->assertSame('ready', $order->fresh()->kitchen_stage);
        $this->actingAs($kitchen)->patch("/admin/api/orders/{$order->id}/stage");
        $this->assertSame('delivered', $order->fresh()->status); // dine-in: handed over
    }

    public function test_platform_mode_switch_and_home_builder_reorder()
    {
        $admin = $this->staff('super_admin');
        $vendor = Vendor::first();

        $this->actingAs($admin)->post('/admin/settings-platform-mode', ['mode' => 'single', 'single_vendor_id' => $vendor->id])->assertSessionHas('success');
        $this->getJson('/api/config')->assertJsonPath('platform_mode', 'single')->assertJsonPath('single_vendor_id', $vendor->id);
        $this->actingAs($admin)->get('/admin/vendors')->assertRedirect(route('dashboard'));

        $ids = HomeBlock::orderBy('sort_order')->pluck('id')->reverse()->values()->all();
        $this->actingAs($admin)->post('/admin/home-builder/reorder', ['ids' => $ids]);
        $this->assertSame($ids, HomeBlock::orderBy('sort_order')->pluck('id')->all());
    }
}

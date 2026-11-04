<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\Order;
use App\Models\Payout;
use App\Models\RecurringOrder;
use App\Models\User;
use App\Models\Vendor;
use App\Services\CartService;
use App\Services\OrderService;
use App\Services\RecurringOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Split the bill, prescriptions, recurring orders, same-day store payout, counter QR, voice notes, data-light images. */
class OriginalsFourTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Vendor $vendor;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-04 12:00:00');
        Cache::flush();
        $this->seed();
        Http::fake();
        Event::fake([OrderUpdated::class, DriverOfferCreated::class]);
        $this->user = User::where('phone', '+263771234567')->first();
        $this->vendor = User::where('email', 'manager@zvino.co.zw')->first()->vendor;
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        if (isset($server['HTTP_AUTHORIZATION'])) {
            $this->app['auth']->forgetGuards();
        }

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function login(string $phone): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => $phone]);

        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/otp/verify', ['phone' => $phone, 'code' => '123456'])->json('token')];
    }

    private function staff(string $email): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => $email, 'password' => 'password'])->json('token')];
    }

    private function address()
    {
        return $this->user->addresses()->firstOrCreate(['line1' => '5 Fife Ave'], ['city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045]);
    }

    private function realPaynow(): void
    {
        config(['zvino.paynow.fake' => false, 'zvino.paynow.integration_id' => '1', 'zvino.paynow.integration_key' => 'k']);
        Http::fake(['*' => Http::response('status=Ok&pollurl=https%3A%2F%2Fpaynow.test%2Fpoll&paynowreference=1', 200)]);
    }

    public function test_split_bill_waits_for_every_friend_then_releases()
    {
        $this->realPaynow();
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), 3, null, [], null, true);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'delivery', 'address_id' => $this->address()->id, 'payment_method' => 'ecocash', 'phone' => '+263771234567',
            'split_with' => [['phone' => '+263772222222', 'name' => 'Tino', 'amount' => 30], ['phone' => '+263773333333', 'name' => 'Rudo', 'amount' => 30]]]);

        $payments = $order->payments()->where('provider', 'paynow')->get();
        $this->assertCount(3, $payments);
        $this->assertEqualsWithDelta($order->total_zig, $payments->sum('amount_zig'), 0.01);
        $this->assertCount(3, $payments->map->reference()->unique()); // each share has its own Paynow reference

        $svc = app(OrderService::class);
        $host = $payments->first(fn ($p) => ! ($p->raw['split_share'] ?? false));
        $svc->markPaid($host);
        $this->assertSame('pending_payment', $order->fresh()->status);
        $this->assertSame('partially_paid', $order->fresh()->payment_status);

        $payments->filter(fn ($p) => $p->raw['split_share'] ?? false)->each(fn ($p) => $svc->markPaid($p->fresh()));
        $this->assertNotSame('pending_payment', $order->fresh()->status);
        $this->assertSame('paid', $order->fresh()->payment_status);

        // Store declines: host's part to wallet, friends' parts queued back to their phones.
        $o = $order->fresh();
        if ($o->status === 'placed') {
            $svc->reject($o, 'Out of stock');
        } else {
            $svc->cancel($o, 'admin', 'Test');
        }
        $this->assertEqualsWithDelta($host->amount_zig, $this->user->walletBalance(), 0.01);
        $this->assertSame(2, $order->refunds()->where('destination', 'original')->count());
    }

    public function test_split_bill_needs_mobile_money_and_room_for_the_host()
    {
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), 1, null, [], null, true);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '+263771234567',
            'split_with' => [['phone' => '+263772222222', 'amount' => 100000]]]);
    }

    public function test_prescription_required_and_viewable_only_by_the_store()
    {
        Storage::fake('local');
        $item = $this->vendor->items()->first();
        $item->update(['requires_prescription' => true]);
        app(CartService::class)->add($this->user, $item->fresh(), 1, null, [], null, true);

        try {
            app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '+263771234567']);
            $this->fail('Prescription should be required');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertArrayHasKey('prescription', $e->errors());
        }

        $h = $this->login('+263771234567');
        $token = $this->post('/api/prescriptions', ['photo' => UploadedFile::fake()->image('rx.jpg')], $h + ['Accept' => 'application/json'])->assertCreated()->json('token');
        $this->assertNull(\App\Support\PrescriptionStore::resolve($token, User::where('role', 'driver')->first())); // not transferable

        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '+263771234567', 'prescription' => $token]);
        $this->assertNotNull($order->prescription_path);

        $this->get("/api/merchant/orders/{$order->id}/prescription", $this->staff('manager@zvino.co.zw'))->assertOk();
        $foreignVendor = Vendor::where('id', '!=', $this->vendor->id)->first();
        User::create(['name' => 'Other mgr', 'email' => 'other@zvino.co.zw', 'password' => 'password', 'role' => 'vendor_manager', 'vendor_id' => $foreignVendor->id]);
        $this->get("/api/merchant/orders/{$order->id}/prescription", $this->staff('other@zvino.co.zw'))->assertNotFound();
    }

    public function test_recurring_lunch_plan_places_a_scheduled_order_and_keeps_the_basket()
    {
        $item = $this->vendor->items()->first();
        $this->vendor->update(['accepts_scheduled' => true]);
        $this->user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => 2000, 'reason' => 'Top-up']);
        // Something unrelated sitting in the live basket.
        $other = Vendor::where('id', '!=', $this->vendor->id)->where('city', 'Harare')->first() ?? $this->vendor;
        app(CartService::class)->add($this->user, $other->items()->first(), 1, null, [], null, true);

        $h = $this->login('+263771234567');
        $plan = $this->postJson('/api/plans', [
            'name' => 'Office lunch', 'vendor_id' => $this->vendor->id, 'kind' => 'weekly', 'weekdays' => [1, 2, 3, 4, 5], 'time' => '13:30',
            'fulfilment' => 'delivery', 'address_id' => $this->address()->id, 'payment_method' => 'wallet',
            'lines' => [['item_id' => $item->id, 'quantity' => 2]],
        ], $h)->assertCreated()->json();
        $this->assertStringStartsWith('2026-11-04T13:30', $plan['next_run_at']); // Wednesday, later today

        $this->assertSame(1, app(RecurringOrderService::class)->run());
        $order = Order::where('recurring_order_id', $plan['id'])->first();
        $this->assertNotNull($order);
        $this->assertSame('plan', $order->source);
        $this->assertSame('2026-11-04 13:30', $order->scheduled_for->format('Y-m-d H:i'));
        $this->assertSame('2026-11-05 13:30', RecurringOrder::find($plan['id'])->next_run_at->format('Y-m-d H:i'));

        // The customer's own basket is untouched.
        $cart = app(CartService::class)->for($this->user);
        $this->assertSame($other->id, $cart->vendor_id);
        $this->assertSame(1, $cart->items->count());

        $this->postJson("/api/plans/{$plan['id']}/skip", [], $h)->assertOk();
        $this->assertSame('2026-11-06 13:30', RecurringOrder::find($plan['id'])->next_run_at->format('Y-m-d H:i'));
    }

    public function test_monthly_plan_dates()
    {
        $p = new RecurringOrder(['kind' => 'monthly', 'day_of_month' => 25, 'time' => '10:00']);
        $this->assertSame('2026-11-25 10:00', $p->computeNext(Carbon::parse('2026-11-04 12:00'))->format('Y-m-d H:i'));
        $this->assertSame('2026-12-25 10:00', $p->computeNext(Carbon::parse('2026-11-25 10:00'))->format('Y-m-d H:i'));
    }

    public function test_store_same_day_payout()
    {
        $this->vendor->ledger()->create(['type' => 'earning', 'amount_zig' => 500, 'description' => 'Sales']);
        $mh = $this->staff('manager@zvino.co.zw');
        $this->getJson('/api/merchant/earnings', $mh)->assertOk()->assertJsonPath('available_now.zig', 500);
        $this->postJson('/api/merchant/payout-now', [], $mh)->assertCreated()->assertJsonPath('amount.zig', 490);
        $this->assertTrue(Payout::where('account_type', $this->vendor->getMorphClass())->where('is_instant', true)->exists());
        $this->postJson('/api/merchant/payout-now', [], $this->staff('cashier@zvino.co.zw'))->assertForbidden();
    }

    public function test_counter_qr_sale_waits_for_payment()
    {
        $ch = $this->staff('cashier@zvino.co.zw');
        $r = $this->postJson('/api/merchant/pos/sales', ['method' => 'qr', 'lines' => [['item_id' => $this->vendor->items()->first()->id, 'quantity' => 1]]], $ch)->assertCreated();
        $this->assertNotNull($r->json('qr_url'));
        $this->getJson('/api/merchant/payments/'.$r->json('payment_id'), $ch)->assertOk()->assertJsonPath('status', 'pending');

        // Demo page "pays" it (simulated gateway only).
        $this->get(parse_url($r->json('qr_url'), PHP_URL_PATH).'?'.parse_url($r->json('qr_url'), PHP_URL_QUERY))->assertOk();
        $this->getJson('/api/merchant/payments/'.$r->json('payment_id'), $ch)->assertJsonPath('status', 'paid');
    }

    public function test_voice_note_and_resized_images()
    {
        Storage::fake('public');
        $h = $this->login('+263771234567');
        $a = $this->address();
        $this->post("/api/addresses/{$a->id}/media", ['voice_note' => UploadedFile::fake()->create('d.m4a', 200, 'audio/mp4')], $h + ['Accept' => 'application/json'])->assertOk();
        $this->assertNotNull($a->fresh()->voice_note_path);

        Storage::disk('public')->put('items/test.jpg', UploadedFile::fake()->image('x.jpg', 1200, 800)->getContent());
        $this->get('/img/320/items/test.jpg')->assertRedirect('/storage/thumbs/320/items/test.jpg');
        [$w] = getimagesizefromstring(Storage::disk('public')->get('thumbs/320/items/test.jpg'));
        $this->assertSame(320, $w);
        $this->get('/img/999/items/test.jpg')->assertNotFound();
        $this->get('/img/320/../.env')->assertNotFound();
    }
}

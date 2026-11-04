<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\Driver;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\CartService;
use App\Services\DispatchService;
use App\Services\DriverTierService;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Split tender, charity round-up, no-cutlery, dietary search, driver tiers, instant cash-out, store promos. */
class OriginalsTwoTest extends TestCase
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
        $this->vendor = Vendor::where('city', 'Harare')->first();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $this->app['auth']->forgetGuards();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function order(array $extra = [], int $qty = 2): Order
    {
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), $qty, null, [], null, true);
        $address = $this->user->addresses()->firstOrCreate(['line1' => '5 Fife Ave'], ['city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045]);
        [$order] = app(OrderService::class)->placeFromCart($this->user, $extra + ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => 'ecocash', 'phone' => '+263771234567']);

        return $order->fresh();
    }

    private function login(string $phone): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => $phone]);

        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/otp/verify', ['phone' => $phone, 'code' => '123456'])->json('token')];
    }

    private function credit(float $zig): void
    {
        $this->user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => $zig, 'reason' => 'Test top-up']);
    }

    private function staff(string $email): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => $email, 'password' => 'password'])->json('token')];
    }

    public function test_split_tender_uses_wallet_then_mobile_money()
    {
        $this->credit(30);
        $order = $this->order(['use_wallet' => true]);

        $this->assertEquals(30, $order->wallet_applied_zig);
        $this->assertEqualsWithDelta(0, $this->user->walletBalance(), 0.001);
        $this->assertEqualsWithDelta($order->total_zig - 30, $order->payments()->where('method', 'ecocash')->value('amount_zig'), 0.01);
        $this->assertSame('paid', $order->payment_status);
    }

    public function test_split_tender_covering_everything_becomes_a_wallet_order()
    {
        $this->credit(5000);
        $order = $this->order(['use_wallet' => true]);
        $this->assertSame('wallet', $order->payment_method);
        $this->assertEquals(0, $order->wallet_applied_zig);
    }

    public function test_split_cash_order_driver_collects_only_the_balance()
    {
        $this->credit(40);
        $order = $this->order(['use_wallet' => true, 'payment_method' => 'cash']);
        $this->assertEqualsWithDelta($order->total_zig - 40, $order->cashDue(), 0.01);
    }

    public function test_split_cash_and_ecocash_driver_collects_cash_part()
    {
        $order = $this->order(['cash_part' => 50]);

        $this->assertEquals(50, $order->cash_part_zig);
        $this->assertEqualsWithDelta($order->total_zig - 50, $order->payments()->where('method', 'ecocash')->value('amount_zig'), 0.01);
        $this->assertSame('pending_cash', $order->payment_status); // EcoCash part paid, cash still to collect
        $this->assertEquals(50, $order->cashDue());

        $driver = Driver::first();
        $order->update(['driver_id' => $driver->id]);
        $svc = app(OrderService::class);
        if ($order->fresh()->status === 'placed') {
            $svc->accept($order->fresh(), 10);
        }
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'delivered');

        $this->assertSame('paid', $order->fresh()->payment_status);
        $this->assertEquals(50, $driver->fresh()->cashHeld());
    }

    public function test_cancelled_split_order_refunds_only_what_was_paid()
    {
        $order = $this->order(['cash_part' => 50]);
        app(OrderService::class)->cancel($order->fresh(), 'admin', 'Test');

        $this->assertEqualsWithDelta($order->total_zig - 50, $this->user->walletBalance(), 0.01);
        $this->assertSame('cancelled', $order->payments()->where('method', 'cash')->value('status'));
    }

    public function test_cash_part_cannot_cover_the_whole_order()
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->order(['cash_part' => 100000]);
    }

    public function test_wallet_part_is_returned_when_payment_is_never_completed()
    {
        config(['zvino.paynow.fake' => false, 'zvino.paynow.integration_id' => '1', 'zvino.paynow.integration_key' => 'k']);
        $this->credit(30);
        $order = $this->order(['use_wallet' => true]);
        $this->assertSame('pending_payment', $order->status);
        $this->assertEqualsWithDelta(0, $this->user->walletBalance(), 0.001);

        Carbon::setTestNow(now()->addMinutes(31));
        app(OrderService::class)->expireUnpaid();

        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertEqualsWithDelta(30, $this->user->walletBalance(), 0.001);
    }

    public function test_charity_round_up_and_no_cutlery()
    {
        Setting::put('orders.charity_round_to_zig', 5);
        $order = $this->order(['round_up' => true, 'no_cutlery' => true]);

        $this->assertTrue($order->no_cutlery);
        $this->assertGreaterThanOrEqual(0, $order->donation_zig);
        $this->assertLessThan(5, $order->donation_zig);
        $this->assertEqualsWithDelta(0, fmod(round($order->total_zig, 2), 5), 0.001);
    }

    public function test_quote_offers_round_up_and_split_tender()
    {
        $h = $this->login('+263771234567');
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), 1, null, [], null, true);

        $this->postJson('/api/checkout/quote', ['fulfilment' => 'pickup'], $h)->assertOk()
            ->assertJsonPath('split_tender', true)
            ->assertJsonPath('round_up.charity', Setting::get('orders.charity_name'));
    }

    public function test_dietary_search_filters_items()
    {
        $res = $this->getJson('/api/search?dietary=vegetarian')->assertOk();
        $this->assertNotEmpty($res->json('items'));
        foreach ($res->json('items') as $item) {
            $this->assertContains('vegetarian', $item['dietary']);
        }
    }

    public function test_driver_tiers_promote_and_boost_pay()
    {
        $driver = Driver::first();
        $driver->update(['completed_deliveries' => 300, 'rating' => 4.9, 'acceptance_rate' => 95]);
        $this->assertSame('gold', app(DriverTierService::class)->refresh($driver));
        $this->assertSame('gold', $driver->fresh()->tier);

        $driver->update(['is_online' => true, 'lat' => $this->vendor->lat, 'lng' => $this->vendor->lng, 'location_updated_at' => now()]);
        Setting::put('delivery.dispatch_when', 'accepted');
        $order = $this->order();
        app(OrderService::class)->accept($order, 15);
        $offer = $order->dispatchOffers()->first();

        $this->assertNotNull($offer);
        $this->assertEqualsWithDelta($order->driver_pay_zig * 1.10, $offer->pay_zig, 0.02);
    }

    public function test_driver_instant_cash_out()
    {
        $driver = Driver::first();
        $driver->ledger()->create(['type' => 'earning', 'amount_zig' => 200, 'description' => 'Test trips']);
        $h = $this->login('+263772000001');

        $this->getJson('/api/driver/earnings', $h)->assertOk()->assertJsonPath('available_to_cash_out.zig', 200);
        $this->postJson('/api/driver/cashout', ['phone' => '+263772000001'], $h)->assertCreated()
            ->assertJsonPath('amount.zig', 196)->assertJsonPath('fee.zig', 4);

        $this->assertTrue(\App\Models\Payout::where('is_instant', true)->exists());
        $this->postJson('/api/driver/cashout', [], $h)->assertStatus(422); // nothing left
    }

    public function test_driver_cannot_cash_out_while_holding_cash()
    {
        $driver = Driver::first();
        $driver->ledger()->create(['type' => 'earning', 'amount_zig' => 500, 'description' => 'Trips']);
        $driver->ledger()->create(['type' => 'cash_collected', 'amount_zig' => -100, 'description' => 'COD']);
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(\App\Services\PayoutService::class)->instantCashOut($driver);
    }

    public function test_store_manager_creates_promo_used_at_checkout_and_funded_by_store()
    {
        $mh = $this->staff('manager@zvino.co.zw');
        $this->postJson('/api/merchant/promos', ['code' => 'rudo10', 'type' => 'percent', 'value' => 80], $mh)->assertStatus(422); // over the cap
        $this->postJson('/api/merchant/promos', ['code' => 'rudo10', 'title' => '10% off', 'type' => 'percent', 'value' => 10], $mh)->assertCreated()->assertJsonPath('code', 'RUDO10');
        $this->postJson('/api/merchant/promos', ['code' => 'nope', 'type' => 'fixed', 'value' => 5], $this->staff('cashier@zvino.co.zw'))->assertForbidden();

        $manager = User::where('email', 'manager@zvino.co.zw')->first();
        $this->vendor = $manager->vendor;
        $cart = app(CartService::class);
        $cart->add($this->user, $this->vendor->items()->first(), 3, null, [], null, true);
        $cart->for($this->user)->update(['promo_code_id' => \App\Models\PromoCode::where('code', 'RUDO10')->value('id')]);
        $address = $this->user->addresses()->firstOrCreate(['line1' => '5 Fife Ave'], ['city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045]);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '+263771234567']);
        $this->assertGreaterThan(0, $order->discount_zig);

        $svc = app(OrderService::class);
        if ($order->fresh()->status === 'placed') {
            $svc->accept($order->fresh(), 10);
        }
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'delivered');

        $this->assertTrue($this->vendor->ledger()->where('type', 'adjustment')->where('order_id', $order->id)->exists());
        $this->getJson('/api/merchant/promos', $mh)->assertOk()->assertJsonPath('promos.0.orders', 1);
    }
}

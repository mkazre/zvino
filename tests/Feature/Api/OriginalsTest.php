<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Models\Zone;
use App\Services\OrderService;
use App\Services\PricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/** Zvino-original features: hot-meal guarantee, fraud shield, fuel index, rain surge, SMS fallback. */
class OriginalsTest extends TestCase
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

    private function order(string $method = 'ecocash', int $qty = 2): Order
    {
        $cart = app(\App\Services\CartService::class);
        $cart->add($this->user, $this->vendor->items()->first(), $qty, null, [], null, true);
        $address = $this->user->addresses()->firstOrCreate(['line1' => '5 Fife Ave'], ['city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045]);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => $method, 'phone' => '+263771234567']);

        return $order;
    }

    public function test_hot_meal_guarantee_credits_wallet_when_late()
    {
        $svc = app(OrderService::class);
        $order = $this->order();
        $svc->accept($order, 20); // ETA ≈ now + prep + ride
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'picked_up');

        Carbon::setTestNow(now()->addMinutes(90));
        $svc->setStatus($order->fresh(), 'delivered');

        $credit = $this->user->walletTransactions()->where('reason', 'like', 'Hot-meal guarantee%')->first();
        $this->assertNotNull($credit);
        $this->assertLessThanOrEqual(Setting::get('orders.late_credit_max_zig'), $credit->amount_zig);
    }

    public function test_on_time_delivery_gets_no_credit()
    {
        $svc = app(OrderService::class);
        $order = $this->order();
        $svc->accept($order, 20);
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'delivered');
        $this->assertSame(0, $this->user->walletTransactions()->where('reason', 'like', 'Hot-meal%')->count());
    }

    public function test_fraud_shield_velocity_and_new_account_cod_limit()
    {
        Setting::put('fraud.max_orders_per_hour', 2);
        $this->order();
        $this->order();
        try {
            $this->order();
            $this->fail('Third order in an hour should be blocked');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertStringContainsString('lot of orders', $e->getMessage());
        }

        Carbon::setTestNow(now()->addHours(2));
        Setting::put('fraud.new_account_cod_limit_zig', 50);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->order('cash', 3); // > ZiG 50 and no delivered orders yet
    }

    public function test_fuel_index_scales_per_km_fees_and_driver_pay()
    {
        $pricing = app(PricingService::class);
        $zone = Zone::first();
        $before = $pricing->deliveryFee($this->vendor, $zone, 6);
        $pay = $pricing->driverPay(6);

        Setting::put('fees.fuel_index_enabled', true);
        Setting::put('fees.fuel_base_price_usd', 1.50);
        Setting::put('fees.fuel_current_price_usd', 1.80); // +20%

        $this->assertEqualsWithDelta(1.2, $pricing->fuelIndex(), 0.0001);
        $this->assertGreaterThan($before, $pricing->deliveryFee($this->vendor, $zone, 6));
        $this->assertGreaterThan($pay, $pricing->driverPay(6));
        $this->assertEquals($zone->base_delivery_fee_zig, $pricing->deliveryFee($this->vendor, $zone, 1)); // base fee unaffected
    }

    public function test_rain_mode_surges_every_zone_and_clears()
    {
        $admin = User::where('role', 'super_admin')->first();
        $this->actingAs($admin)->post('/admin/zones-rain', ['on' => true])->assertSessionHas('success');
        $this->assertTrue(Zone::where('is_active', true)->get()->every(fn ($z) => $z->surge_multiplier == Setting::get('fees.rain_surge')));
        $this->actingAs($admin)->post('/admin/zones-rain', ['on' => false]);
        $this->assertTrue(Zone::all()->every(fn ($z) => $z->surge_multiplier == 1));
    }

    public function test_forged_paynow_webhook_is_rejected_in_production()
    {
        $order = $this->order('cash');
        $payment = $order->payments()->create(['provider' => 'paynow', 'method' => 'ecocash', 'amount_zig' => $order->total_zig, 'status' => 'pending']);
        $order->update(['payment_status' => 'pending']);

        $this->app['env'] = 'production';
        config(['zvino.paynow.fake' => true]); // even with fake left on by mistake

        $this->post('/api/payments/webhook/paynow', ['reference' => $order->reference, 'status' => 'Paid', 'hash' => 'FORGED'])->assertStatus(400);
        $this->assertSame('pending', $payment->fresh()->status);
    }

    public function test_sms_fallback_for_customers_without_the_app()
    {
        Log::spy();
        Setting::put('notifications.sms_provider', 'log');
        $order = $this->order();
        app(OrderService::class)->accept($order, 15);
        Log::shouldHaveReceived('info')->withArgs(fn ($msg) => str_contains($msg, 'SMS → +263771234567') && str_contains($msg, $order->reference))->atLeast()->once();
    }
}

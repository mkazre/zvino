<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\Address;
use App\Models\Driver;
use App\Models\GiftCard;
use App\Models\Item;
use App\Models\Order;
use App\Models\Setting;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\Vendor;
use App\Services\DispatchService;
use App\Services\OrderService;
use App\Services\StoreAvailability;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PlatformFlowTest extends TestCase
{
    use RefreshDatabase;

    private Vendor $vendor;
    private array $h;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-11-04 12:00:00')); // Wednesday lunchtime
        Cache::flush();
        $this->seed();
        Http::fake();
        Event::fake([OrderUpdated::class, DriverOfferCreated::class, \App\Events\DriverLocationUpdated::class, \App\Events\OrderMessageSent::class]);

        $this->vendor = Vendor::where('city', 'Harare')->first();
        $this->h = $this->login('0771234567');
    }

    /** Each request re-resolves the bearer token (tests switch between customer, driver and staff). */
    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        $this->app['auth']->forgetGuards();

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function login(string $phone): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => $phone]);
        $token = $this->postJson('/api/auth/otp/verify', ['phone' => $phone, 'code' => '123456'])->json('token');

        return ['Authorization' => "Bearer $token"];
    }

    private function driverHeaders(): array
    {
        return $this->login('0772000001');
    }

    private function address(float $lat = -17.8100, float $lng = 31.0450): int
    {
        return $this->postJson('/api/addresses', ['line1' => '5 Fife Ave', 'landmark' => 'Opposite OK Mart, blue gate', 'city' => 'Harare', 'lat' => $lat, 'lng' => $lng], $this->h)->json('id');
    }

    private function fillCart(int $qty = 2): void
    {
        $item = $this->vendor->items()->first();
        $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => $qty], $this->h)->assertCreated();
    }

    private function placeOrder(array $extra = []): Order
    {
        $this->fillCart();
        $res = $this->postJson('/api/orders', $extra + [
            'fulfilment' => 'delivery', 'address_id' => $this->address(), 'payment_method' => 'ecocash', 'phone' => '0771234567', 'tip' => 10,
        ], $this->h)->assertCreated();

        return Order::findOrFail($res->json('order.id'));
    }

    // ── Pricing ──────────────────────────────────────────────────────

    public function test_delivery_fee_scales_with_distance_and_zone()
    {
        $this->fillCart();
        $near = $this->postJson('/api/checkout/quote', ['fulfilment' => 'delivery', 'lat' => -17.8295, 'lng' => 31.0525], $this->h)->assertOk();
        $far = $this->postJson('/api/checkout/quote', ['fulfilment' => 'delivery', 'lat' => -17.7950, 'lng' => 31.0700], $this->h)->assertOk();
        $pickup = $this->postJson('/api/checkout/quote', ['fulfilment' => 'pickup'], $this->h)->assertOk();

        $this->assertEquals(15, $near->json('totals.delivery.zig')); // within free km → base fee
        $this->assertGreaterThan(15, $far->json('totals.delivery.zig'));
        $this->assertEquals(0, $pickup->json('totals.delivery.zig'));
        $this->assertGreaterThan(0, $near->json('totals.service.zig'));
    }

    public function test_too_far_addresses_are_refused()
    {
        $this->fillCart();
        $this->postJson('/api/checkout/quote', ['fulfilment' => 'delivery', 'lat' => -18.20, 'lng' => 31.55], $this->h)->assertStatus(422);
    }

    public function test_zvino_plus_gives_free_delivery_and_half_service_fee()
    {
        $user = User::where('phone', '+263771234567')->first();
        $user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => 500, 'reason' => 'test']);
        $this->postJson('/api/zvino-plus', ['plan_id' => SubscriptionPlan::first()->id, 'method' => 'wallet'], $this->h)->assertCreated();

        $this->fillCart(2);
        $quote = $this->postJson('/api/checkout/quote', ['fulfilment' => 'delivery', 'lat' => -17.81, 'lng' => 31.045], $this->h)->json();
        $this->assertEquals(0, $quote['totals']['delivery']['zig']);
        $this->assertGreaterThan(0, $quote['totals']['member_savings']['zig']);
    }

    // ── Store availability ───────────────────────────────────────────

    public function test_store_hours_closures_and_overnight_shifts()
    {
        $svc = app(StoreAvailability::class);
        $this->assertTrue($svc->isOpen($this->vendor));
        $this->assertFalse($svc->isOpen($this->vendor, Carbon::parse('2026-11-04 23:30')));        // Wed closes 23:00
        $this->assertTrue($svc->isOpen($this->vendor, Carbon::parse('2026-11-07 01:30')));         // Fri night → Sat 01:30 still open
        $this->vendor->closures()->create(['date' => '2026-11-04', 'reason' => 'Staff day']);
        $this->assertSame('holiday', $svc->status($this->vendor->fresh())['reason']);
    }

    public function test_closed_store_rejects_checkout_but_allows_scheduling()
    {
        $this->vendor->update(['paused_until' => now()->addHour()]);
        $this->fillCart();
        $address = $this->address();

        $this->postJson('/api/orders', ['fulfilment' => 'delivery', 'address_id' => $address, 'payment_method' => 'cash'], $this->h)
            ->assertStatus(422)->assertJsonFragment(['cart' => ["{$this->vendor->name} isn’t taking orders right now. Opens Wed 13:00. You can schedule for later."]]);

        $res = $this->postJson('/api/orders', ['fulfilment' => 'delivery', 'address_id' => $address, 'payment_method' => 'cash', 'scheduled_for' => '2026-11-04 18:30'], $this->h)->assertCreated();
        $order = Order::find($res->json('order.id'));
        $this->assertSame('scheduled', $order->status);

        Carbon::setTestNow('2026-11-04 17:50');
        $this->vendor->update(['paused_until' => null]);
        app(OrderService::class)->releaseScheduled();
        $this->assertSame('placed', $order->fresh()->status);
    }

    public function test_load_shedding_hides_power_items_and_adds_prep_time()
    {
        $grill = Vendor::where('cuisine', 'Grills')->first();
        $grill->update(['power_out' => true]);
        $item = $grill->items()->where('needs_power', true)->first();

        $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => 1], $this->h)->assertStatus(422);
        $this->assertSame($grill->prep_minutes + $grill->power_out_extra_minutes, app(StoreAvailability::class)->prepMinutes($grill));
    }

    // ── Full delivery: store → dispatch → driver → ledger ────────────

    public function test_full_delivery_with_auto_dispatch_pin_and_ledger()
    {
        Setting::put('delivery.require_delivery_pin', true);
        $order = $this->placeOrder();
        $this->assertSame('placed', $order->status);
        $this->assertNotNull($order->delivery_pin);
        $this->assertEquals(10, $order->tip_zig);

        // Driver comes online near the store.
        $dh = $this->driverHeaders();
        $this->postJson('/api/driver/online', ['is_online' => true, 'lat' => -17.8300, 'lng' => 31.0500], $dh)->assertOk();

        // Store accepts via merchant app → dispatch offers to the driver.
        $mh = ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => 'manager@zvino.co.zw', 'password' => 'password'])->json('token')];
        $this->postJson("/api/merchant/orders/{$order->id}/accept", ['prep_minutes' => 20], $mh)->assertOk()->assertJsonPath('data.status', 'accepted');

        $offers = $this->getJson('/api/driver/offers', $dh)->assertOk()->json();
        $this->assertCount(1, $offers);
        $this->assertEquals($order->driver_pay_zig + 10, $offers[0]['pay']['zig']);

        $this->postJson("/api/driver/offers/{$offers[0]['id']}/accept", [], $dh)->assertOk();
        $this->assertNotNull($order->fresh()->driver_id);

        $this->postJson("/api/driver/jobs/{$order->id}/pickup", [], $dh)->assertOk()->assertJsonPath('status', 'picked_up');
        $this->postJson("/api/driver/location", ['lat' => -17.8101, 'lng' => 31.0451], $dh)->assertOk();
        $this->assertSame('arriving', $order->fresh()->status);

        $this->postJson("/api/driver/jobs/{$order->id}/deliver", ['pin' => '0000' === $order->delivery_pin ? '1111' : '0000'], $dh)->assertStatus(422);
        $this->postJson("/api/driver/jobs/{$order->id}/deliver", ['pin' => $order->delivery_pin], $dh)->assertOk();

        $order->refresh();
        $this->assertSame('delivered', $order->status);
        $driver = Driver::first();
        $this->assertEquals($order->driver_pay_zig + 10, $driver->balance());
        $this->assertEquals($order->subtotal_zig - $order->commission_zig, $this->vendor->fresh()->balance());

        // Customer rates; driver and store ratings update.
        $this->postJson("/api/orders/{$order->id}/review", ['vendor_rating' => 5, 'driver_rating' => 4, 'comment' => 'Hot and fast'], $this->h)->assertCreated();
        $this->assertSame(1, $this->vendor->fresh()->rating_count);
    }

    public function test_declined_offer_goes_to_next_driver_and_expired_offers_are_swept()
    {
        $second = User::create(['name' => 'Tino', 'phone' => '+263772000002', 'role' => 'driver']);
        Driver::create(['user_id' => $second->id, 'status' => 'approved', 'is_online' => true, 'lat' => -17.835, 'lng' => 31.055, 'location_updated_at' => now()]);
        Driver::first()->update(['is_online' => true, 'lat' => -17.8295, 'lng' => 31.0525, 'location_updated_at' => now()]);

        $order = $this->placeOrder();
        app(OrderService::class)->accept($order, 15);

        $first = $order->dispatchOffers()->first();
        $this->assertSame(Driver::first()->id, $first->driver_id); // nearest first
        app(DispatchService::class)->decline($first);
        $this->assertSame($second->driver->id, $order->dispatchOffers()->latest('id')->first()->driver_id);

        Carbon::setTestNow(now()->addMinutes(2));
        app(DispatchService::class)->sweep();
        $this->assertSame('expired', $order->dispatchOffers()->latest('id')->first()->status);
    }

    public function test_cash_order_records_cash_held_and_blocks_driver_over_limit()
    {
        Driver::first()->update(['is_online' => true, 'lat' => -17.8295, 'lng' => 31.0525, 'location_updated_at' => now()]);
        $this->fillCart();
        $res = $this->postJson('/api/orders', ['fulfilment' => 'delivery', 'address_id' => $this->address(), 'payment_method' => 'cash'], $this->h)->assertCreated();
        $order = Order::find($res->json('order.id'));

        $svc = app(OrderService::class);
        $svc->accept($order, 10);
        app(DispatchService::class)->accept($order->dispatchOffers()->first());
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'picked_up');

        $dh = $this->driverHeaders();
        $this->postJson("/api/driver/jobs/{$order->id}/deliver", ['change_to_wallet_zig' => 5], $dh)->assertOk();
        $driver = Driver::first();
        $this->assertEquals($order->fresh()->total_zig, $driver->cashHeld());
        $this->assertEquals(5, User::where('phone', '+263771234567')->first()->walletBalance());

        Setting::put('delivery.driver_cash_limit_zig', 10);
        $this->postJson('/api/driver/online', ['is_online' => true, 'lat' => -17.83, 'lng' => 31.05], $dh)->assertStatus(422);
        $this->postJson('/api/driver/cash/remit', ['phone' => '0772000001', 'method' => 'ecocash'], $dh)->assertOk();
        $this->assertEquals(0, $driver->fresh()->cashHeld());
    }

    // ── Store reject / customer cancel / auto-cancel ─────────────────

    public function test_store_reject_refunds_to_wallet()
    {
        $order = $this->placeOrder();
        $mh = ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => 'manager@zvino.co.zw', 'password' => 'password'])->json('token')];
        $this->postJson("/api/merchant/orders/{$order->id}/reject", ['reason' => 'power_outage'], $mh)->assertOk();

        $this->assertSame('rejected', $order->fresh()->status);
        $this->assertEquals($order->total_zig, User::where('phone', '+263771234567')->first()->walletBalance());
    }

    public function test_unconfirmed_orders_auto_cancel_and_customer_cancel_window()
    {
        $order = $this->placeOrder();
        Carbon::setTestNow(now()->addMinutes(10));
        app(OrderService::class)->cancelUnaccepted();
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertSame('system', $order->fresh()->cancelled_by);

        Carbon::setTestNow('2026-11-04 12:30');
        $second = $this->placeOrder();
        app(OrderService::class)->accept($second, 20);
        Carbon::setTestNow(now()->addMinutes(5));
        $this->postJson("/api/orders/{$second->id}/cancel", ['reason' => 'changed mind'], $this->h)->assertStatus(422);
    }

    // ── Refunds, chat, favourites ────────────────────────────────────

    public function test_small_missing_item_refund_is_auto_approved_to_wallet()
    {
        $order = $this->placeOrder();
        $svc = app(OrderService::class);
        foreach (['accepted' => fn () => $svc->accept($order, 10), 'ready' => null, 'delivered' => null] as $s => $fn) {
            $fn ? $fn() : $svc->setStatus($order->fresh(), $s);
        }

        $this->postJson("/api/orders/{$order->id}/refund", ['reason' => 'missing_items', 'items' => ['Covo'], 'amount_zig' => 25], $this->h)
            ->assertCreated()->assertJsonPath('status', 'paid');
        $this->assertEquals(25, User::where('phone', '+263771234567')->first()->walletBalance());
        $this->assertSame('partially_refunded', $order->fresh()->payment_status);
    }

    public function test_order_chat_between_customer_and_driver()
    {
        Driver::first()->update(['is_online' => true, 'lat' => -17.8295, 'lng' => 31.0525, 'location_updated_at' => now()]);
        $order = $this->placeOrder();
        app(OrderService::class)->accept($order, 10);
        app(DispatchService::class)->accept($order->dispatchOffers()->first());

        $this->postJson("/api/orders/{$order->id}/messages", ['body' => 'Blue gate, please hoot'], $this->h)->assertCreated();
        $this->postJson("/api/orders/{$order->id}/messages", ['body' => 'Sharp, 5 min'], $this->driverHeaders())->assertCreated();
        $this->getJson("/api/orders/{$order->id}/messages", $this->h)->assertOk()->assertJsonCount(2);
    }

    public function test_favorites_toggle()
    {
        $this->postJson("/api/vendors/{$this->vendor->id}/favorite", [], $this->h)->assertJsonPath('favorited', true);
        $this->getJson('/api/favorites', $this->h)->assertJsonCount(1, 'data');
        $this->postJson("/api/vendors/{$this->vendor->id}/favorite", [], $this->h)->assertJsonPath('favorited', false);
    }

    // ── Growth ───────────────────────────────────────────────────────

    public function test_referral_rewards_both_after_first_delivered_order()
    {
        $referrerH = $this->login('0773000003');
        $code = $this->getJson('/api/referral', $referrerH)->json('code');

        $this->postJson('/api/referral/apply', ['code' => $code], $this->h)->assertOk();
        $order = $this->placeOrder();
        $svc = app(OrderService::class);
        $svc->accept($order, 10);
        $svc->setStatus($order->fresh(), 'ready');
        $svc->setStatus($order->fresh(), 'delivered');

        $this->assertEquals(30, User::where('phone', '+263773000003')->first()->walletBalance());
        $this->assertEquals(30, User::where('phone', '+263771234567')->first()->walletBalance());
    }

    public function test_gift_card_purchase_and_redeem()
    {
        $card = $this->postJson('/api/gift-cards', ['amount_zig' => 100, 'recipient_phone' => '0774000004', 'method' => 'ecocash', 'phone' => '0771234567'], $this->h)
            ->assertCreated()->assertJsonPath('status', 'active')->json();

        $friend = $this->login('0774000004');
        $this->postJson('/api/gift-cards/redeem', ['code' => $card['code']], $friend)->assertOk()->assertJsonPath('balance.zig', 100);
        $this->postJson('/api/gift-cards/redeem', ['code' => $card['code']], $friend)->assertStatus(422);
        $this->assertSame('redeemed', GiftCard::first()->status);
    }

    public function test_group_order_guests_add_items_and_host_checks_out()
    {
        $group = $this->postJson('/api/group-orders', ['vendor_id' => $this->vendor->id, 'spend_limit_zig' => 200], $this->h)->assertCreated()->json();
        $item = $this->vendor->items()->first();

        $this->postJson("/api/group-orders/{$group['code']}/items", ['item_id' => $item->id, 'quantity' => 1, 'guest_name' => 'Chipo'])->assertCreated();
        $this->postJson("/api/group-orders/{$group['code']}/items", ['item_id' => $item->id, 'quantity' => 1], $this->h)->assertCreated();
        $this->postJson("/api/group-orders/{$group['code']}/items", ['item_id' => $item->id, 'quantity' => 10, 'guest_name' => 'Chipo'])->assertStatus(422); // over limit

        $res = $this->postJson("/api/group-orders/{$group['code']}/checkout", [], $this->h)->assertOk();
        $this->assertCount(2, $res->json('cart.items'));

        $this->postJson('/api/orders', ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '0771234567', 'group_order_id' => $res->json('group_order_id')], $this->h)->assertCreated();
    }

    // ── Add-on groups, payouts, permissions ──────────────────────────

    public function test_required_modifier_groups_are_enforced_and_priced()
    {
        $item = $this->vendor->items()->whereNull('variants')->first() ?? $this->vendor->items()->first();
        $group = $this->vendor->modifierGroups()->create(['name' => 'Choose a side', 'min_select' => 1, 'max_select' => 1]);
        $group->options()->createMany([['name' => 'Chips', 'price_delta_zig' => 10], ['name' => 'Sadza', 'price_delta_zig' => 0]]);
        $item->modifierGroups()->attach($group->id);

        $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => 1], $this->h)->assertStatus(422);
        $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => 1, 'modifiers' => ['Chips', 'Sadza']], $this->h)->assertStatus(422);
        $res = $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => 1, 'modifiers' => ['Chips']], $this->h)->assertCreated();
        $this->assertEquals($item->effectivePrice() + 10, $res->json('items.0.unit_price.zig'));

        $this->getJson("/api/items/{$item->id}")->assertJsonPath('data.modifier_groups.0.required', true);
    }

    public function test_payouts_batch_store_and_driver_earnings()
    {
        Setting::put('payments.min_payout_zig', 1);
        $this->test_full_delivery_with_auto_dispatch_pin_and_ledger();

        $created = app(\App\Services\PayoutService::class)->generate(now()->addMinute());
        $this->assertSame(2, $created); // one store, one driver
        $payout = \App\Models\Payout::where('account_type', 'driver')->first();
        app(\App\Services\PayoutService::class)->markPaid($payout, User::where('role', 'super_admin')->first(), 'ECO-123');
        $this->assertEquals(0, Driver::first()->balance());
    }

    public function test_role_permissions_defaults_and_overrides()
    {
        $manager = User::where('role', 'vendor_manager')->first();
        $this->assertTrue($manager->can('catalog.manage'));
        $this->assertFalse($manager->can('settings.manage'));

        \App\Support\Permissions::set('vendor_manager', ['orders.view']);
        $this->assertFalse($manager->fresh()->can('catalog.manage'));
        $this->assertTrue(User::where('role', 'super_admin')->first()->can('settings.manage'));
    }

    // ── Merchant controls ────────────────────────────────────────────

    public function test_merchant_busy_pause_and_stock_controls()
    {
        $mh = ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => 'manager@zvino.co.zw', 'password' => 'password'])->json('token')];

        $this->patchJson('/api/merchant/store', ['is_busy' => true, 'busy_extra_minutes' => 20], $mh)->assertOk()
            ->assertJsonPath('availability.prep_minutes', $this->vendor->prep_minutes + 20);
        $this->patchJson('/api/merchant/store', ['pause_minutes' => 30], $mh)->assertJsonPath('availability.reason', 'paused');

        $item = $this->vendor->items()->first();
        $this->patchJson("/api/merchant/items/{$item->id}/availability", ['state' => 'off_today'], $mh)->assertOk();
        $this->assertFalse($item->fresh()->isOrderable());

        $cashier = ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => 'cashier@zvino.co.zw', 'password' => 'password'])->json('token')];
        $this->patchJson('/api/merchant/store', ['is_busy' => false], $cashier)->assertForbidden();
    }
}

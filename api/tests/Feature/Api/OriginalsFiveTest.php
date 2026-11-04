<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\AppNotification;
use App\Models\Driver;
use App\Models\Order;
use App\Models\PromoCode;
use App\Models\User;
use App\Models\Vendor;
use App\Models\Zone;
use App\Services\CartService;
use App\Services\DispatchService;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** BOGO & happy-hour deals, price-drop alerts, allergen filters, peri-urban batch runs. */
class OriginalsFiveTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Vendor $vendor;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-04 12:00:00'); // Wednesday
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
        if (isset($server['HTTP_AUTHORIZATION'])) {
            $this->app['auth']->forgetGuards();
        }

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function item()
    {
        $item = $this->vendor->items()->first();
        $item->update(['price_zig' => 50, 'special_price_zig' => null, 'variants' => null, 'modifiers' => null, 'sold_by' => 'unit']);

        return $item->fresh();
    }

    private function pickupQuote(int $qty): array
    {
        $cart = app(CartService::class);
        $cart->for($this->user)->items()->delete();
        $cart->add($this->user, $this->item(), $qty, null, [], null, true);

        return $cart->totals($cart->for($this->user), 'pickup');
    }

    public function test_bogo_deal_applies_automatically_and_is_store_funded()
    {
        $item = $this->item();
        PromoCode::create(['code' => 'BOGO1', 'type' => 'bogo', 'vendor_id' => $this->vendor->id, 'item_id' => $item->id, 'buy_qty' => 1, 'auto_apply' => true]);

        $t = $this->pickupQuote(3); // 3 × 50 → one free
        $this->assertEquals(50, $t['discount']);
        $this->assertStringContainsString('Buy 1 get 1 free', $t['deal']);

        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'ecocash', 'phone' => '+263771234567']);
        $this->assertSame(PromoCode::where('code', 'BOGO1')->value('id'), $order->promo_code_id);
        $this->assertSame(1, PromoCode::where('code', 'BOGO1')->value('used_count'));
    }

    public function test_happy_hour_only_in_its_window()
    {
        PromoCode::create(['code' => 'HAPPY', 'type' => 'percent', 'value' => 20, 'vendor_id' => $this->vendor->id, 'start_time' => '15:00', 'end_time' => '17:00', 'days' => [3], 'auto_apply' => true]);

        $this->assertEquals(0, $this->pickupQuote(2)['discount']); // 12:00
        Carbon::setTestNow('2026-11-04 15:30:00');
        $this->assertEquals(20, $this->pickupQuote(2)['discount']); // 20% of 100
        Carbon::setTestNow('2026-11-05 15:30:00'); // Thursday: not a happy-hour day
        $this->assertEquals(0, $this->pickupQuote(2)['discount']);
    }

    public function test_store_page_lists_deals()
    {
        PromoCode::create(['code' => 'HAPPY', 'type' => 'percent', 'value' => 20, 'vendor_id' => $this->vendor->id, 'start_time' => '15:00', 'end_time' => '17:00', 'auto_apply' => true]);
        $this->getJson("/api/vendors/{$this->vendor->id}/menu")->assertOk()
            ->assertJsonPath('deals.0.headline', 'Happy hour 15:00–17:00: 20% off')->assertJsonPath('deals.0.live', false);
    }

    public function test_price_drop_alert()
    {
        $item = $this->item();
        $this->postJson('/api/auth/otp/request', ['phone' => '+263771234567']);
        $h = ['Authorization' => 'Bearer '.$this->postJson('/api/auth/otp/verify', ['phone' => '+263771234567', 'code' => '123456'])->json('token')];
        $this->postJson("/api/items/{$item->id}/watch", [], $h)->assertCreated();

        $item->update(['price_zig' => 55]); // goes up: nothing
        $this->assertFalse(AppNotification::where('user_id', $this->user->id)->where('title', 'like', 'Price drop%')->exists());

        $item->update(['special_price_zig' => 40]);
        $this->assertTrue(AppNotification::where('user_id', $this->user->id)->where('title', 'like', 'Price drop%')->exists());
        $this->getJson('/api/watches', $h)->assertJsonPath('0.watched_at_zig', 40);
    }

    public function test_allergen_filter()
    {
        $res = $this->getJson('/api/search?dietary=nut_free,no_pork')->assertOk()->json('items');
        $this->assertNotEmpty($res);
        foreach ($res as $i) {
            $this->assertContains('nut_free', $i['dietary']);
            $this->assertContains('no_pork', $i['dietary']);
        }
    }

    public function test_batch_run_schedules_next_departure_and_groups_drivers()
    {
        // Batch zone around the customer's area.
        $zone = Zone::create(['name' => 'Ruwa', 'city' => 'Harare', 'polygon' => [[-17.80, 31.04], [-17.80, 31.06], [-17.82, 31.06], [-17.82, 31.04]],
            'batch_mode' => true, 'batch_times' => ['10:00', '14:00', '17:30']]);
        $address = $this->user->addresses()->create(['line1' => 'Ruwa stand 12', 'city' => 'Ruwa', 'lat' => -17.81, 'lng' => 31.05]);

        app(CartService::class)->add($this->user, $this->item(), 2, null, [], null, true);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => 'ecocash', 'phone' => '+263771234567']);
        $this->assertSame('scheduled', $order->fresh()->status);
        $this->assertSame('2026-11-04 14:35', $order->scheduled_for->format('Y-m-d H:i')); // 14:00 run + 35 min

        // A driver already carrying a Ruwa-run order can take another one.
        $driver = Driver::first();
        $driver->update(['is_online' => true, 'lat' => $this->vendor->lat, 'lng' => $this->vendor->lng, 'location_updated_at' => now()]);
        $order->update(['status' => 'accepted', 'driver_id' => $driver->id]);
        $second = $order->replicate(['reference', 'driver_id'])->fill(['status' => 'ready']);
        $second->save();
        $this->assertSame($driver->id, app(DispatchService::class)->nearestDriver($second)?->id);
    }
}

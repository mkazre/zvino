<?php

namespace Tests\Feature\Site;

use App\Models\Address;
use App\Models\Driver;
use App\Models\Order;
use App\Models\Setting;
use App\Services\DispatchService;
use App\Support\OrderView;
use App\Support\RoutePlanner;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LiveTrackingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $this->withoutVite();
        Http::fake();
        Event::fake([\App\Events\OrderUpdated::class, \App\Events\DriverOfferCreated::class, \App\Events\DriverLocationUpdated::class]);
    }

    /** A copy of a demo delivery order, from $vendorId, to a new address $kmNorth km north of the store. */
    private function order(int $vendorId, float $kmNorth, array $extra = []): Order
    {
        $base = Order::where('fulfilment', 'delivery')->whereNotNull('user_id')->firstOrFail();
        $vendor = \App\Models\Vendor::findOrFail($vendorId);
        $address = Address::create(['user_id' => $base->user_id, 'label' => 'Test', 'line1' => "$kmNorth km north", 'city' => 'Harare', 'lat' => $vendor->lat + $kmNorth / 111, 'lng' => $vendor->lng]);
        $o = $base->replicate(['reference']);
        $o->fill($extra + ['reference' => 'T'.random_int(10000, 99999), 'vendor_id' => $vendorId, 'address_id' => $address->id, 'status' => 'accepted', 'driver_id' => null, 'created_at' => now(), 'accepted_at' => null, 'ready_at' => null, 'picked_up_at' => null, 'delivered_at' => null, 'estimated_delivery_at' => null, 'promised_delivery_at' => null])->save();

        return $o->fresh();
    }

    public function test_route_planner_finds_the_shortest_drop_off_order(): void
    {
        $plan = RoutePlanner::best([0, 0], [['lat' => 0, 'lng' => 0.1], ['lat' => 0, 'lng' => 0.01], ['lat' => 0, 'lng' => 0.05]]);
        $this->assertSame([1, 2, 0], $plan['order']);
        $this->assertCount(3, $plan['legs']);
    }

    public function test_drivers_can_batch_nearby_orders_from_the_same_store_only(): void
    {
        Setting::put('delivery.allow_batching', true);
        Setting::put('delivery.batch_max_detour_km', 4);
        $driver = Driver::where('status', 'approved')->firstOrFail();
        $vendorId = $this->order(\App\Models\Vendor::firstOrFail()->id, 1)->vendor_id;
        Order::where('driver_id', $driver->id)->update(['driver_id' => null]);
        $first = $this->order($vendorId, 2);
        $first->update(['driver_id' => $driver->id]);
        $dispatch = app(DispatchService::class);

        $this->assertTrue($dispatch->canBatch($driver, $this->order($vendorId, 2.5)), 'next-door drop-off joins the run');
        $this->assertFalse($dispatch->canBatch($driver, $this->order($vendorId, -6)), 'opposite direction is too big a detour');
        $other = \App\Models\Vendor::where('id', '!=', $vendorId)->firstOrFail();
        $this->assertFalse($dispatch->canBatch($driver, $this->order($other->id, 2)), 'different store');

        // Already collected: no more orders join.
        $first->update(['status' => 'picked_up']);
        $this->assertFalse($dispatch->canBatch($driver->fresh(), $this->order($vendorId, 2.2)));
    }

    public function test_driver_route_collects_first_then_drops_off_nearest_first(): void
    {
        $driver = Driver::where('status', 'approved')->with('user')->firstOrFail();
        Order::where('driver_id', $driver->id)->update(['driver_id' => null]);
        $vendorId = \App\Models\Vendor::firstOrFail()->id;
        $far = $this->order($vendorId, 5, ['driver_id' => $driver->id]);
        $near = $this->order($vendorId, 1, ['driver_id' => $driver->id]);
        $driver->update(['lat' => $far->vendor->lat, 'lng' => $far->vendor->lng]);

        Sanctum::actingAs($driver->user);
        $route = $this->getJson('/api/driver/route')->assertOk()->json();
        $this->assertSame(['pickup', 'dropoff', 'dropoff'], array_column($route['stops'], 'type'));
        $this->assertSame([$near->id, $far->id], [$route['stops'][1]['order_id'], $route['stops'][2]['order_id']]);
        $this->assertStringContainsString('waypoints=', urldecode($route['nav_url']));

        $jobs = $this->getJson('/api/driver/jobs')->assertOk()->json();
        $this->assertSame([$near->id, 1], [$jobs[0]['id'], $jobs[0]['stop']]);
    }

    public function test_customer_sees_active_order_button_and_live_map_after_collection(): void
    {
        $order = $this->order(\App\Models\Vendor::firstOrFail()->id, 2);
        Order::where('user_id', $order->user_id)->where('id', '!=', $order->id)->update(['status' => 'delivered']);
        $user = $order->user;

        Sanctum::actingAs($user);
        $this->getJson('/api/orders/active')->assertOk()->assertJsonPath('order.id', $order->id)->assertJsonPath('order.live', false);

        $driver = Driver::where('status', 'approved')->firstOrFail();
        $driver->update(['lat' => -17.8, 'lng' => 31.05, 'location_updated_at' => now()]);
        $order->update(['status' => 'picked_up', 'driver_id' => $driver->id]);
        $this->getJson('/api/orders/active')->assertJsonPath('order.live', true)->assertJsonPath('order.label', 'On the way');

        $view = OrderView::forCustomer($order->fresh());
        $this->assertTrue($view['live']);
        $this->assertNotNull($view['driver']['located_at']);

        $this->actingAs($user)->get('/')->assertOk()->assertInertia(fn ($p) => $p->where('activeOrder.id', $order->id));
        $order->update(['status' => 'delivered']);
        $this->actingAs($user)->get('/')->assertInertia(fn ($p) => $p->where('activeOrder', null));
    }

    public function test_delivery_time_updates_when_food_is_ready_early_and_when_collected(): void
    {
        Setting::put('delivery.learn_speed', false);
        Setting::put('delivery.avg_speed_kmh', 25);
        Setting::put('delivery.handover_minutes', 3);
        \Illuminate\Support\Carbon::setTestNow('2026-11-12 12:00:00');
        $order = $this->order(\App\Models\Vendor::firstOrFail()->id, 2, ['status' => 'placed']);
        $orders = app(\App\Services\OrderService::class);
        $ride = \App\Support\DeliveryEta::rideMinutes(\App\Support\DeliveryEta::storeToCustomerKm($order)); // ~2.6 road km → 7 min

        // Accepted with 20 min prep: 20 + 3 handover + ride. That's also the promised time.
        $orders->accept($order, 20);
        $order->refresh();
        $promised = now()->addMinutes(20 + 3 + $ride);
        $this->assertSame($promised->format('H:i'), $order->estimated_delivery_at->format('H:i'));
        $this->assertSame($promised->format('H:i'), $order->promised_delivery_at->format('H:i'));

        // Kitchen finishes after only 8 minutes: the ETA comes forward by 12 minutes.
        \Illuminate\Support\Carbon::setTestNow('2026-11-12 12:08:00');
        $orders->setStatus($order->fresh(), 'ready');
        $order->refresh();
        $this->assertSame(now()->addMinutes(3 + $ride)->format('H:i'), $order->estimated_delivery_at->format('H:i'));
        $this->assertSame('early', OrderView::forCustomer($order)['time']['trend']['type']);

        // Driver collects at 12:11: now + ride from the store to the customer.
        \Illuminate\Support\Carbon::setTestNow('2026-11-12 12:11:00');
        $driver = Driver::where('status', 'approved')->firstOrFail();
        // No live GPS fix, so the ride is measured from the store (keeps this independent of the real clock).
        $driver->update(['location_updated_at' => null]);
        $order->update(['driver_id' => $driver->id]);
        $orders->setStatus($order->fresh(), 'picked_up');
        $this->assertSame(now()->addMinutes($ride)->format('H:i'), $order->fresh()->estimated_delivery_at->format('H:i'));
        $this->assertSame('Arriving (estimated)', OrderView::forCustomer($order->fresh())['time']['label']);

        // The promise doesn't move, so arriving on time never counts as late.
        $this->assertSame($promised->format('H:i'), $order->fresh()->promised_delivery_at->format('H:i'));
        \Illuminate\Support\Carbon::setTestNow();
    }

    public function test_live_eta_follows_the_drivers_position(): void
    {
        Setting::put('delivery.learn_speed', false);
        $order = $this->order(\App\Models\Vendor::firstOrFail()->id, 6, ['status' => 'picked_up', 'estimated_delivery_at' => now()->addMinutes(30), 'promised_delivery_at' => now()->addMinutes(30)]);
        $driver = Driver::where('status', 'approved')->with('user')->firstOrFail();
        Order::where('driver_id', $driver->id)->where('id', '!=', $order->id)->update(['driver_id' => null]);
        $order->update(['driver_id' => $driver->id]);

        // Driver is 1 km from the customer: the ETA drops to a few minutes.
        Sanctum::actingAs($driver->user);
        $this->postJson('/api/driver/location', ['lat' => $order->address->lat - 1 / 111, 'lng' => $order->address->lng])->assertOk();
        $mins = now()->diffInMinutes($order->fresh()->estimated_delivery_at);
        $this->assertLessThanOrEqual(5, $mins);
    }
}

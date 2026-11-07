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
        $o->fill($extra + ['reference' => 'T'.random_int(10000, 99999), 'vendor_id' => $vendorId, 'address_id' => $address->id, 'status' => 'accepted', 'driver_id' => null, 'created_at' => now()])->save();

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
}

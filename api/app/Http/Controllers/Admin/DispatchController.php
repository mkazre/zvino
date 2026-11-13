<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Driver;
use App\Models\Order;
use App\Models\Setting;
use App\Services\DispatchService;
use Illuminate\Http\Request;
use Inertia\Inertia;

/** Ops command centre: live map of orders and drivers, late alerts, manual assignment. */
class DispatchController extends AdminController
{
    public function index(Request $request)
    {
        return Inertia::render('admin/dispatch', $this->snapshot() + [
            'mapsKey' => Setting::get('integrations.google_maps_browser_key'),
            'zones' => \App\Models\Zone::where('is_active', true)->get(['id', 'name', 'polygon', 'surge_multiplier']),
        ]);
    }

    /** Polled every 10 s by the screen (and refreshed instantly via Pusher when configured). */
    public function live()
    {
        return response()->json($this->snapshot());
    }

    public function assign(Request $request, Order $order, DispatchService $dispatch)
    {
        $driver = Driver::findOrFail($request->validate(['driver_id' => ['required', 'exists:drivers,id']])['driver_id']);
        abort_unless($driver->status === 'approved', 422, 'Driver is not approved.');
        abort_if($order->driver_id, 422, 'Order already has a driver.');

        $dispatch->assign($order, $driver);
        AuditLog::record('dispatch.manual_assign', $order, ['driver_id' => $driver->id]);

        return back()->with('success', "{$order->reference} assigned to {$driver->user->name}.");
    }

    public function retry(Order $order, DispatchService $dispatch)
    {
        $offer = $dispatch->dispatch($order);

        return back()->with($offer ? 'success' : 'error', $offer ? (\App\Services\DispatchService::broadcasting() ? 'Job sent to every suitable driver nearby.' : 'Offer sent to the nearest driver.') : 'No suitable driver nearby right now, or drivers are still deciding.');
    }

    private function snapshot(): array
    {
        $orders = Order::whereIn('status', Order::LIVE)->with('vendor:id,name,lat,lng,is_shopper_store', 'address:id,lat,lng,suburb,line1', 'driver.user:id,name', 'user:id,name')
            ->oldest()->get();

        $now = now();
        $mapped = $orders->map(function (Order $o) use ($now) {
            $late = $o->estimated_delivery_at && $o->estimated_delivery_at->lt($now) && $o->status !== 'delivered';
            $waitingForStore = $o->status === 'placed' && $o->created_at->diffInMinutes($now) >= 4;
            $noDriver = $o->fulfilment === 'delivery' && ! $o->driver_id && in_array($o->status, ['accepted', 'preparing', 'ready'], true);

            return [
                'id' => $o->id,
                'reference' => $o->reference,
                'status' => $o->status,
                'fulfilment' => $o->fulfilment,
                'store' => $o->vendor?->only('id', 'name', 'lat', 'lng'),
                'dropoff' => $o->address?->only('lat', 'lng', 'suburb', 'line1'),
                'customer' => $o->user?->name,
                'driver' => $o->driver ? ['id' => $o->driver->id, 'name' => $o->driver->user->name] : null,
                'total_zig' => $o->total_zig,
                'age_minutes' => (int) $o->created_at->diffInMinutes($now),
                'eta' => $o->estimated_delivery_at,
                'alerts' => array_values(array_filter([
                    $late ? 'late' : null,
                    $waitingForStore ? 'store_slow' : null,
                    $noDriver ? 'no_driver' : null,
                    collect($o->status_history)->contains('flag', 'needs_manual_dispatch') ? 'manual' : null,
                ])),
                'offers' => $o->dispatchOffers()->count(),
                'shop' => (bool) $o->vendor?->is_shopper_store,
                // Drivers looking at the job right now (broadcast: first to accept gets it).
                'seeing' => $o->dispatchOffers()->where('status', 'offered')->where('expires_at', '>', $now)->count(),
            ];
        });

        $drivers = Driver::where('status', 'approved')->where('is_online', true)->with('user:id,name,phone')->withCount('activeOrders')->get()
            ->map(fn (Driver $d) => [
                'id' => $d->id,
                'name' => $d->user->name,
                'phone' => $d->user->phone,
                'lat' => $d->lat,
                'lng' => $d->lng,
                'vehicle' => $d->vehicle_type,
                'rating' => $d->rating,
                'active' => $d->active_orders_count,
                'stale' => ! $d->location_updated_at || $d->location_updated_at->lt(now()->subMinutes(3)),
                'cash_held' => $d->cashHeld(),
            ]);

        return [
            'orders' => $mapped->values(),
            'drivers' => $drivers->values(),
            'stats' => [
                'live' => $mapped->count(),
                'unassigned' => $mapped->filter(fn ($o) => in_array('no_driver', $o['alerts'], true))->count(),
                'late' => $mapped->filter(fn ($o) => in_array('late', $o['alerts'], true))->count(),
                'online_drivers' => $drivers->count(),
                'busy_drivers' => $drivers->where('active', '>', 0)->count(),
            ],
            'at' => now()->toIso8601String(),
        ];
    }
}

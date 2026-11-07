<?php

namespace App\Support;

use App\Models\Order;
use App\Models\Setting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Live delivery time. Recalculated whenever something real happens, so it reflects what is actually
 * going on rather than the first guess:
 *   - store accepts       → food ready (prep time) + ride from the store to the customer
 *   - driver assigned     → also waits for the driver to reach the store, if they're further away
 *   - food ready early    → uses the real ready time, so the ETA comes forward
 *   - driver collects     → now + ride from the store to the customer (plus earlier drop-offs on a run)
 *   - driver on the way   → now + ride from the driver's live position
 * Ride time uses road distance and the average speed of recent Zvino deliveries (or the set speed).
 */
class DeliveryEta
{
    /** Average driving speed, learned from the last 14 days of deliveries when there are enough. */
    public static function speedKmh(): float
    {
        $fallback = (float) (Setting::get('delivery.avg_speed_kmh') ?: 25);
        if (! Setting::get('delivery.learn_speed')) {
            return $fallback;
        }

        return Cache::remember('zvino.eta.speed', 3600, function () use ($fallback) {
            $samples = Order::where('status', 'delivered')->where('fulfilment', 'delivery')
                ->whereNotNull('picked_up_at')->whereNotNull('delivered_at')->where('delivered_at', '>=', now()->subDays(14))
                ->with('vendor:id,lat,lng', 'address:id,lat,lng')->latest('delivered_at')->limit(300)
                ->get(['id', 'vendor_id', 'address_id', 'distance_km', 'picked_up_at', 'delivered_at'])
                ->map(fn (Order $o) => [self::storeToCustomerKm($o), $o->picked_up_at->diffInSeconds($o->delivered_at) / 60])
                ->filter(fn ($s) => $s[0] && $s[0] > 0.3 && $s[1] >= 2 && $s[1] <= 120);
            if ($samples->count() < 10) {
                return $fallback;
            }
            $speed = $samples->sum(fn ($s) => $s[0]) / ($samples->sum(fn ($s) => $s[1]) / 60);

            return round(min(45, max(12, $speed)), 1);
        });
    }

    public static function rideMinutes(float $km): int
    {
        return (int) ceil($km / self::speedKmh() * 60);
    }

    public static function storeToCustomerKm(Order $order): ?float
    {
        $v = $order->vendor;
        $a = $order->address;
        if ($v?->lat && $a?->lat) {
            return Geo::roadKm((float) $v->lat, (float) $v->lng, (float) $a->lat, (float) $a->lng);
        }

        return $order->distance_km ? (float) $order->distance_km : null;
    }

    /** The new estimate, or null when this order's time shouldn't be touched. */
    public static function estimate(Order $order): ?Carbon
    {
        if (in_array($order->status, ['pending_payment', 'delivered', 'cancelled', 'rejected'], true)) {
            return null;
        }
        $order->loadMissing('vendor', 'address', 'driver');
        $now = now();
        $handover = (int) (Setting::get('delivery.handover_minutes') ?? 3);

        // When the food is (or will be) ready.
        $foodReady = $order->ready_at
            ?? ($order->accepted_at ? $order->accepted_at->copy()->addMinutes((int) $order->prep_minutes) : $now->copy()->addMinutes((int) ($order->prep_minutes ?: 15)));
        if (! $order->ready_at && $foodReady->lt($now)) {
            $foodReady = $now->copy()->addMinutes(2); // running over: assume it's nearly ready
        }

        if ($order->fulfilment !== 'delivery') {
            return $order->ready_at ?? $foodReady;
        }

        [$km, $stopsBefore] = self::travelToCustomer($order);
        $ride = ($km !== null ? self::rideMinutes($km) : 15) + $stopsBefore * $handover;

        if (in_array($order->status, ['picked_up', 'arriving'], true)) {
            return $now->copy()->addMinutes(max(1, $ride));
        }

        // Not collected yet: the driver leaves once both the food and the driver are at the store.
        $leave = $foodReady->copy();
        $d = $order->driver;
        if ($d && $d->lat && $order->vendor?->lat && $d->location_updated_at?->gte($now->copy()->subMinutes(5))) {
            $driverThere = $now->copy()->addMinutes(self::rideMinutes(Geo::roadKm((float) $d->lat, (float) $d->lng, (float) $order->vendor->lat, (float) $order->vendor->lng)));
            if ($driverThere->gt($leave)) {
                $leave = $driverThere;
            }
        }

        return $leave->addMinutes($handover + $ride);
    }

    /**
     * Distance still to travel to this customer once the driver leaves the store (or from where the
     * driver is now, once collected), including other drop-offs on the same run.
     *
     * @return array{0: ?float, 1: int} [km, drop-offs before this one]
     */
    private static function travelToCustomer(Order $order): array
    {
        $collected = in_array($order->status, ['picked_up', 'arriving'], true);
        $d = $order->driver;
        $fresh = $d && $d->lat && $d->location_updated_at?->gte(now()->subMinutes(5));

        if ($d && $d->activeOrders()->count() > 1) {
            $km = 0.0;
            $before = 0;
            $counting = $collected && $fresh; // the planned route starts at the driver
            foreach (RoutePlanner::forDriver($d)['stops'] as $s) {
                if (! $counting) {
                    // Start counting after the pickup that includes this order.
                    if ($s['type'] === 'pickup' && in_array($order->id, $s['order_ids'], true)) {
                        $counting = true;
                    }

                    continue;
                }
                if ($s['km'] === null) {
                    break;
                }
                $km += $s['km'];
                if ($s['type'] === 'dropoff' && $s['order_id'] === $order->id) {
                    return [$km, $before];
                }
                if ($s['type'] === 'dropoff') {
                    $before++;
                }
            }
        }

        if ($collected && $fresh && $order->address?->lat) {
            return [Geo::roadKm((float) $d->lat, (float) $d->lng, (float) $order->address->lat, (float) $order->address->lng), 0];
        }

        return [self::storeToCustomerKm($order), 0];
    }

    /**
     * Save a fresh estimate when it moved by at least a minute; returns true when it changed.
     * $promise also records it as the time promised to the customer (first estimate, store delays).
     */
    public static function refresh(Order $order, bool $promise = false): bool
    {
        $eta = self::estimate($order);
        if (! $eta) {
            return false;
        }
        $eta = $eta->copy()->second(0);
        $changed = ! $order->estimated_delivery_at || abs($order->estimated_delivery_at->diffInSeconds($eta, false)) >= 60;
        $updates = $changed ? ['estimated_delivery_at' => $eta] : [];
        if ($promise || ! $order->promised_delivery_at) {
            $updates['promised_delivery_at'] = $eta;
        }
        if ($updates) {
            $order->forceFill($updates)->save();
        }

        return $changed;
    }
}

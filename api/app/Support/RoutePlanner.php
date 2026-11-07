<?php

namespace App\Support;

use App\Models\Driver;
use App\Models\Order;
use App\Models\Setting;
use Illuminate\Support\Collection;

/**
 * Plans a driver's multi-order run: collect from each store, then drop off in the order that gives
 * the shortest total distance. Up to 7 drop-offs are checked exhaustively (every order is tried);
 * larger runs use nearest-neighbour. Distances are straight-line × 1.3 (typical road factor).
 */
class RoutePlanner
{
    private const EXACT_LIMIT = 7;

    /**
     * Best visiting order for $points (each ['lat','lng', …]) starting from $start [lat, lng].
     *
     * @return array{order: int[], km: float, legs: float[]} indexes into $points, total km, km per leg
     */
    public static function best(array $start, array $points): array
    {
        $idx = array_keys($points);
        if (! $idx) {
            return ['order' => [], 'km' => 0.0, 'legs' => []];
        }
        $km = fn ($a, $b) => Geo::roadKm($a[0], $a[1], $b[0], $b[1]);
        $at = fn ($i) => [(float) $points[$i]['lat'], (float) $points[$i]['lng']];

        if (count($idx) <= self::EXACT_LIMIT) {
            $best = null;
            $bestKm = INF;
            foreach (self::permutations($idx) as $perm) {
                $total = 0;
                $prev = $start;
                foreach ($perm as $i) {
                    $total += $km($prev, $at($i));
                    if ($total >= $bestKm) {
                        continue 2; // already worse
                    }
                    $prev = $at($i);
                }
                $best = $perm;
                $bestKm = $total;
            }
            $order = $best;
        } else {
            $order = [];
            $left = $idx;
            $prev = $start;
            while ($left) {
                usort($left, fn ($a, $b) => $km($prev, $at($a)) <=> $km($prev, $at($b)));
                $next = array_shift($left);
                $order[] = $next;
                $prev = $at($next);
            }
        }

        $legs = [];
        $prev = $start;
        foreach ($order as $i) {
            $legs[] = round($km($prev, $at($i)), 2);
            $prev = $at($i);
        }

        return ['order' => $order, 'km' => round(array_sum($legs), 2), 'legs' => $legs];
    }

    /** @return \Generator<int[]> */
    private static function permutations(array $items): \Generator
    {
        if (count($items) <= 1) {
            yield $items;

            return;
        }
        foreach ($items as $k => $item) {
            $rest = $items;
            unset($rest[$k]);
            foreach (self::permutations(array_values($rest)) as $p) {
                yield [$item, ...$p];
            }
        }
    }

    /** Extra km a new drop-off adds to the run (compared with the run without it). */
    public static function detourKm(array $storeLatLng, Collection $orders, Order $new): float
    {
        $drops = fn (Collection $os) => $os->filter(fn (Order $o) => $o->address?->lat)->map(fn (Order $o) => ['lat' => $o->address->lat, 'lng' => $o->address->lng])->values()->all();
        if (! $new->address?->lat) {
            return 0.0;
        }

        return max(0, self::best($storeLatLng, $drops($orders->concat([$new])))['km'] - self::best($storeLatLng, $drops($orders->reject(fn ($o) => $o->is($new))))['km']);
    }

    /**
     * The driver's run right now: store pickups still to do, then drop-offs in the best order.
     *
     * @return array{stops: array<int, array>, total_km: float, nav_url: ?string, orders: int}
     */
    public static function forDriver(Driver $driver, ?Collection $orders = null): array
    {
        $orders ??= $driver->activeOrders()->with('vendor', 'address', 'user')->get();
        $here = $driver->lat ? [(float) $driver->lat, (float) $driver->lng] : null;
        $stops = [];

        // 1. Pickups: stores with orders not yet collected (nearest first).
        $toCollect = $orders->filter(fn (Order $o) => ! in_array($o->status, ['picked_up', 'arriving'], true))->groupBy('vendor_id');
        $pickups = $toCollect->map(fn (Collection $os) => ['lat' => $os->first()->vendor->lat, 'lng' => $os->first()->vendor->lng, 'orders' => $os])->filter(fn ($p) => $p['lat'])->values()->all();
        $start = $here ?? ($pickups ? [(float) $pickups[0]['lat'], (float) $pickups[0]['lng']] : null);
        $pos = $start;
        if ($pickups && $start) {
            $plan = self::best($start, $pickups);
            foreach ($plan['order'] as $n => $i) {
                $p = $pickups[$i];
                $v = $p['orders']->first()->vendor;
                $stops[] = ['type' => 'pickup', 'vendor_id' => $v->id, 'name' => $v->name, 'address' => $v->address, 'phone' => $v->phone, 'lat' => (float) $v->lat, 'lng' => (float) $v->lng,
                    'order_ids' => $p['orders']->pluck('id')->values()->all(), 'references' => $p['orders']->pluck('reference')->values()->all(), 'km' => $plan['legs'][$n]];
                $pos = [(float) $v->lat, (float) $v->lng];
            }
        }

        // 2. Drop-offs, shortest total distance from the last pickup (or from where the driver is now).
        $drops = $orders->filter(fn (Order $o) => $o->fulfilment === 'delivery')->values();
        $located = $drops->filter(fn (Order $o) => $o->address?->lat)->values();
        $points = $located->map(fn (Order $o) => ['lat' => $o->address->lat, 'lng' => $o->address->lng])->all();
        $plan = $pos ? self::best($pos, $points) : ['order' => array_keys($points), 'legs' => array_fill(0, count($points), null)];
        $sequence = collect($plan['order'])->map(fn ($i, $n) => [$located[$i], $plan['legs'][$n]])
            ->concat($drops->reject(fn (Order $o) => $o->address?->lat)->map(fn ($o) => [$o, null]));
        foreach ($sequence as [$o, $leg]) {
            $stops[] = ['type' => 'dropoff', 'order_id' => $o->id, 'reference' => $o->reference, 'status' => $o->status, 'name' => $o->user?->name ?? 'Customer',
                'address' => trim(implode(', ', array_filter([$o->address?->line1, $o->address?->suburb])), ', '), 'phone' => $o->user?->phone,
                'lat' => $o->address?->lat ? (float) $o->address->lat : null, 'lng' => $o->address?->lng ? (float) $o->address->lng : null,
                'collected' => in_array($o->status, ['picked_up', 'arriving'], true), 'km' => $leg];
        }

        foreach ($stops as $n => &$s) {
            $s['number'] = $n + 1;
        }
        unset($s);

        return ['stops' => $stops, 'total_km' => round(collect($stops)->sum('km'), 1), 'nav_url' => self::navUrl($stops), 'orders' => $orders->count()];
    }

    /** Google Maps directions through every stop (opens the Maps app on phones). */
    public static function navUrl(array $stops): ?string
    {
        $pts = collect($stops)->filter(fn ($s) => $s['lat'])->map(fn ($s) => $s['lat'].','.$s['lng'])->values();
        if ($pts->isEmpty()) {
            return null;
        }
        $q = ['api' => 1, 'destination' => $pts->last(), 'travelmode' => 'driving'];
        if ($pts->count() > 1) {
            $q['waypoints'] = $pts->slice(0, -1)->implode('|');
        }

        return 'https://www.google.com/maps/dir/?'.http_build_query($q);
    }

    /** How many drop-offs the driver makes before reaching this order (for the customer's map). */
    public static function stopsBefore(Order $order): int
    {
        if (! $order->driver || ! in_array($order->status, ['picked_up', 'arriving'], true)) {
            return 0;
        }
        $orders = $order->driver->activeOrders()->with('vendor', 'address', 'user')->get();
        if ($orders->count() < 2) {
            return 0;
        }
        $drops = collect(self::forDriver($order->driver, $orders)['stops'])->where('type', 'dropoff')->values();
        $pos = $drops->search(fn ($s) => $s['order_id'] === $order->id);

        return $pos === false ? 0 : $drops->take($pos)->where('collected', true)->count();
    }

    public static function maxBatch(): int
    {
        return max(1, (int) (Setting::get('delivery.batch_max_orders') ?: 3));
    }

    public static function maxDetourKm(): float
    {
        return (float) (Setting::get('delivery.batch_max_detour_km') ?? 4);
    }
}

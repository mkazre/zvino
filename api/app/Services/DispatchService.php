<?php

namespace App\Services;

use App\Events\DriverJobAssigned;
use App\Events\DriverOfferClosed;
use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\DispatchOffer;
use App\Models\Driver;
use App\Models\ExchangeRate;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Geo;
use App\Support\RoutePlanner;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Finds a driver for each delivery.
 *
 * Broadcast (default): every suitable online driver near the store sees the job at the same moment
 * (in-app popup + high-priority push) and the first to accept gets it; the others' popups close.
 * Busy drivers are included when the job fits their current run ("stacking", as Uber Eats and Mr D do).
 * If nobody accepts in a round, the next round reaches further and pays a little more.
 *
 * Nearest: the original one-driver-at-a-time offer.
 *
 * Works without a queue worker: offers expire lazily whenever drivers poll and the scheduler sweeps
 * every minute (see routes/console.php).
 */
class DispatchService
{
    public function __construct(private PushService $push, private PricingService $pricing) {}

    public function needsDriver(Order $order): bool
    {
        return $order->fulfilment === 'delivery'
            && ! $order->driver_id
            && in_array($order->status, ['accepted', 'preparing', 'ready'], true);
    }

    public static function broadcasting(): bool
    {
        return Setting::get('delivery.offer_style') !== 'nearest';
    }

    /** Start (or continue) looking for a driver. Returns the (first) new offer, if any. */
    public function dispatch(Order $order): ?DispatchOffer
    {
        if (! $this->needsDriver($order) || Setting::get('delivery.dispatch_mode') !== 'auto') {
            return null;
        }
        if ($order->dispatchOffers()->where('status', 'offered')->where('expires_at', '>', now())->exists()) {
            return null; // drivers are already deciding
        }

        $round = (int) $order->dispatchOffers()->max('round') + 1;
        if ($round - 1 >= (int) Setting::get('delivery.max_offer_attempts')) {
            Log::warning("Dispatch: no driver accepted {$order->reference} after ".($round - 1).' rounds');
            // Keep trying, but ops is alerted via the late-order panel (status_history flag).
            $this->flag($order, 'needs_manual_dispatch');
        }

        $candidates = $this->candidates($order, $round);
        if ($candidates->isEmpty()) {
            return null;
        }

        if (! self::broadcasting()) {
            return $this->offer($order, $candidates->first(), $round, false, 0);
        }

        $boost = min((float) Setting::get('delivery.boost_max_pct'), (float) Setting::get('delivery.boost_pct_per_round') * ($round - 1));

        return $candidates->take(max(1, (int) Setting::get('delivery.broadcast_max_drivers')))
            ->map(fn (Driver $d) => $this->offer($order, $d, $round, true, $boost))
            ->first();
    }

    /** The best single driver for this order right now (used by tests and the one-at-a-time style). */
    public function nearestDriver(Order $order): ?Driver
    {
        return $this->candidates($order, (int) $order->dispatchOffers()->max('round') + 1)->first();
    }

    /**
     * Drivers who can take this order now, nearest to the store first (top-rated and higher tiers get a
     * small head start). Free drivers, and busy drivers whose run it fits, are both included.
     *
     * @return Collection<int, Driver>
     */
    public function candidates(Order $order, int $round = 1): Collection
    {
        $vendor = $order->vendor;
        if (! $vendor?->lat) {
            return collect();
        }
        // Each unanswered broadcast round reaches further: 1×, 1.5×, then 2× the radius.
        $radius = (float) Setting::get('delivery.max_offer_radius_km') * (self::broadcasting() ? min(2, 1 + 0.5 * ($round - 1)) : 1);
        // Never re-offer to a driver who said no; with one-at-a-time offers, skip everyone already asked.
        $skip = self::broadcasting()
            ? $order->dispatchOffers()->where('status', 'declined')->pluck('driver_id')
            : $order->dispatchOffers()->pluck('driver_id');
        $cashLimit = (float) Setting::get('delivery.driver_cash_limit_zig');
        $tiers = app(DriverTierService::class);
        $nightZone = \App\Models\SafetyZone::activeAt($order->address?->lat, $order->address?->lng);
        $batchZone = \App\Models\Zone::batchFor($order->address?->lat, $order->address?->lng);

        return Driver::available()
            ->whereNotIn('id', $skip)
            ->when($nightZone, fn ($q) => $q->where('avoid_night_zones', false))
            ->with('user')
            ->get()
            ->map(fn (Driver $d) => [$d, Geo::km($d->lat, $d->lng, $vendor->lat, $vendor->lng)])
            ->filter(fn ($pair) => $pair[1] <= $radius)
            ->filter(fn ($pair) => $order->cashDue() <= 0 || $pair[0]->cashHeld() + $order->cashDue() <= $cashLimit)
            ->filter(fn ($pair) => $pair[0]->activeOrders()->count() === 0
                || (Setting::get('delivery.allow_batching') && $this->canBatch($pair[0], $order))
                || ($batchZone && $this->onSameRun($pair[0], $batchZone)))
            ->sortBy(fn ($pair) => $pair[1] - ($pair[0]->rating - 4) * 0.5 - $tiers->priorityKm($pair[0]->tier ?? 'bronze'))
            ->map(fn ($pair) => $pair[0])
            ->values();
    }

    /**
     * Stacking: can this busy driver add the order to their current run? There must be room, and the
     * extra pickup + drop-off must add little distance. Once food is already in the car, an order from
     * another store must be a very small detour, so the first customer's food doesn't go cold.
     */
    public function canBatch(Driver $d, Order $order): bool
    {
        $active = $d->activeOrders()->with('vendor', 'address', 'user')->get();
        if ($active->isEmpty() || $active->count() >= RoutePlanner::maxBatch() || $active->contains('id', $order->id)) {
            return false;
        }
        $limit = RoutePlanner::maxDetourKm();
        $carrying = $active->contains(fn (Order $o) => in_array($o->status, ['picked_up', 'arriving'], true));
        $sameStore = $active->contains(fn (Order $o) => $o->vendor_id === $order->vendor_id && ! in_array($o->status, ['picked_up', 'arriving'], true));

        return $this->extraKm($d, $order, $active) <= ($carrying && ! $sameStore ? $limit / 2 : $limit);
    }

    /** Extra km this order adds to the driver's planned run (pickups, then drop-offs in the best order). */
    public function extraKm(Driver $d, Order $order, ?Collection $active = null): float
    {
        $active ??= $d->activeOrders()->with('vendor', 'address', 'user')->get();
        $order->loadMissing('vendor', 'address', 'user');

        return round(max(0, RoutePlanner::forDriver($d, $active->concat([$order]))['total_km'] - RoutePlanner::forDriver($d, $active)['total_km']), 1);
    }

    /** Driver is already carrying only orders for this batch zone, and has room for more. */
    private function onSameRun(Driver $d, \App\Models\Zone $zone): bool
    {
        $active = $d->activeOrders()->with('address')->get();

        return $active->count() < $zone->batch_max_orders && $active->every(fn (Order $o) => $o->status !== 'picked_up'
            && $o->address && \App\Models\Zone::batchFor($o->address->lat, $o->address->lng)?->id === $zone->id);
    }

    /** What this driver earns for the order (before tip): distance pay, tier bonus, shopping fee, round boost. */
    public function payFor(Order $order, Driver $driver, float $boostPct = 0): float
    {
        $base = $order->driver_pay_zig ?: $this->pricing->driverPay($order->distance_km);
        $pay = $base * (1 + app(DriverTierService::class)->bonusPct($driver->tier ?? 'bronze') / 100)
            + ($order->vendor?->is_shopper_store ? (float) Setting::get('delivery.shopper_fee_zig') : 0);

        return round($pay * (1 + $boostPct / 100), 2);
    }

    private function offer(Order $order, Driver $driver, int $round, bool $broadcast, float $boost): DispatchOffer
    {
        $vendor = $order->vendor;
        $offer = $order->dispatchOffers()->create([
            'driver_id' => $driver->id,
            'broadcast' => $broadcast,
            'round' => $round,
            'boost_pct' => $boost,
            'pickup_km' => Geo::roadKm($driver->lat, $driver->lng, $vendor->lat, $vendor->lng),
            'dropoff_km' => $order->distance_km,
            'pay_zig' => $this->payFor($order, $driver, $boost),
            'expires_at' => now()->addSeconds((int) Setting::get('delivery.offer_timeout_seconds')),
        ]);

        $this->emit(new DriverOfferCreated($offer));
        $earn = $offer->pay_zig + $order->tip_zig;
        $this->push->toUser($driver->user, 'dispatch_offer',
            'New job · ZiG '.number_format($earn, 2).($boost > 0 ? ' · boosted +'.rtrim(rtrim(number_format($boost, 1), '0'), '.').'%' : ''),
            "{$vendor->name}, ".number_format((float) $offer->pickup_km, 1).' km away → '.number_format((float) $order->distance_km, 1).' km to the customer · $'
                .number_format(ExchangeRate::toUsd((float) $order->subtotal_zig), 2).' order',
            ['offer_id' => $offer->id, 'order_id' => $order->id, 'link_to' => 'driver_offer'],
            ['inbox' => false, 'channel' => 'offers', 'ttl' => (int) Setting::get('delivery.offer_timeout_seconds')]);

        return $offer;
    }

    /** First come, first served: the first driver to accept gets the job; everyone else's popup closes. */
    public function accept(DispatchOffer $offer): Order
    {
        return DB::transaction(function () use ($offer) {
            $offer = DispatchOffer::lockForUpdate()->findOrFail($offer->id);
            $order = Order::lockForUpdate()->findOrFail($offer->order_id);

            abort_if($order->driver_id && $order->driver_id !== $offer->driver_id, 409, 'Another driver accepted this job first.');
            abort_unless($offer->isLive(), 410, 'This offer has expired.');

            $offer->update(['status' => 'accepted', 'responded_at' => now()]);
            $order->update(['driver_id' => $offer->driver_id, 'driver_pay_zig' => $offer->pay_zig]);
            $this->closeOthers($order, $offer->id, 'taken');
            \App\Support\DeliveryEta::refresh($order->fresh()); // the driver may be further from the store than the food is from ready
            if (! $offer->broadcast) {
                $this->recalcAcceptance($offer->driver);
            }

            $this->emit(new OrderUpdated($order->fresh()));
            if ($order->user) {
                $this->push->toUser($order->user, 'driver_assigned', 'Driver assigned',
                    "{$offer->driver->user->name} will pick up your order.", ['order_id' => $order->id]);
            }

            return $order;
        });
    }

    public function decline(DispatchOffer $offer): void
    {
        if ($offer->status !== 'offered') {
            return;
        }
        $offer->update(['status' => 'declined', 'responded_at' => now()]);
        if (! $offer->broadcast) {
            $this->recalcAcceptance($offer->driver);
        }
        $this->dispatch($offer->order); // only sends a new round once nobody else is still deciding
    }

    /** Admin manual assignment (dispatch board / order page): any online driver, free or mid-run. */
    public function assign(Order $order, Driver $driver): Order
    {
        $this->closeOthers($order, 0, 'assigned');
        $offer = $order->dispatchOffers()->create([
            'driver_id' => $driver->id,
            'round' => (int) $order->dispatchOffers()->max('round') + 1,
            'pickup_km' => $driver->lat && $order->vendor?->lat ? Geo::roadKm($driver->lat, $driver->lng, $order->vendor->lat, $order->vendor->lng) : null,
            'dropoff_km' => $order->distance_km,
            'pay_zig' => $this->payFor($order, $driver),
            'expires_at' => now()->addMinutes(5),
        ]);
        $order = $this->accept($offer);

        $this->emit(new DriverJobAssigned($driver->id, $order->id));
        $this->push->toUser($driver->user, 'job_assigned', 'New job assigned to you',
            "{$order->vendor->name} · ".($order->vendor->is_shopper_store ? 'shop and deliver' : 'collect and deliver').' · ZiG '.number_format($offer->pay_zig + $order->tip_zig, 2),
            ['order_id' => $order->id, 'link_to' => 'driver_job'], ['channel' => 'offers']);

        return $order;
    }

    /** Expire stale offers and re-offer. Called by the scheduler and on driver polls. */
    public function sweep(): int
    {
        $expired = DispatchOffer::where('status', 'offered')->where('expires_at', '<=', now())->with('order', 'driver')->get();
        foreach ($expired as $offer) {
            $offer->update(['status' => 'expired']);
            if (! $offer->broadcast) {
                $this->recalcAcceptance($offer->driver); // a broadcast nobody had to take doesn't count against anyone
            }
        }

        // Anything still waiting for a driver gets another attempt.
        Order::where('fulfilment', 'delivery')->whereNull('driver_id')
            ->whereIn('status', ['accepted', 'preparing', 'ready'])
            ->get()
            ->each(fn (Order $o) => $this->dispatch($o));

        return $expired->count();
    }

    /** Withdraw the order's other live offers and close those drivers' popups. */
    private function closeOthers(Order $order, int $exceptId, string $reason): void
    {
        $others = $order->dispatchOffers()->where('status', 'offered')->where('id', '!=', $exceptId)->get(['id', 'driver_id']);
        if ($others->isEmpty()) {
            return;
        }
        DispatchOffer::whereKey($others->pluck('id'))->update(['status' => 'cancelled', 'responded_at' => now()]);
        foreach ($others as $o) {
            $this->emit(new DriverOfferClosed($o->driver_id, $o->id, $reason));
        }
    }

    /** Live updates (Pusher) are best-effort: a hiccup there must never block an accept or an assignment. */
    private function emit(object $event): void
    {
        try {
            event($event);
        } catch (\Throwable $e) {
            Log::warning('Dispatch live update failed: '.$e->getMessage());
        }
    }

    private function recalcAcceptance(Driver $driver): void
    {
        $recent = $driver->offers()->where('broadcast', false)->whereIn('status', ['accepted', 'declined', 'expired'])->latest()->limit(50)->pluck('status');
        if ($recent->isNotEmpty()) {
            $driver->update(['acceptance_rate' => round($recent->filter(fn ($s) => $s === 'accepted')->count() / $recent->count() * 100, 2)]);
        }
    }

    private function flag(Order $order, string $flag): void
    {
        $history = $order->status_history ?? [];
        if (! collect($history)->contains('flag', $flag)) {
            $history[] = ['flag' => $flag, 'at' => now()->toIso8601String()];
            $order->update(['status_history' => $history]);
        }
    }
}

<?php

namespace App\Services;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\DispatchOffer;
use App\Models\Driver;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Geo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Offers delivery jobs to the nearest available driver, one at a time.
 * Works without a queue worker: offers expire lazily whenever drivers poll and
 * the scheduler sweeps every minute (see routes/console.php).
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

    /** Start (or continue) looking for a driver. Returns the new offer, if any. */
    public function dispatch(Order $order): ?DispatchOffer
    {
        if (! $this->needsDriver($order) || Setting::get('delivery.dispatch_mode') !== 'auto') {
            return null;
        }
        if ($order->dispatchOffers()->where('status', 'offered')->where('expires_at', '>', now())->exists()) {
            return null; // someone is already deciding
        }

        $attempts = $order->dispatchOffers()->count();
        if ($attempts >= Setting::get('delivery.max_offer_attempts')) {
            Log::warning("Dispatch: no driver accepted {$order->reference} after {$attempts} offers");
            // Keep trying, but ops is alerted via the late-order panel (status_history flag).
            $this->flag($order, 'needs_manual_dispatch');
        }

        $driver = $this->nearestDriver($order);
        if (! $driver) {
            return null;
        }

        $vendor = $order->vendor;
        $offer = $order->dispatchOffers()->create([
            'driver_id' => $driver->id,
            'pickup_km' => Geo::roadKm($driver->lat, $driver->lng, $vendor->lat, $vendor->lng),
            'pay_zig' => round(($order->driver_pay_zig ?: $this->pricing->driverPay($order->distance_km)) * (1 + app(DriverTierService::class)->bonusPct($driver->tier ?? 'bronze') / 100), 2),
            'expires_at' => now()->addSeconds(Setting::get('delivery.offer_timeout_seconds')),
        ]);

        DriverOfferCreated::dispatch($offer);
        $this->push->toUser($driver->user, 'dispatch_offer', 'New delivery request',
            "{$vendor->name} → ".($order->distance_km ?? '?').' km · ZiG '.number_format($offer->pay_zig + $order->tip_zig, 2),
            ['offer_id' => $offer->id, 'order_id' => $order->id]);

        return $offer;
    }

    public function nearestDriver(Order $order): ?Driver
    {
        $vendor = $order->vendor;
        $radius = (float) Setting::get('delivery.max_offer_radius_km');
        $alreadyOffered = $order->dispatchOffers()->pluck('driver_id');
        $cashLimit = (float) Setting::get('delivery.driver_cash_limit_zig');
        $tiers = app(DriverTierService::class);
        $nightZone = \App\Models\SafetyZone::activeAt($order->address?->lat, $order->address?->lng);
        $batchZone = \App\Models\Zone::batchFor($order->address?->lat, $order->address?->lng);

        return Driver::available()
            ->whereNotIn('id', $alreadyOffered)
            ->when($nightZone, fn ($q) => $q->where('avoid_night_zones', false))
            ->with('user')
            ->get()
            ->filter(fn (Driver $d) => $d->activeOrders()->count() === 0
                || (Setting::get('delivery.allow_batching') && $d->activeOrders()->where('vendor_id', $vendor->id)->count() === 1)
                || ($batchZone && $this->onSameRun($d, $batchZone)))
            ->filter(fn (Driver $d) => $order->cashDue() <= 0 || $d->cashHeld() + $order->cashDue() <= $cashLimit)
            ->map(fn (Driver $d) => [$d, Geo::km($d->lat, $d->lng, $vendor->lat, $vendor->lng)])
            ->filter(fn ($pair) => $pair[1] <= $radius)
            ->sortBy(fn ($pair) => $pair[1] - ($pair[0]->rating - 4) * 0.5 - $tiers->priorityKm($pair[0]->tier ?? 'bronze')) // nearer first, boost for top-rated and higher tiers
            ->map(fn ($pair) => $pair[0])
            ->first();
    }

    /** Driver is already carrying only orders for this batch zone, and has room for more. */
    private function onSameRun(Driver $d, \App\Models\Zone $zone): bool
    {
        $active = $d->activeOrders()->with('address')->get();

        return $active->count() < $zone->batch_max_orders && $active->every(fn (Order $o) => $o->status !== 'picked_up'
            && $o->address && \App\Models\Zone::batchFor($o->address->lat, $o->address->lng)?->id === $zone->id);
    }

    public function accept(DispatchOffer $offer): Order
    {
        return DB::transaction(function () use ($offer) {
            $offer = DispatchOffer::lockForUpdate()->findOrFail($offer->id);
            $order = Order::lockForUpdate()->findOrFail($offer->order_id);

            abort_unless($offer->isLive(), 410, 'This offer has expired.');
            abort_if($order->driver_id, 409, 'Another driver already took this order.');

            $offer->update(['status' => 'accepted', 'responded_at' => now()]);
            $order->update(['driver_id' => $offer->driver_id, 'driver_pay_zig' => $offer->pay_zig]);
            $this->recalcAcceptance($offer->driver);

            OrderUpdated::dispatch($order->fresh());
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
        $this->recalcAcceptance($offer->driver);
        $this->dispatch($offer->order);
    }

    /** Admin manual assignment (ops command centre). */
    public function assign(Order $order, Driver $driver): Order
    {
        $order->dispatchOffers()->where('status', 'offered')->update(['status' => 'cancelled']);
        $offer = $order->dispatchOffers()->create([
            'driver_id' => $driver->id, 'pay_zig' => $order->driver_pay_zig ?: $this->pricing->driverPay($order->distance_km),
            'expires_at' => now()->addMinutes(5),
        ]);

        return $this->accept($offer);
    }

    /** Expire stale offers and re-offer. Called by the scheduler and on driver polls. */
    public function sweep(): int
    {
        $expired = DispatchOffer::where('status', 'offered')->where('expires_at', '<=', now())->with('order', 'driver')->get();
        foreach ($expired as $offer) {
            $offer->update(['status' => 'expired']);
            $this->recalcAcceptance($offer->driver);
        }

        // Anything still waiting for a driver gets another attempt.
        Order::where('fulfilment', 'delivery')->whereNull('driver_id')
            ->whereIn('status', ['accepted', 'preparing', 'ready'])
            ->get()
            ->each(fn (Order $o) => $this->dispatch($o));

        return $expired->count();
    }

    private function recalcAcceptance(Driver $driver): void
    {
        $recent = $driver->offers()->whereIn('status', ['accepted', 'declined', 'expired'])->latest()->limit(50)->pluck('status');
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

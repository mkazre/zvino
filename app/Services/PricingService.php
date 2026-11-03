<?php

namespace App\Services;

use App\Models\PromoCode;
use App\Models\Setting;
use App\Models\Subscription;
use App\Models\User;
use App\Models\Vendor;
use App\Models\Zone;
use App\Support\Geo;
use Illuminate\Validation\ValidationException;

/**
 * Single source of truth for what an order costs. Used by the cart, checkout,
 * group orders and the website so every surface shows the same numbers.
 */
class PricingService
{
    public function __construct(private StoreAvailability $availability) {}

    /**
     * @param  array{lat?: float|null, lng?: float|null}  $dest
     */
    public function quote(Vendor $vendor, float $subtotal, string $fulfilment, array $dest = [], ?User $user = null, ?PromoCode $promo = null, float $tip = 0): array
    {
        $zone = $vendor->zone;
        $km = null;
        $delivery = 0.0;
        $surge = 1.0;

        if ($fulfilment === 'delivery') {
            if (isset($dest['lat'], $dest['lng']) && $vendor->lat && $vendor->lng) {
                $km = Geo::roadKm($vendor->lat, $vendor->lng, $dest['lat'], $dest['lng']);
                $maxKm = min($vendor->delivery_radius_km, $zone?->max_delivery_km ?? 99);
                if ($km > $maxKm) {
                    throw ValidationException::withMessages(['address_id' => "{$vendor->name} doesn’t deliver this far ({$km} km, max {$maxKm} km)."]);
                }
            }
            $delivery = $this->deliveryFee($vendor, $zone, $km);
            $surge = Setting::get('fees.surge_enabled') ? min($zone?->surge_multiplier ?? 1, Setting::get('fees.max_surge')) : 1;
            $delivery = round($delivery * $surge, 2);
        }

        $servicePct = (float) Setting::get('fees.service_fee_pct');
        $service = $subtotal > 0 ? $subtotal * $servicePct / 100 : 0;
        $service = $subtotal > 0 ? max(Setting::get('fees.service_fee_min_zig'), min(Setting::get('fees.service_fee_max_zig'), $service)) : 0;

        $smallOrder = $subtotal > 0 && $subtotal < Setting::get('fees.small_order_threshold_zig') ? (float) Setting::get('fees.small_order_fee_zig') : 0.0;

        // Zvino+ perks
        $plan = $user ? Subscription::with('plan')->where('user_id', $user->id)->latest()->get()->first(fn ($s) => $s->isActive())?->plan : null;
        $memberSavings = 0.0;
        if ($plan) {
            if ($fulfilment === 'delivery' && $subtotal >= $plan->min_order_for_free_delivery_zig) {
                $memberSavings += $delivery;
                $delivery = 0.0;
            }
            $cut = round($service * $plan->service_fee_discount_pct / 100, 2);
            $service -= $cut;
            $memberSavings += $cut;
            $smallOrder = 0.0;
        }

        $discount = 0.0;
        if ($promo && $promo->isUsableFor($subtotal, $vendor->id)) {
            $discount = $promo->discountFor($subtotal, $delivery);
        }

        $tip = Setting::get('orders.allow_tips') ? max(0, round($tip, 2)) : 0.0;
        $total = max(0, $subtotal + $delivery + $service + $smallOrder - $discount) + $tip;
        $total = $this->round($total);

        $vatPct = (float) Setting::get('currency.vat_pct');
        $taxable = $total - $tip;
        $vat = Setting::get('currency.prices_include_vat')
            ? round($taxable - $taxable / (1 + $vatPct / 100), 2)
            : round($taxable * $vatPct / 100, 2);
        if (! Setting::get('currency.prices_include_vat')) {
            $total = $this->round($total + $vat);
        }

        $prep = $this->availability->prepMinutes($vendor);
        $ride = $km ? Geo::rideMinutes($km) : 15;
        $eta = $fulfilment === 'delivery' ? [$prep + $ride + ($zone?->extra_eta_minutes ?? 0), $prep + $ride + ($zone?->extra_eta_minutes ?? 0) + 10] : [$prep, $prep + 5];

        return [
            'subtotal' => round($subtotal, 2),
            'delivery' => round($delivery, 2),
            'service' => round($service, 2),
            'small_order' => round($smallOrder, 2),
            'discount' => round($discount, 2),
            'tip' => $tip,
            'vat' => $vat,
            'total' => $total,
            'member_savings' => round($memberSavings, 2),
            'surge' => $surge > 1 ? ['multiplier' => $surge, 'reason' => $zone?->surge_reason] : null,
            'distance_km' => $km,
            'eta_minutes' => $eta,
            'zone_id' => $zone?->id,
        ];
    }

    public function deliveryFee(Vendor $vendor, ?Zone $zone, ?float $km): float
    {
        if (! $zone) {
            return (float) $vendor->delivery_fee_zig;
        }
        $extraKm = $km ? max(0, $km - $zone->free_km) : 0;

        return round($zone->base_delivery_fee_zig + $extraKm * $zone->per_km_fee_zig, 2);
    }

    /** What the driver earns for a trip (before tip). */
    public function driverPay(?float $km): float
    {
        return round(Setting::get('delivery.driver_base_pay_zig') + ($km ?? 3) * Setting::get('delivery.driver_per_km_zig'), 2);
    }

    private function round(float $amount): float
    {
        $step = (float) Setting::get('currency.rounding') ?: 0.01;

        return round(ceil(round($amount / $step, 6)) * $step, 2);
    }
}

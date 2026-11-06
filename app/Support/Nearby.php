<?php

namespace App\Support;

use App\Models\Address;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Distances between the customer and stores / saved addresses.
 * Stores are shown when they deliver to the active location (within their delivery radius).
 */
class Nearby
{
    /** Great-circle distance in km. */
    public static function km(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return $r * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /** How close (metres) the phone must be to a saved address to pick it automatically. */
    public static function matchRadiusMetres(): int
    {
        return (int) (Setting::get('delivery.address_match_radius_m') ?: 75);
    }

    /** The saved address the customer is standing at (if any). */
    public static function nearestAddress(?User $user, float $lat, float $lng, ?int $metres = null): ?Address
    {
        if (! $user) {
            return null;
        }
        $limit = ($metres ?? self::matchRadiusMetres()) / 1000;

        return $user->addresses()->whereNotNull('lat')->get()
            ->map(fn (Address $a) => [$a, self::km($lat, $lng, (float) $a->lat, (float) $a->lng)])
            ->filter(fn ($p) => $p[1] <= $limit)
            ->sortBy(fn ($p) => $p[1])
            ->first()[0] ?? null;
    }

    /**
     * Keep stores that deliver to the location, nearest first, with ->distance_km set.
     * Stores without coordinates are kept only when nothing else is known about them.
     */
    public static function filter(Collection $vendors, ?array $loc, bool $sortByDistance = true): Collection
    {
        if (! $loc || ! isset($loc['lat'], $loc['lng'])) {
            return $vendors;
        }
        $out = $vendors->filter(function ($v) use ($loc) {
            if ($v->lat === null || $v->lng === null) {
                return false;
            }
            $v->distance_km = round(self::km((float) $loc['lat'], (float) $loc['lng'], (float) $v->lat, (float) $v->lng), 1);

            return $v->distance_km <= max(1.0, (float) ($v->delivery_radius_km ?: 8));
        });

        return ($sortByDistance ? $out->sortBy('distance_km') : $out)->values();
    }
}

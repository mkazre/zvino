<?php

namespace App\Services;

use App\Models\Driver;
use App\Models\Setting;

/**
 * Driver tiers (#29): Bronze → Silver → Gold from deliveries, rating and acceptance.
 * Higher tiers get first pick of nearby jobs and a percentage bonus on trip pay.
 */
class DriverTierService
{
    public const TIERS = ['bronze', 'silver', 'gold'];

    public function tierFor(Driver $driver): string
    {
        if (! Setting::get('drivers.tiers_enabled')) {
            return 'bronze';
        }
        if ($driver->completed_deliveries >= Setting::get('drivers.gold_min_trips')
            && $driver->rating >= Setting::get('drivers.gold_min_rating')
            && $driver->acceptance_rate >= Setting::get('drivers.gold_min_acceptance')) {
            return 'gold';
        }
        if ($driver->completed_deliveries >= Setting::get('drivers.silver_min_trips')
            && $driver->rating >= Setting::get('drivers.silver_min_rating')) {
            return 'silver';
        }

        return 'bronze';
    }

    public function refresh(Driver $driver): string
    {
        $tier = $this->tierFor($driver);
        if ($tier !== $driver->tier) {
            $up = array_search($tier, self::TIERS) > array_search($driver->tier, self::TIERS);
            $driver->update(['tier' => $tier]);
            if ($up && $driver->user) {
                app(PushService::class)->toUser($driver->user, 'driver_tier', 'You’re now '.ucfirst($tier).' 🎉',
                    "You get first pick of nearby jobs and +{$this->bonusPct($tier)}% on every trip.", ['tier' => $tier]);
            }
        }

        return $tier;
    }

    public function bonusPct(string $tier): float
    {
        if (! Setting::get('drivers.tiers_enabled')) {
            return 0;
        }

        return (float) match ($tier) {
            'gold' => Setting::get('drivers.gold_bonus_pct'),
            'silver' => Setting::get('drivers.silver_bonus_pct'),
            default => 0,
        };
    }

    /** Head start in km when ranking drivers for an offer. */
    public function priorityKm(string $tier): float
    {
        return Setting::get('drivers.tiers_enabled') ? ['gold' => 1.0, 'silver' => 0.5][$tier] ?? 0 : 0;
    }

    /** Progress toward the next tier, for the driver app. */
    public function progress(Driver $driver): array
    {
        $tier = $driver->tier ?: 'bronze';
        $next = ['bronze' => 'silver', 'silver' => 'gold'][$tier] ?? null;

        return [
            'tier' => $tier,
            'bonus_pct' => $this->bonusPct($tier),
            'next' => $next ? [
                'tier' => $next,
                'trips_needed' => max(0, (int) Setting::get("drivers.{$next}_min_trips") - $driver->completed_deliveries),
                'min_rating' => (float) Setting::get("drivers.{$next}_min_rating"),
                'min_acceptance' => $next === 'gold' ? (float) Setting::get('drivers.gold_min_acceptance') : null,
                'bonus_pct' => $this->bonusPct($next),
            ] : null,
            'stats' => ['trips' => $driver->completed_deliveries, 'rating' => $driver->rating, 'acceptance' => $driver->acceptance_rate],
        ];
    }
}

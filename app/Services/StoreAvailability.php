<?php

namespace App\Services;

use App\Models\Vendor;
use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

/**
 * Is a store taking orders right now (or at a scheduled time), and how long will it take?
 * Hours may cross midnight (e.g. 18:00–02:00). No hours rows = open 24/7.
 */
class StoreAvailability
{
    public function status(Vendor $vendor, ?CarbonInterface $at = null): array
    {
        $at = Carbon::instance($at ?? now())->timezone(config('app.timezone'));

        $reason = match (true) {
            $vendor->status !== 'active' => 'inactive',
            $vendor->paused_until?->isFuture() ?? false => 'paused',
            $this->closedOn($vendor, $at) => 'holiday',
            ! $this->withinHours($vendor, $at) => 'closed',
            default => null,
        };

        return [
            'is_open' => $reason === null,
            'reason' => $reason,
            'is_busy' => (bool) $vendor->is_busy,
            'power_out' => (bool) $vendor->power_out,
            'prep_minutes' => $this->prepMinutes($vendor),
            'next_open_at' => $reason ? $this->nextOpening($vendor, $at)?->toIso8601String() : null,
            'paused_until' => $vendor->paused_until?->toIso8601String(),
        ];
    }

    public function isOpen(Vendor $vendor, ?CarbonInterface $at = null): bool
    {
        return $this->status($vendor, $at)['is_open'];
    }

    public function prepMinutes(Vendor $vendor): int
    {
        return $vendor->prep_minutes
            + ($vendor->is_busy ? $vendor->busy_extra_minutes : 0)
            + ($vendor->power_out ? $vendor->power_out_extra_minutes : 0);
    }

    private function closedOn(Vendor $vendor, CarbonInterface $at): bool
    {
        return $vendor->closures()->whereDate('date', $at->toDateString())->exists();
    }

    private function withinHours(Vendor $vendor, CarbonInterface $at): bool
    {
        $hours = $vendor->hours;
        if ($hours->isEmpty()) {
            return true;
        }

        $time = $at->format('H:i:s');
        $today = $at->dayOfWeek;
        $yesterday = ($today + 6) % 7;

        foreach ($hours as $h) {
            $overnight = $h->closes_at <= $h->opens_at;
            if ($h->weekday === $today && $time >= $h->opens_at && ($overnight || $time < $h->closes_at)) {
                return true;
            }
            // Yesterday's overnight shift still running past midnight.
            if ($overnight && $h->weekday === $yesterday && $time < $h->closes_at) {
                return true;
            }
        }

        return false;
    }

    /** Looks up to 8 days ahead for the next opening time. */
    public function nextOpening(Vendor $vendor, CarbonInterface $from): ?Carbon
    {
        if ($vendor->status !== 'active') {
            return null;
        }
        if ($vendor->paused_until?->isFuture() && $this->withinHours($vendor, $vendor->paused_until)) {
            return Carbon::instance($vendor->paused_until);
        }

        $hours = $vendor->hours;
        if ($hours->isEmpty()) {
            return $vendor->paused_until?->isFuture() ? Carbon::instance($vendor->paused_until) : null;
        }

        for ($d = 0; $d <= 8; $d++) {
            $day = Carbon::instance($from)->startOfDay()->addDays($d);
            foreach ($hours->where('weekday', $day->dayOfWeek)->sortBy('opens_at') as $h) {
                $open = $day->copy()->setTimeFromTimeString($h->opens_at);
                if ($open->greaterThan($from) && ! $this->closedOn($vendor, $open)) {
                    return $open;
                }
            }
        }

        return null;
    }
}

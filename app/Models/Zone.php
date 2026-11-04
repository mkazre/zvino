<?php

namespace App\Models;

use App\Support\Geo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Zone extends Model
{
    protected $guarded = [];
    protected $casts = [
        'polygon' => 'array', 'is_active' => 'boolean',
        'base_delivery_fee_zig' => 'float', 'per_km_fee_zig' => 'float', 'free_km' => 'float',
        'max_delivery_km' => 'float', 'min_order_zig' => 'float', 'surge_multiplier' => 'float',
        'batch_mode' => 'boolean', 'batch_times' => 'array',
    ];

    /**
     * Peri-urban batch runs (#21): Chitungwiza, Ruwa, Norton, Epworth… are served by scheduled
     * departures instead of one-off trips. Returns the batch zone covering a drop-off, if any.
     */
    public static function batchFor(?float $lat, ?float $lng): ?self
    {
        if ($lat === null || $lng === null || ! Setting::get('delivery.batch_runs')) {
            return null;
        }

        return static::where('is_active', true)->where('batch_mode', true)->get()
            ->first(fn (self $z) => count($z->polygon ?? []) >= 3 && \App\Support\Geo::inPolygon($lat, $lng, $z->polygon));
    }

    /** Departure for an order from $vendor (or the run after a requested time), with the promised arrival. */
    public function batchSlot(Vendor $vendor, ?\Illuminate\Support\Carbon $after = null): ?array
    {
        $prep = app(\App\Services\StoreAvailability::class)->prepMinutes($vendor);
        $departs = $after ? $this->nextDeparture(0, $after->copy()->subMinutes(60)) : $this->nextDeparture($prep + 10);
        if (! $departs) {
            return null;
        }
        $ride = 35 + (int) $this->extra_eta_minutes; // peri-urban leg, incl. drops on the way

        return ['zone' => $this->name, 'departs_at' => $departs, 'arrives_at' => $departs->copy()->addMinutes($ride)];
    }

    /** Next departure from the store at least $leadMinutes from now (rolls over to tomorrow). */
    public function nextDeparture(int $leadMinutes = 30, ?\Illuminate\Support\Carbon $from = null): ?\Illuminate\Support\Carbon
    {
        $times = collect($this->batch_times ?? [])->filter(fn ($t) => preg_match('/^\d{2}:\d{2}$/', $t))->sort()->values();
        if ($times->isEmpty()) {
            return null;
        }
        $earliest = ($from ?? now())->copy()->addMinutes($leadMinutes);
        for ($d = 0; $d <= 1; $d++) {
            foreach ($times as $t) {
                [$h, $m] = array_map('intval', explode(':', $t));
                $at = $earliest->copy()->startOfDay()->addDays($d)->setTime($h, $m);
                if ($at->gte($earliest)) {
                    return $at;
                }
            }
        }

        return null;
    }

    public function vendors(): HasMany { return $this->hasMany(Vendor::class); }
    public function drivers(): HasMany { return $this->hasMany(Driver::class); }

    public function contains(float $lat, float $lng): bool
    {
        return Geo::inPolygon($lat, $lng, $this->polygon ?? []);
    }

    public static function at(float $lat, float $lng): ?self
    {
        return static::where('is_active', true)->get()->first(fn (Zone $z) => $z->contains($lat, $lng));
    }
}

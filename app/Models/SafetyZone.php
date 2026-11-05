<?php

namespace App\Models;

use App\Support\Geo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Night safety zone (#23): an area ops has flagged as risky after dark. Drivers get a warning on
 * offers that drop off there, and drivers who opt out are not offered those jobs at night.
 */
class SafetyZone extends Model
{
    protected $guarded = [];
    protected $casts = ['lat' => 'float', 'lng' => 'float', 'radius_km' => 'float', 'is_active' => 'boolean'];

    public function contains(?float $lat, ?float $lng): bool
    {
        return $lat !== null && $lng !== null && Geo::km($this->lat, $this->lng, $lat, $lng) <= $this->radius_km;
    }

    /** Night window may cross midnight (19:00 → 05:00). */
    public function isNightAt(?Carbon $at = null): bool
    {
        $t = ($at ?? now())->format('H:i');
        $from = substr($this->night_from, 0, 5);
        $to = substr($this->night_to, 0, 5);

        return $from <= $to ? ($t >= $from && $t < $to) : ($t >= $from || $t < $to);
    }

    /** The active zone covering this point right now, if any. */
    public static function activeAt(?float $lat, ?float $lng, ?Carbon $at = null): ?self
    {
        if (! Setting::get('drivers.night_zones_enabled') || $lat === null || $lng === null) {
            return null;
        }

        return static::where('is_active', true)->get()->first(fn (self $z) => $z->contains($lat, $lng) && $z->isNightAt($at));
    }
}

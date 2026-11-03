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
    ];

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

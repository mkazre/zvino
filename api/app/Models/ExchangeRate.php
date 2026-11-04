<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ExchangeRate extends Model
{
    protected $guarded = [];
    protected $casts = ['effective_at' => 'datetime', 'zig_per_usd' => 'float'];

    public static function current(): float
    {
        return (float) (static::where('effective_at', '<=', now())->latest('effective_at')->value('zig_per_usd')
            ?? config('zvino.default_zig_per_usd'));
    }

    public static function toUsd(float $zig, ?float $rate = null): float
    {
        return round($zig / ($rate ?? static::current()), 2);
    }
}

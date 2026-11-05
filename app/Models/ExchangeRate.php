<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Once;

class ExchangeRate extends Model
{
    protected $guarded = [];
    protected $casts = ['effective_at' => 'datetime', 'zig_per_usd' => 'float'];

    protected static function booted(): void
    {
        // current() is remembered for the request; a new rate must be visible straight away.
        static::saved(fn () => Once::flush());
    }

    public static function current(): float
    {
        return once(fn () => (float) (static::where('effective_at', '<=', now())->latest('effective_at')->value('zig_per_usd')
            ?? config('zvino.default_zig_per_usd')));
    }

    public static function toUsd(float $zig, ?float $rate = null): float
    {
        return round($zig / ($rate ?: static::current()), 2);
    }
}

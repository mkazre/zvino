<?php

namespace App\Support;

use App\Models\ExchangeRate;

/** Every price leaves the API in both currencies; ZiG is the stored source of truth. */
class Money
{
    public static function both(float $zig, ?float $rate = null): array
    {
        return ['zig' => round($zig, 2), 'usd' => ExchangeRate::toUsd($zig, $rate)];
    }
}

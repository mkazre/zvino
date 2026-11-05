<?php

namespace App\Support;

use App\Models\ExchangeRate;
use App\Models\Setting;
use Illuminate\Http\Request;

/** Every price leaves the API in both currencies; ZiG is the stored source of truth. */
class Money
{
    public const COOKIE = 'zvino_currency';

    public static function both(float $zig, ?float $rate = null): array
    {
        return ['zig' => round($zig, 2), 'usd' => ExchangeRate::toUsd($zig, $rate)];
    }

    /** Platform default from Admin → Settings → Currency (ZIG or USD). */
    public static function defaultCurrency(): string
    {
        return Setting::get('currency.primary') === 'USD' ? 'USD' : 'ZIG';
    }

    /**
     * What the website/admin shows first for this visitor: their own choice from the currency
     * switcher (cookie) if they made one, otherwise the platform default.
     */
    public static function display(Request $request): array
    {
        $choice = $request->cookie(self::COOKIE);

        return [
            'primary' => in_array($choice, ['ZIG', 'USD'], true) ? $choice : self::defaultCurrency(),
            'default' => self::defaultCurrency(),
            'show_secondary' => (bool) (Setting::get('currency.show_secondary') ?? true),
            'rate' => ExchangeRate::current(),
        ];
    }
}

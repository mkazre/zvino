<?php

namespace App\Support;

use App\Models\Setting;

/**
 * Brand colours from Settings → Branding, shared by the website, admin and the apps.
 * Colours derived from the main ones (hover/text shades, soft tints) are computed here so
 * changing one colour in the admin restyles everything consistently.
 */
class Brand
{
    public static function palette(): array
    {
        $primary = self::hex(Setting::get('branding.primary_color'), '#17C74A');
        $accent = self::hex(Setting::get('branding.accent_color'), '#FDE500');
        $danger = self::hex(Setting::get('branding.danger_color'), '#DF302D');

        return [
            'primary' => $primary,
            'primary_dark' => self::mix($primary, '#000000', 0.3),   // readable text/links on white, hover
            'primary_soft' => self::mix($primary, '#ffffff', 0.88),
            'on_primary' => self::onColor($primary),
            'accent' => $accent,
            'accent_dark' => self::mix($accent, '#000000', 0.45),
            'accent_soft' => self::mix($accent, '#ffffff', 0.85),
            'on_accent' => self::onColor($accent),
            'danger' => $danger,
            'danger_soft' => self::mix($danger, '#ffffff', 0.9),
            'ink' => '#222222',
            'background' => '#ffffff',
        ];
    }

    public static function logos(): array
    {
        return [
            'logo' => Setting::get('branding.logo') ?: '/brand/logo.png',
            'logo_dark' => Setting::get('branding.logo_dark') ?: '/brand/logo-inverse.png',
            'mark' => Setting::get('branding.app_icon') ?: '/brand/mark.png',
        ];
    }

    public static function version(): array
    {
        return ['version' => config('zvino.version'), 'build' => config('zvino.build')];
    }

    private static function hex(?string $v, string $fallback): string
    {
        return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtoupper($v) : $fallback;
    }

    private static function rgb(string $hex): array
    {
        return [hexdec(substr($hex, 1, 2)), hexdec(substr($hex, 3, 2)), hexdec(substr($hex, 5, 2))];
    }

    private static function mix(string $a, string $b, float $t): string
    {
        [$r1, $g1, $b1] = self::rgb($a);
        [$r2, $g2, $b2] = self::rgb($b);

        return sprintf('#%02X%02X%02X', round($r1 + ($r2 - $r1) * $t), round($g1 + ($g2 - $g1) * $t), round($b1 + ($b2 - $b1) * $t));
    }

    /** Black or white text, whichever reads better on the colour. */
    private static function onColor(string $hex): string
    {
        [$r, $g, $b] = array_map(fn ($c) => ($c /= 255) <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4, self::rgb($hex));
        $l = 0.2126 * $r + 0.7152 * $g + 0.0722 * $b;

        return $l > 0.3 ? '#111111' : '#FFFFFF'; // bright colours (green, yellow) get dark text; red/dark get white
    }
}

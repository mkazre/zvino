<?php

namespace App\Support;

class Phone
{
    /** Zimbabwe numbers: 0771234567 / 771234567 → +263771234567 (international numbers pass through). */
    public static function normalise(?string $phone): ?string
    {
        if ($phone === null || trim($phone) === '') {
            return null;
        }
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        } elseif (str_starts_with($digits, '0')) {
            $digits = '263'.substr($digits, 1);
        } elseif (strlen($digits) === 9) {
            $digits = '263'.$digits;
        }

        return '+'.$digits;
    }
}

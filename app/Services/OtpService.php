<?php

namespace App\Services;

use App\Models\OtpCode;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class OtpService
{
    public function send(string $phone): void
    {
        $len = config('zvino.otp.length');
        $code = app()->isProduction()
            ? str_pad((string) random_int(0, 10 ** $len - 1), $len, '0', STR_PAD_LEFT)
            : config('zvino.otp.dev_code');

        OtpCode::where('phone', $phone)->delete();
        OtpCode::create([
            'phone' => $phone,
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes(config('zvino.otp.ttl_minutes')),
        ]);

        // TODO: plug in SMS provider (e.g. Twilio, Africa's Talking, BulkSMS Zimbabwe).
        Log::info("OTP for $phone: $code");
    }

    public function verify(string $phone, string $code): bool
    {
        $otp = OtpCode::where('phone', $phone)->latest()->first();
        if (! $otp || $otp->expires_at->isPast() || $otp->attempts >= config('zvino.otp.max_attempts')) {
            return false;
        }

        if (! Hash::check($code, $otp->code_hash)) {
            $otp->increment('attempts');

            return false;
        }

        $otp->delete();

        return true;
    }
}

<?php

return [
    // Fallback ZiG/USD rate when no exchange_rates row exists yet.
    'default_zig_per_usd' => env('ZVINO_DEFAULT_ZIG_PER_USD', 26.8),

    'vat_pct' => env('ZVINO_VAT_PCT', 15.5),
    'service_fee_zig' => env('ZVINO_SERVICE_FEE_ZIG', 5),

    // Points earned per 1 ZiG spent, and tier thresholds by lifetime points.
    'loyalty' => [
        'points_per_zig' => 0.1,
        'tiers' => ['Bronze' => 0, 'Silver' => 500, 'Gold' => 2000, 'Platinum' => 5000],
    ],

    'otp' => [
        'length' => 6,
        'ttl_minutes' => 5,
        'max_attempts' => 5,
        // In local/testing, OTP is logged and this fixed code is accepted.
        'dev_code' => env('ZVINO_OTP_DEV_CODE', '123456'),
    ],

    'cities' => ['Harare', 'Bulawayo'],

    'min_app_version' => env('ZVINO_MIN_APP_VERSION', '1.0.0'),
    // Shown in footers / About screens. Bump on each release (APP_VERSION in .env overrides).
    'version' => env('APP_VERSION', '1.0.0'),
    'build' => env('APP_BUILD', null),

    'paynow' => [
        'integration_id' => env('PAYNOW_INTEGRATION_ID'),
        'integration_key' => env('PAYNOW_INTEGRATION_KEY'),
        'result_url' => env('PAYNOW_RESULT_URL'),   // defaults to /api/payments/webhook/paynow
        'return_url' => env('PAYNOW_RETURN_URL'),
        'merchant_email' => env('PAYNOW_MERCHANT_EMAIL'),
        // When true (or keys missing), payments are simulated and auto-approved.
        'fake' => env('PAYNOW_FAKE', true),
    ],

    'expo_push_url' => 'https://exp.host/--/api/v2/push/send',
];

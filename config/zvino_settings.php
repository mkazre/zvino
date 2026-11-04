<?php

/*
 * Every operational setting the admin can change, grouped by settings tab.
 * Types: string, text, bool, int, decimal, money (ZiG), percent, select, color, image, json, time, list.
 * Read with Setting::get('group.key'); values fall back to 'default' below.
 */

return [
    'general' => [
        'label' => 'Business',
        'icon' => 'building',
        'fields' => [
            'business_name' => ['type' => 'string', 'label' => 'Business name', 'default' => 'Zvino'],
            'legal_name' => ['type' => 'string', 'label' => 'Registered company name', 'default' => ''],
            'vat_number' => ['type' => 'string', 'label' => 'VAT / BP number', 'default' => ''],
            'support_phone' => ['type' => 'string', 'label' => 'Support phone', 'default' => '+263 242 000 000'],
            'support_whatsapp' => ['type' => 'string', 'label' => 'Support WhatsApp', 'default' => ''],
            'support_email' => ['type' => 'string', 'label' => 'Support email', 'default' => 'help@zvino.co.zw'],
            'address' => ['type' => 'text', 'label' => 'Head office address', 'default' => 'Harare, Zimbabwe'],
            'timezone' => ['type' => 'select', 'label' => 'Timezone', 'default' => 'Africa/Harare', 'options' => ['Africa/Harare']],
            'cities' => ['type' => 'list', 'label' => 'Launch cities', 'default' => ['Harare', 'Bulawayo']],
            'platform_mode' => ['type' => 'select', 'label' => 'Platform mode', 'default' => 'marketplace', 'options' => ['marketplace', 'single'], 'help' => 'Single mode shows one restaurant only.'],
            'single_vendor_id' => ['type' => 'int', 'label' => 'Single-mode restaurant ID', 'default' => null],
        ],
    ],

    'branding' => [
        'label' => 'Branding',
        'icon' => 'palette',
        'fields' => [
            'logo' => ['type' => 'image', 'label' => 'Logo', 'default' => null],
            'logo_dark' => ['type' => 'image', 'label' => 'Logo (dark backgrounds)', 'default' => null],
            'app_icon' => ['type' => 'image', 'label' => 'App icon', 'default' => null],
            'primary_color' => ['type' => 'color', 'label' => 'Primary colour', 'default' => '#0B6E4F'],
            'accent_color' => ['type' => 'color', 'label' => 'Accent colour', 'default' => '#D9A520'],
            'tagline' => ['type' => 'string', 'label' => 'Tagline', 'default' => 'Zimbabwe’s favourite food, delivered.'],
            'social_facebook' => ['type' => 'string', 'label' => 'Facebook URL', 'default' => ''],
            'social_instagram' => ['type' => 'string', 'label' => 'Instagram URL', 'default' => ''],
            'social_tiktok' => ['type' => 'string', 'label' => 'TikTok URL', 'default' => ''],
        ],
    ],

    'currency' => [
        'label' => 'Currency & tax',
        'icon' => 'coins',
        'fields' => [
            'primary' => ['type' => 'select', 'label' => 'Primary currency', 'default' => 'ZIG', 'options' => ['ZIG', 'USD']],
            'show_secondary' => ['type' => 'bool', 'label' => 'Show USD alongside ZiG', 'default' => true],
            'auto_rate' => ['type' => 'bool', 'label' => 'Fetch RBZ rate daily', 'default' => false, 'help' => 'Otherwise set the rate manually below.'],
            'zig_per_usd' => ['type' => 'decimal', 'label' => 'ZiG per USD', 'default' => 26.8],
            'vat_pct' => ['type' => 'percent', 'label' => 'VAT', 'default' => 15.5],
            'prices_include_vat' => ['type' => 'bool', 'label' => 'Menu prices include VAT', 'default' => true],
            'rounding' => ['type' => 'select', 'label' => 'Round totals to', 'default' => '0.01', 'options' => ['0.01', '0.10', '0.50', '1.00']],
        ],
    ],

    'fees' => [
        'label' => 'Fees & pricing',
        'icon' => 'receipt',
        'fields' => [
            'service_fee_pct' => ['type' => 'percent', 'label' => 'Service fee', 'default' => 5],
            'service_fee_min_zig' => ['type' => 'money', 'label' => 'Minimum service fee', 'default' => 3],
            'service_fee_max_zig' => ['type' => 'money', 'label' => 'Maximum service fee', 'default' => 40],
            'small_order_threshold_zig' => ['type' => 'money', 'label' => 'Small-order threshold', 'default' => 60],
            'small_order_fee_zig' => ['type' => 'money', 'label' => 'Small-order fee', 'default' => 8],
            'default_commission_pct' => ['type' => 'percent', 'label' => 'Default store commission', 'default' => 15],
            'pickup_commission_pct' => ['type' => 'percent', 'label' => 'Commission on pickup orders', 'default' => 8],
            'surge_enabled' => ['type' => 'bool', 'label' => 'Allow surge pricing on zones', 'default' => true],
            'max_surge' => ['type' => 'decimal', 'label' => 'Maximum surge multiplier', 'default' => 2],
            'fuel_index_enabled' => ['type' => 'bool', 'label' => 'Fuel-indexed per-km fees', 'default' => false, 'help' => 'Per-km delivery fees and driver per-km pay move with the fuel price.'],
            'fuel_base_price_usd' => ['type' => 'decimal', 'label' => 'Base fuel price (USD/litre)', 'default' => 1.55, 'help' => 'The price your zone per-km fees were set at.'],
            'fuel_current_price_usd' => ['type' => 'decimal', 'label' => 'Current fuel price (USD/litre)', 'default' => 1.55, 'help' => 'Update when ZERA announces new prices.'],
            'rain_surge' => ['type' => 'decimal', 'label' => 'Rain-mode surge', 'default' => 1.25, 'help' => 'Applied to every zone with one tap on Zones & fees.'],
        ],
    ],

    'fraud' => [
        'label' => 'Fraud & risk',
        'icon' => 'shield',
        'fields' => [
            'enabled' => ['type' => 'bool', 'label' => 'Fraud shield', 'default' => true],
            'max_orders_per_hour' => ['type' => 'int', 'label' => 'Max orders per customer per hour', 'default' => 5],
            'new_account_cod_limit_zig' => ['type' => 'money', 'label' => 'Cash-on-delivery limit for new customers', 'default' => 300, 'help' => 'Until their first delivered order.'],
            'max_open_refund_requests' => ['type' => 'int', 'label' => 'Max open refund requests per customer', 'default' => 2],
            'refund_rate_alert_pct' => ['type' => 'percent', 'label' => 'Flag customers whose refunds exceed', 'default' => 25, 'help' => 'Percent of their lifetime spend. Flagged customers need manual refund approval.'],
        ],
    ],

    'delivery' => [
        'label' => 'Delivery & dispatch',
        'icon' => 'bike',
        'fields' => [
            'dispatch_mode' => ['type' => 'select', 'label' => 'Dispatch mode', 'default' => 'auto', 'options' => ['auto', 'manual'], 'help' => 'Auto offers jobs to the nearest online driver.'],
            'offer_timeout_seconds' => ['type' => 'int', 'label' => 'Driver offer timeout (s)', 'default' => 45],
            'max_offer_radius_km' => ['type' => 'decimal', 'label' => 'Driver search radius (km)', 'default' => 6],
            'max_offer_attempts' => ['type' => 'int', 'label' => 'Offers before alerting dispatch', 'default' => 5],
            'dispatch_when' => ['type' => 'select', 'label' => 'Find a driver when', 'default' => 'accepted', 'options' => ['accepted', 'near_ready'], 'help' => 'Near ready = when prep is 5 minutes from done.'],
            'allow_batching' => ['type' => 'bool', 'label' => 'Batch 2 orders from the same store', 'default' => true],
            'driver_base_pay_zig' => ['type' => 'money', 'label' => 'Driver base pay per trip', 'default' => 12],
            'driver_per_km_zig' => ['type' => 'money', 'label' => 'Driver pay per km', 'default' => 3.5],
            'driver_keeps_tips_pct' => ['type' => 'percent', 'label' => 'Share of tips to driver', 'default' => 100],
            'require_delivery_pin' => ['type' => 'bool', 'label' => 'Require customer PIN at drop-off', 'default' => false],
            'require_proof_photo' => ['type' => 'bool', 'label' => 'Require photo for leave-at-door', 'default' => true],
            'cash_on_delivery_limit_zig' => ['type' => 'money', 'label' => 'Max cash-on-delivery order', 'default' => 1500],
            'driver_cash_limit_zig' => ['type' => 'money', 'label' => 'Max cash a driver may hold', 'default' => 3000],
            'location_interval_seconds' => ['type' => 'int', 'label' => 'Driver GPS update interval (s)', 'default' => 10],
        ],
    ],

    'orders' => [
        'label' => 'Orders',
        'icon' => 'clipboard',
        'fields' => [
            'store_accept_timeout_minutes' => ['type' => 'int', 'label' => 'Auto-cancel if store doesn’t accept within (min)', 'default' => 8],
            'customer_cancel_window_minutes' => ['type' => 'int', 'label' => 'Free cancellation window (min)', 'default' => 2],
            'allow_scheduled' => ['type' => 'bool', 'label' => 'Allow scheduled orders', 'default' => true],
            'schedule_days_ahead' => ['type' => 'int', 'label' => 'Schedule up to (days ahead)', 'default' => 3],
            'allow_tips' => ['type' => 'bool', 'label' => 'Allow tips', 'default' => true],
            'tip_presets_pct' => ['type' => 'list', 'label' => 'Tip presets (%)', 'default' => [5, 10, 15]],
            'allow_group_orders' => ['type' => 'bool', 'label' => 'Allow group orders', 'default' => true],
            'allow_pickup' => ['type' => 'bool', 'label' => 'Allow pickup orders', 'default' => true],
            'review_window_days' => ['type' => 'int', 'label' => 'Reviews allowed for (days)', 'default' => 7],
            'auto_refund_missing_items' => ['type' => 'bool', 'label' => 'Auto-approve missing-item refunds under limit', 'default' => true],
            'auto_refund_limit_zig' => ['type' => 'money', 'label' => 'Auto-refund limit', 'default' => 80],
            'hot_meal_guarantee' => ['type' => 'bool', 'label' => 'Hot-meal guarantee', 'default' => true, 'help' => 'Automatic wallet credit when delivery is late.'],
            'late_grace_minutes' => ['type' => 'int', 'label' => 'Late after (minutes past ETA)', 'default' => 15],
            'late_credit_pct' => ['type' => 'percent', 'label' => 'Late credit (% of food subtotal)', 'default' => 20],
            'late_credit_max_zig' => ['type' => 'money', 'label' => 'Maximum late credit', 'default' => 60],
            'sms_fallback' => ['type' => 'bool', 'label' => 'SMS updates for customers without the app', 'default' => true, 'help' => 'Website & USSD customers get key status updates by SMS.'],
        ],
    ],

    'payments' => [
        'label' => 'Payments',
        'icon' => 'credit-card',
        'fields' => [
            'ecocash' => ['type' => 'bool', 'label' => 'EcoCash', 'default' => true],
            'onemoney' => ['type' => 'bool', 'label' => 'OneMoney', 'default' => true],
            'innbucks' => ['type' => 'bool', 'label' => 'InnBucks', 'default' => true],
            'card' => ['type' => 'bool', 'label' => 'Visa / Mastercard', 'default' => true],
            'wallet' => ['type' => 'bool', 'label' => 'Zvino wallet', 'default' => true],
            'cash' => ['type' => 'bool', 'label' => 'Cash on delivery', 'default' => true],
            'wallet_topup_min_zig' => ['type' => 'money', 'label' => 'Minimum wallet top-up', 'default' => 50],
            'payout_schedule' => ['type' => 'select', 'label' => 'Store & driver payout schedule', 'default' => 'weekly', 'options' => ['daily', 'weekly', 'fortnightly']],
            'payout_day' => ['type' => 'select', 'label' => 'Weekly payout day', 'default' => 'monday', 'options' => ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']],
            'min_payout_zig' => ['type' => 'money', 'label' => 'Minimum payout', 'default' => 100],
        ],
    ],

    'loyalty' => [
        'label' => 'Loyalty & growth',
        'icon' => 'gift',
        'fields' => [
            'enabled' => ['type' => 'bool', 'label' => 'Loyalty points', 'default' => true],
            'points_per_zig' => ['type' => 'decimal', 'label' => 'Points per ZiG spent', 'default' => 0.1],
            'tiers' => ['type' => 'json', 'label' => 'Tiers (lifetime points)', 'default' => ['Bronze' => 0, 'Silver' => 500, 'Gold' => 2000, 'Platinum' => 5000]],
            'referral_enabled' => ['type' => 'bool', 'label' => 'Referral programme', 'default' => true],
            'referrer_reward_zig' => ['type' => 'money', 'label' => 'Referrer reward (wallet credit)', 'default' => 30],
            'referee_reward_zig' => ['type' => 'money', 'label' => 'New customer reward', 'default' => 30],
            'referral_min_order_zig' => ['type' => 'money', 'label' => 'Referee first order minimum', 'default' => 80],
            'gift_cards_enabled' => ['type' => 'bool', 'label' => 'Gift cards', 'default' => true],
            'gift_card_amounts' => ['type' => 'list', 'label' => 'Gift card amounts (ZiG)', 'default' => [100, 250, 500, 1000]],
            'subscription_enabled' => ['type' => 'bool', 'label' => 'Zvino+ subscription', 'default' => true],
        ],
    ],

    'notifications' => [
        'label' => 'Notifications',
        'icon' => 'bell',
        'fields' => [
            'push_enabled' => ['type' => 'bool', 'label' => 'Push notifications', 'default' => true],
            'sms_enabled' => ['type' => 'bool', 'label' => 'SMS notifications', 'default' => true],
            'email_enabled' => ['type' => 'bool', 'label' => 'Email receipts', 'default' => true],
            'sms_provider' => ['type' => 'select', 'label' => 'SMS provider', 'default' => 'log', 'options' => ['log', 'africastalking', 'twilio', 'bulksmsweb']],
            'sms_sender_id' => ['type' => 'string', 'label' => 'SMS sender ID', 'default' => 'ZVINO'],
            'quiet_hours_start' => ['type' => 'time', 'label' => 'Marketing quiet hours from', 'default' => '21:00'],
            'quiet_hours_end' => ['type' => 'time', 'label' => 'Marketing quiet hours until', 'default' => '07:00'],
            'ops_alert_email' => ['type' => 'string', 'label' => 'Operations alert email', 'default' => ''],
        ],
    ],

    'integrations' => [
        'label' => 'Integrations',
        'icon' => 'plug',
        'fields' => [
            'google_maps_key' => ['type' => 'string', 'label' => 'Google Maps API key (server)', 'default' => '', 'secret' => true],
            'google_maps_browser_key' => ['type' => 'string', 'label' => 'Google Maps API key (web/app)', 'default' => ''],
            'analytics_id' => ['type' => 'string', 'label' => 'Google Analytics ID', 'default' => ''],
            'meta_pixel_id' => ['type' => 'string', 'label' => 'Meta Pixel ID', 'default' => ''],
        ],
    ],

    'apps' => [
        'label' => 'Apps & website',
        'icon' => 'smartphone',
        'fields' => [
            'customer_min_version' => ['type' => 'string', 'label' => 'Customer app minimum version', 'default' => '1.0.0', 'help' => 'Older versions are forced to update.'],
            'driver_min_version' => ['type' => 'string', 'label' => 'Driver app minimum version', 'default' => '1.0.0'],
            'merchant_min_version' => ['type' => 'string', 'label' => 'Merchant app minimum version', 'default' => '1.0.0'],
            'ios_store_url' => ['type' => 'string', 'label' => 'App Store URL', 'default' => ''],
            'android_store_url' => ['type' => 'string', 'label' => 'Google Play URL', 'default' => ''],
            'maintenance_mode' => ['type' => 'bool', 'label' => 'Maintenance mode', 'default' => false, 'help' => 'Apps and website show a maintenance screen; admin stays available.'],
            'maintenance_message' => ['type' => 'text', 'label' => 'Maintenance message', 'default' => 'We’re making Zvino better. Back shortly!'],
            'web_ordering_enabled' => ['type' => 'bool', 'label' => 'Allow ordering on the website', 'default' => true],
            'seo_title' => ['type' => 'string', 'label' => 'Website title', 'default' => 'Zvino: Food delivery in Harare & Bulawayo'],
            'seo_description' => ['type' => 'text', 'label' => 'Website description', 'default' => 'Order from the best restaurants near you. Pay with EcoCash, OneMoney, InnBucks or card.'],
        ],
    ],

    'drivers' => [
        'label' => 'Driver onboarding',
        'icon' => 'id-card',
        'fields' => [
            'applications_open' => ['type' => 'bool', 'label' => 'Accept new driver applications', 'default' => true],
            'required_documents' => ['type' => 'list', 'label' => 'Required documents', 'default' => ['national_id', 'licence', 'selfie']],
            'min_age' => ['type' => 'int', 'label' => 'Minimum age', 'default' => 18],
            'vehicle_types' => ['type' => 'list', 'label' => 'Allowed vehicles', 'default' => ['motorbike', 'bicycle', 'car']],
        ],
    ],
];

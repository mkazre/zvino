<?php

namespace App\Support;

use App\Models\Setting;

/**
 * One definition per sign-up form (restaurant/shop, driver, corporate). The website wizard, the
 * server-side validation and the admin review screen are all built from it, so a field added here
 * shows up everywhere.
 *
 * Field: key, label, type (text|email|tel|number|textarea|select|choice|chips|bool|time|date|file),
 *        required, options [value => label], placeholder, hint, max, half (two per row),
 *        show_if [otherKey => [values]], accept (image|doc), multiple (files)
 */
class Applications
{
    public const MOBILE_MONEY = ['ecocash' => 'EcoCash', 'onemoney' => 'OneMoney', 'innbucks' => 'InnBucks'];
    public const BANKS = ['CBZ', 'Stanbic', 'Standard Chartered', 'FBC', 'NMB', 'CABS', 'Steward Bank', 'ZB Bank', 'First Capital', 'Ecobank', 'BancABC', 'Nedbank', 'Agribank', 'POSB', 'Metbank', 'Other'];

    public static function types(): array
    {
        return ['restaurant', 'driver', 'corporate'];
    }

    public static function schema(string $type): array
    {
        return match ($type) {
            'restaurant' => self::restaurant(),
            'driver' => self::driver(),
            'corporate' => self::corporate(),
            default => abort(404),
        };
    }

    /** Which answers fill the application's summary columns. */
    public static function summaryKeys(string $type): array
    {
        return [
            'restaurant' => ['title' => 'business_name', 'contact_name' => 'owner_name', 'email' => 'owner_email', 'phone' => 'owner_phone', 'city' => 'city'],
            'driver' => ['title' => 'full_name', 'contact_name' => 'full_name', 'email' => 'email', 'phone' => 'phone', 'city' => 'city'],
            'corporate' => ['title' => 'company_name', 'contact_name' => 'contact_name', 'email' => 'contact_email', 'phone' => 'contact_phone', 'city' => 'city'],
        ][$type];
    }

    private static function cities(): array
    {
        $cities = Setting::get('general.cities') ?: ['Harare', 'Bulawayo'];

        return array_combine($cities, $cities);
    }

    /** Where we send their money (restaurants and drivers). */
    private static function payoutStep(string $who): array
    {
        $mm = ['payout_method' => array_keys(self::MOBILE_MONEY)];

        return [
            'key' => 'payout', 'title' => 'How we pay you', 'icon' => 'wallet',
            'description' => $who === 'driver' ? 'Your earnings are paid weekly, or instantly when you cash out.' : 'Your takings are paid weekly, with a statement.',
            'fields' => [
                ['key' => 'payout_method', 'label' => 'Pay me by', 'type' => 'choice', 'required' => true, 'options' => self::MOBILE_MONEY + ['bank' => 'Bank transfer']],
                ['key' => 'mm_number', 'label' => 'Mobile money number', 'type' => 'tel', 'required' => true, 'placeholder' => '077 123 4567', 'half' => true, 'show_if' => $mm],
                ['key' => 'mm_name', 'label' => 'Name the number is registered to', 'type' => 'text', 'required' => true, 'max' => 120, 'half' => true, 'show_if' => $mm],
                ['key' => 'bank_name', 'label' => 'Bank', 'type' => 'select', 'required' => true, 'options' => array_combine(self::BANKS, self::BANKS), 'half' => true, 'show_if' => ['payout_method' => ['bank']]],
                ['key' => 'bank_branch', 'label' => 'Branch', 'type' => 'text', 'required' => true, 'max' => 80, 'half' => true, 'show_if' => ['payout_method' => ['bank']]],
                ['key' => 'bank_account_name', 'label' => 'Account name', 'type' => 'text', 'required' => true, 'max' => 120, 'half' => true, 'show_if' => ['payout_method' => ['bank']]],
                ['key' => 'bank_account_number', 'label' => 'Account number', 'type' => 'text', 'required' => true, 'max' => 40, 'half' => true, 'show_if' => ['payout_method' => ['bank']]],
                ['key' => 'bank_currency', 'label' => 'Account currency', 'type' => 'choice', 'required' => true, 'options' => ['USD' => 'USD', 'ZIG' => 'ZiG'], 'show_if' => ['payout_method' => ['bank']]],
                ['key' => 'bank_swift', 'label' => 'SWIFT / branch code', 'type' => 'text', 'max' => 20, 'half' => true, 'show_if' => ['payout_method' => ['bank']]],
            ],
        ];
    }

    private static function restaurant(): array
    {
        $commission = Setting::get('fees.default_commission_pct');

        return [
            'type' => 'restaurant',
            'label' => 'Restaurant or shop',
            'title' => 'List your business on Zvino',
            'intro' => "It takes about 10 minutes. Have your logo, a photo of your food or shop, your menu or price list and your ID ready. Commission from {$commission}% on delivery orders, no sign-up fees.",
            'steps' => [
                [
                    'key' => 'business', 'title' => 'Your business', 'icon' => 'store', 'description' => 'What customers will see on Zvino.',
                    'fields' => [
                        ['key' => 'business_name', 'label' => 'Business name', 'type' => 'text', 'required' => true, 'max' => 120, 'placeholder' => 'e.g. Mama Rudo’s Kitchen'],
                        ['key' => 'kind', 'label' => 'Type of business', 'type' => 'choice', 'required' => true, 'options' => ['restaurant' => 'Restaurant / takeaway', 'grocery' => 'Grocery / supermarket', 'market' => 'Butchery / market', 'pharmacy' => 'Pharmacy', 'bakery' => 'Bakery / café']],
                        ['key' => 'cuisine', 'label' => 'Main cuisine or category', 'type' => 'text', 'required' => true, 'max' => 60, 'placeholder' => 'Traditional, Pizza, Chicken, Groceries…', 'half' => true],
                        ['key' => 'price_level', 'label' => 'Price range', 'type' => 'select', 'options' => ['1' => '$ Budget', '2' => '$$ Mid-range', '3' => '$$$ Premium'], 'half' => true],
                        ['key' => 'description', 'label' => 'Short description', 'type' => 'textarea', 'required' => true, 'max' => 400, 'placeholder' => 'What you are known for, in one or two sentences.'],
                        ['key' => 'branches', 'label' => 'Number of branches', 'type' => 'number', 'min' => 1, 'half' => true],
                        ['key' => 'website', 'label' => 'Website or social page', 'type' => 'text', 'max' => 160, 'placeholder' => 'facebook.com/yourpage', 'half' => true],
                    ],
                ],
                [
                    'key' => 'location', 'title' => 'Location & hours', 'icon' => 'map-pin', 'description' => 'Where drivers collect orders, and when you are open.',
                    'fields' => [
                        ['key' => 'city', 'label' => 'City', 'type' => 'select', 'required' => true, 'options' => self::cities(), 'half' => true],
                        ['key' => 'suburb', 'label' => 'Suburb / area', 'type' => 'text', 'required' => true, 'max' => 80, 'half' => true],
                        ['key' => 'address', 'label' => 'Street address', 'type' => 'text', 'required' => true, 'max' => 200, 'placeholder' => 'Shop 4, Sam Levy’s Village'],
                        ['key' => 'business_phone', 'label' => 'Business phone (for orders)', 'type' => 'tel', 'required' => true, 'half' => true],
                        ['key' => 'business_email', 'label' => 'Business email', 'type' => 'email', 'half' => true],
                        ['key' => 'open_days', 'label' => 'Open on', 'type' => 'chips', 'required' => true, 'options' => ['mon' => 'Mon', 'tue' => 'Tue', 'wed' => 'Wed', 'thu' => 'Thu', 'fri' => 'Fri', 'sat' => 'Sat', 'sun' => 'Sun']],
                        ['key' => 'opens_at', 'label' => 'Opens at', 'type' => 'time', 'required' => true, 'half' => true],
                        ['key' => 'closes_at', 'label' => 'Closes at', 'type' => 'time', 'required' => true, 'half' => true],
                        ['key' => 'prep_minutes', 'label' => 'Average preparation time (minutes)', 'type' => 'number', 'min' => 5, 'max' => 120, 'half' => true],
                        ['key' => 'services', 'label' => 'Services', 'type' => 'chips', 'required' => true, 'options' => ['delivery' => 'Delivery', 'pickup' => 'Pickup', 'catering' => 'Catering / bulk orders', 'scheduled' => 'Scheduled orders']],
                        ['key' => 'has_generator', 'label' => 'We have backup power (generator / solar)', 'type' => 'bool'],
                    ],
                ],
                [
                    'key' => 'owner', 'title' => 'Owner & legal', 'icon' => 'user', 'description' => 'The person we contract with, and your registration details.',
                    'fields' => [
                        ['key' => 'owner_name', 'label' => 'Full name', 'type' => 'text', 'required' => true, 'max' => 120, 'half' => true],
                        ['key' => 'owner_role', 'label' => 'Your role', 'type' => 'select', 'required' => true, 'options' => ['owner' => 'Owner', 'director' => 'Director', 'manager' => 'Manager'], 'half' => true],
                        ['key' => 'owner_phone', 'label' => 'Mobile number', 'type' => 'tel', 'required' => true, 'half' => true],
                        ['key' => 'owner_email', 'label' => 'Email (your merchant login)', 'type' => 'email', 'required' => true, 'half' => true],
                        ['key' => 'owner_id_number', 'label' => 'National ID / passport number', 'type' => 'text', 'required' => true, 'max' => 30, 'half' => true],
                        ['key' => 'legal_name', 'label' => 'Registered company name', 'type' => 'text', 'max' => 160, 'half' => true, 'hint' => 'Leave empty if you trade in your own name.'],
                        ['key' => 'registration_number', 'label' => 'Company registration number', 'type' => 'text', 'max' => 40, 'half' => true],
                        ['key' => 'tin', 'label' => 'ZIMRA BP / TIN number', 'type' => 'text', 'max' => 40, 'half' => true],
                        ['key' => 'vat_number', 'label' => 'VAT number', 'type' => 'text', 'max' => 40, 'half' => true, 'hint' => 'Only if VAT registered.'],
                        ['key' => 'licence_number', 'label' => 'Trading / health licence number', 'type' => 'text', 'max' => 40, 'half' => true],
                    ],
                ],
                self::payoutStep('restaurant'),
                [
                    'key' => 'documents', 'title' => 'Photos & documents', 'icon' => 'file', 'description' => 'Photos (JPG/PNG) or PDFs, up to 10 MB each. Phone photos are fine.',
                    'fields' => [
                        ['key' => 'logo', 'label' => 'Logo', 'type' => 'file', 'accept' => 'image', 'required' => true, 'hint' => 'Square works best.'],
                        ['key' => 'cover', 'label' => 'Cover photo of your food or shop', 'type' => 'file', 'accept' => 'image', 'required' => true, 'hint' => 'Landscape, bright and appetising.'],
                        ['key' => 'menu', 'label' => 'Menu or price list', 'type' => 'file', 'accept' => 'doc', 'required' => true, 'multiple' => true, 'hint' => 'Photos of each page or a PDF. We load it for you.'],
                        ['key' => 'owner_id_doc', 'label' => 'Copy of your ID', 'type' => 'file', 'accept' => 'doc', 'required' => true],
                        ['key' => 'licence_doc', 'label' => 'Trading or health licence', 'type' => 'file', 'accept' => 'doc'],
                        ['key' => 'registration_doc', 'label' => 'Certificate of incorporation (CR14 / CR6)', 'type' => 'file', 'accept' => 'doc'],
                        ['key' => 'tax_doc', 'label' => 'ZIMRA tax clearance (ITF263)', 'type' => 'file', 'accept' => 'doc'],
                        ['key' => 'payout_proof', 'label' => 'Proof of bank or mobile money account', 'type' => 'file', 'accept' => 'doc', 'hint' => 'Bank letter, statement header or EcoCash screenshot.'],
                        ['key' => 'gallery', 'label' => 'More photos of your dishes', 'type' => 'file', 'accept' => 'image', 'multiple' => true],
                    ],
                ],
            ],
            'terms' => "I confirm these details are correct and I agree to Zvino’s merchant terms, including commission from {$commission}% on delivery orders.",
        ];
    }

    private static function driver(): array
    {
        $base = Setting::get('delivery.driver_base_pay_zig');
        $motor = ['vehicle_type' => ['motorbike', 'car']];
        $vehicles = array_intersect_key(
            ['motorbike' => 'Motorbike', 'car' => 'Car', 'bicycle' => 'Bicycle', 'on_foot' => 'On foot'],
            array_flip(Setting::get('drivers.vehicle_types') ?: ['motorbike', 'car', 'bicycle', 'on_foot'])
        );

        return [
            'type' => 'driver',
            'label' => 'Driver',
            'title' => 'Apply to drive with Zvino',
            'intro' => 'Takes about 8 minutes. You need your national ID, a driver’s licence (for motorbike or car) and a clear selfie. We review applications in 1–2 working days.',
            'steps' => [
                [
                    'key' => 'personal', 'title' => 'About you', 'icon' => 'user', 'description' => 'Use the phone number you will sign in to the Driver app with.',
                    'fields' => [
                        ['key' => 'full_name', 'label' => 'Full name (as on your ID)', 'type' => 'text', 'required' => true, 'max' => 120],
                        ['key' => 'phone', 'label' => 'Mobile number', 'type' => 'tel', 'required' => true, 'half' => true],
                        ['key' => 'email', 'label' => 'Email', 'type' => 'email', 'half' => true],
                        ['key' => 'date_of_birth', 'label' => 'Date of birth', 'type' => 'date', 'required' => true, 'half' => true],
                        ['key' => 'national_id', 'label' => 'National ID number', 'type' => 'text', 'required' => true, 'max' => 30, 'half' => true, 'placeholder' => '63-123456A78'],
                        ['key' => 'city', 'label' => 'City', 'type' => 'select', 'required' => true, 'options' => self::cities(), 'half' => true],
                        ['key' => 'suburb', 'label' => 'Suburb you live in', 'type' => 'text', 'required' => true, 'max' => 80, 'half' => true],
                        ['key' => 'home_address', 'label' => 'Home address', 'type' => 'text', 'required' => true, 'max' => 200],
                        ['key' => 'emergency_name', 'label' => 'Emergency contact name', 'type' => 'text', 'required' => true, 'max' => 120, 'half' => true],
                        ['key' => 'emergency_phone', 'label' => 'Emergency contact number', 'type' => 'tel', 'required' => true, 'half' => true],
                    ],
                ],
                [
                    'key' => 'vehicle', 'title' => 'Vehicle & availability', 'icon' => 'bike', 'description' => 'How you will deliver and when.',
                    'fields' => [
                        ['key' => 'vehicle_type', 'label' => 'I will deliver by', 'type' => 'choice', 'required' => true, 'options' => $vehicles],
                        ['key' => 'vehicle_make', 'label' => 'Make & model', 'type' => 'text', 'required' => true, 'max' => 60, 'half' => true, 'placeholder' => 'Honda Ace 125', 'show_if' => $motor],
                        ['key' => 'vehicle_plate', 'label' => 'Number plate', 'type' => 'text', 'required' => true, 'max' => 20, 'half' => true, 'show_if' => $motor],
                        ['key' => 'vehicle_colour', 'label' => 'Colour', 'type' => 'text', 'max' => 30, 'half' => true, 'show_if' => $motor],
                        ['key' => 'vehicle_owner', 'label' => 'The vehicle is', 'type' => 'select', 'options' => ['mine' => 'Mine', 'family' => 'A family member’s', 'rented' => 'Rented / financed'], 'half' => true, 'show_if' => $motor],
                        ['key' => 'licence_number', 'label' => 'Driver’s licence number', 'type' => 'text', 'required' => true, 'max' => 30, 'half' => true, 'show_if' => $motor],
                        ['key' => 'licence_class', 'label' => 'Licence class', 'type' => 'select', 'required' => true, 'options' => ['1' => 'Class 1', '2' => 'Class 2', '3' => 'Class 3 (motorbike)', '4' => 'Class 4', '5' => 'Class 5'], 'half' => true, 'show_if' => $motor],
                        ['key' => 'licence_expiry', 'label' => 'Licence expiry date', 'type' => 'date', 'half' => true, 'show_if' => $motor],
                        ['key' => 'availability', 'label' => 'When can you drive?', 'type' => 'chips', 'required' => true, 'options' => ['mornings' => 'Mornings', 'lunch' => 'Lunchtime', 'evenings' => 'Evenings', 'weekends' => 'Weekends', 'full_time' => 'Full time']],
                        ['key' => 'has_smartphone', 'label' => 'I have an Android phone or iPhone with data', 'type' => 'bool', 'required' => true],
                        ['key' => 'experience', 'label' => 'Delivery experience', 'type' => 'textarea', 'max' => 400, 'placeholder' => 'Optional: other delivery apps or courier work.'],
                    ],
                ],
                self::payoutStep('driver'),
                [
                    'key' => 'documents', 'title' => 'Documents', 'icon' => 'file', 'description' => 'Clear photos (all four corners visible) or PDFs, up to 10 MB each.',
                    'fields' => [
                        ['key' => 'selfie', 'label' => 'Selfie', 'type' => 'file', 'accept' => 'image', 'required' => true, 'hint' => 'Face the camera, no hat or sunglasses.'],
                        ['key' => 'national_id_doc', 'label' => 'National ID (front)', 'type' => 'file', 'accept' => 'doc', 'required' => true],
                        ['key' => 'licence_doc', 'label' => 'Driver’s licence', 'type' => 'file', 'accept' => 'doc', 'required' => true, 'show_if' => $motor],
                        ['key' => 'vehicle_registration_doc', 'label' => 'Vehicle registration book', 'type' => 'file', 'accept' => 'doc', 'required' => true, 'show_if' => $motor],
                        ['key' => 'insurance_doc', 'label' => 'Insurance certificate', 'type' => 'file', 'accept' => 'doc', 'show_if' => $motor],
                        ['key' => 'police_clearance_doc', 'label' => 'Police clearance', 'type' => 'file', 'accept' => 'doc', 'hint' => 'Optional, speeds up approval.'],
                        ['key' => 'vehicle_photo', 'label' => 'Photo of your vehicle', 'type' => 'file', 'accept' => 'image', 'show_if' => ['vehicle_type' => ['motorbike', 'car', 'bicycle']]],
                    ],
                ],
            ],
            'terms' => "I confirm these details are true. I agree to Zvino’s driver terms and to a background check. Pay starts at ZiG ".number_format((float) $base, 2)." per trip plus distance.",
        ];
    }

    private static function corporate(): array
    {
        return [
            'type' => 'corporate',
            'label' => 'Corporate account',
            'title' => 'Open a Zvino corporate account',
            'intro' => 'Staff lunches, meeting catering and client gifts on one monthly invoice. Takes about 5 minutes.',
            'steps' => [
                [
                    'key' => 'company', 'title' => 'Your company', 'icon' => 'building',
                    'fields' => [
                        ['key' => 'company_name', 'label' => 'Company name', 'type' => 'text', 'required' => true, 'max' => 160],
                        ['key' => 'industry', 'label' => 'Industry', 'type' => 'select', 'required' => true, 'options' => array_combine($i = ['Banking & finance', 'NGO / international', 'Telecoms & tech', 'Mining & energy', 'Retail & FMCG', 'Health', 'Education', 'Government', 'Manufacturing', 'Professional services', 'Other'], $i), 'half' => true],
                        ['key' => 'employees', 'label' => 'Number of employees', 'type' => 'select', 'required' => true, 'options' => ['1-10' => '1–10', '11-50' => '11–50', '51-200' => '51–200', '201-1000' => '201–1,000', '1000+' => 'More than 1,000'], 'half' => true],
                        ['key' => 'registration_number', 'label' => 'Company registration number', 'type' => 'text', 'max' => 40, 'half' => true],
                        ['key' => 'vat_number', 'label' => 'VAT number', 'type' => 'text', 'max' => 40, 'half' => true],
                        ['key' => 'city', 'label' => 'City', 'type' => 'select', 'required' => true, 'options' => self::cities(), 'half' => true],
                        ['key' => 'address', 'label' => 'Office address (delivery address)', 'type' => 'text', 'required' => true, 'max' => 200, 'half' => true],
                        ['key' => 'website', 'label' => 'Website', 'type' => 'text', 'max' => 160],
                    ],
                ],
                [
                    'key' => 'contact', 'title' => 'Contact & billing', 'icon' => 'user',
                    'fields' => [
                        ['key' => 'contact_name', 'label' => 'Your name', 'type' => 'text', 'required' => true, 'max' => 120, 'half' => true],
                        ['key' => 'job_title', 'label' => 'Job title', 'type' => 'text', 'required' => true, 'max' => 80, 'half' => true],
                        ['key' => 'contact_email', 'label' => 'Work email', 'type' => 'email', 'required' => true, 'half' => true],
                        ['key' => 'contact_phone', 'label' => 'Mobile number', 'type' => 'tel', 'required' => true, 'half' => true, 'hint' => 'You become the account admin with this number.'],
                        ['key' => 'billing_email', 'label' => 'Invoices go to', 'type' => 'email', 'required' => true, 'half' => true, 'placeholder' => 'accounts@company.co.zw'],
                        ['key' => 'billing_contact', 'label' => 'Accounts contact name', 'type' => 'text', 'max' => 120, 'half' => true],
                        ['key' => 'payment_terms', 'label' => 'How would you like to pay?', 'type' => 'choice', 'required' => true, 'options' => ['invoice_30' => 'Monthly invoice (30 days)', 'invoice_14' => 'Invoice (14 days)', 'prepaid' => 'Prepaid top-ups']],
                        ['key' => 'billing_method', 'label' => 'Paying by', 'type' => 'choice', 'required' => true, 'options' => ['bank' => 'Bank transfer', 'ecocash' => 'EcoCash', 'card' => 'Card']],
                        ['key' => 'billing_mm_number', 'label' => 'EcoCash merchant / number', 'type' => 'tel', 'half' => true, 'show_if' => ['billing_method' => ['ecocash']]],
                        ['key' => 'billing_bank', 'label' => 'Your bank', 'type' => 'select', 'options' => array_combine(self::BANKS, self::BANKS), 'half' => true, 'show_if' => ['billing_method' => ['bank']]],
                    ],
                ],
                [
                    'key' => 'plan', 'title' => 'How you’ll use Zvino', 'icon' => 'utensils',
                    'fields' => [
                        ['key' => 'uses', 'label' => 'We want Zvino for', 'type' => 'chips', 'required' => true, 'options' => ['staff_lunch' => 'Staff lunches', 'meetings' => 'Meetings & events', 'catering' => 'Large catering', 'gifts' => 'Client & staff gifts', 'groceries' => 'Office groceries']],
                        ['key' => 'staff_count', 'label' => 'Staff who will order', 'type' => 'number', 'required' => true, 'min' => 1, 'half' => true],
                        ['key' => 'monthly_budget_usd', 'label' => 'Monthly budget (USD)', 'type' => 'number', 'min' => 0, 'half' => true],
                        ['key' => 'daily_allowance_usd', 'label' => 'Daily allowance per person (USD)', 'type' => 'number', 'min' => 0, 'half' => true, 'hint' => 'Leave empty for no limit.'],
                        ['key' => 'order_days', 'label' => 'Ordering days', 'type' => 'chips', 'options' => ['1' => 'Mon', '2' => 'Tue', '3' => 'Wed', '4' => 'Thu', '5' => 'Fri', '6' => 'Sat', '7' => 'Sun']],
                        ['key' => 'notes', 'label' => 'Anything else?', 'type' => 'textarea', 'max' => 600],
                    ],
                ],
                [
                    'key' => 'documents', 'title' => 'Documents', 'icon' => 'file', 'description' => 'Optional, but it speeds up approval of credit terms.',
                    'fields' => [
                        ['key' => 'registration_doc', 'label' => 'Certificate of incorporation', 'type' => 'file', 'accept' => 'doc'],
                        ['key' => 'tax_doc', 'label' => 'ZIMRA tax clearance (ITF263)', 'type' => 'file', 'accept' => 'doc'],
                        ['key' => 'letterhead_doc', 'label' => 'Signed request on company letterhead', 'type' => 'file', 'accept' => 'doc'],
                    ],
                ],
            ],
            'terms' => 'I am authorised to open this account for my company and I agree to Zvino’s corporate terms.',
        ];
    }

    /** Is this field shown, given the other answers? */
    public static function visible(array $field, array $data): bool
    {
        foreach ($field['show_if'] ?? [] as $other => $values) {
            if (! in_array((string) ($data[$other] ?? ''), array_map('strval', $values), true)) {
                return false;
            }
        }

        return true;
    }

    /** Laravel rules for every visible field (files are upload tokens). */
    public static function rules(array $schema, array $data): array
    {
        $rules = [];
        foreach ($schema['steps'] as $step) {
            foreach ($step['fields'] as $f) {
                $k = 'answers.'.$f['key'];
                if (! self::visible($f, $data)) {
                    $rules[$k] = ['nullable'];

                    continue;
                }
                $req = ! empty($f['required']) ? 'required' : 'nullable';
                $rules[$k] = match ($f['type']) {
                    'email' => [$req, 'email', 'max:160'],
                    'tel' => [$req, 'string', 'regex:/^[+\d][\d\s()-]{6,19}$/'],
                    'number' => [$req, 'numeric', 'min:'.($f['min'] ?? 0)] + (isset($f['max']) ? [3 => 'max:'.$f['max']] : []),
                    'select', 'choice' => [$req, 'string', 'in:'.implode(',', array_map('strval', array_keys($f['options'])))],
                    'chips' => [$req, 'array'],
                    'bool' => ! empty($f['required']) ? ['accepted'] : ['nullable', 'boolean'],
                    'time' => [$req, 'date_format:H:i'],
                    'date' => [$req, 'date'],
                    'file' => ! empty($f['multiple']) ? [$req, 'array', 'max:12'] : [$req, 'string'],
                    default => [$req, 'string', 'max:'.($f['max'] ?? 255)],
                };
                if ($f['type'] === 'chips') {
                    $rules[$k.'.*'] = ['string', 'in:'.implode(',', array_map('strval', array_keys($f['options'])))];
                }
                if ($f['type'] === 'file' && ! empty($f['multiple'])) {
                    $rules[$k.'.*'] = ['string'];
                }
            }
        }

        return $rules;
    }

    /** Validation attribute names ("answers.owner_email" → "Email (your merchant login)"). */
    public static function attributes(array $schema): array
    {
        $out = [];
        foreach ($schema['steps'] as $step) {
            foreach ($step['fields'] as $f) {
                $out['answers.'.$f['key']] = strtolower($f['label']);
            }
        }

        return $out;
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HomeBlock extends Model
{
    /** Drawn by the customer app as well as the website. */
    public const APP_TYPES = ['hero', 'categories', 'specials', 'vendors', 'banner', 'rewards', 'richtext', 'spacer'];

    /** Website sections (Admin → Home builder). */
    public const WEB_TYPES = [
        'image_banner', 'carousel', 'promo_grid', 'cuisine_tiles', 'store_collection', 'dish_collection', 'new_stores', 'top_rated', 'free_delivery',
        'countdown', 'promo_code', 'app_download', 'how_it_works', 'features', 'testimonials', 'stats', 'faq', 'video', 'cta_band', 'partner_cta',
    ];

    public const TYPES = [...self::APP_TYPES, ...self::WEB_TYPES];

    /** Block types that only make sense when there are multiple vendors to discover. */
    public const MARKETPLACE_ONLY = ['vendors', 'store_collection', 'new_stores', 'top_rated', 'free_delivery', 'cuisine_tiles'];

    protected $guarded = [];
    protected $casts = ['payload' => 'array', 'is_visible' => 'boolean', 'broadcast' => 'boolean', 'published_at' => 'datetime'];


    /** The website sections that used to be hard-coded below the store lists. */
    public static function addStarterWebBlocks(int $order): void
    {
        $add = [
            ['how_it_works', null, ['columns' => '3', 'steps' => [
                ['icon' => 'map-pin', 'title' => 'Tell us where', 'text' => 'Pin your gate on the map, add a landmark and even a voice note for your driver.'],
                ['icon' => 'smartphone', 'title' => 'Pay your way', 'text' => 'EcoCash, InnBucks, OneMoney, Visa/Mastercard, Zvino wallet or cash on delivery.'],
                ['icon' => 'bike', 'title' => 'Track it live', 'text' => 'Watch your driver on the map and chat with them until your food arrives.'],
            ]]],
            ['promo_grid', null, ['columns' => '2', 'pad' => 'sm', 'tiles' => [
                ['title' => 'Free delivery, every order.', 'subtitle' => 'Plus half-price service fees and member-only deals.', 'cta_label' => 'Join Zvino+', 'link' => '/plus', 'color' => '#222222', 'tone' => 'light'],
                ['title' => 'Send a meal home.', 'subtitle' => 'In the diaspora? Gift a Zvino card to family in Zimbabwe. They get it by SMS.', 'cta_label' => 'Buy a gift card', 'link' => '/gift-cards', 'color' => '#FFFBD9', 'tone' => 'dark'],
            ]]],
            ['partner_cta', null, ['columns' => '3', 'pad' => 'sm', 'cards' => [
                ['icon' => 'store', 'title' => 'Own a restaurant or shop?', 'text' => 'Reach thousands of new customers. We handle delivery and payments.', 'cta_label' => 'Sign up your business', 'link' => '/partners/apply'],
                ['icon' => 'bike', 'title' => 'Got a bike or car?', 'text' => 'Earn on your own schedule with weekly EcoCash payouts. Keep 100% of tips.', 'cta_label' => 'Apply to drive', 'link' => '/drive/apply'],
                ['icon' => 'users', 'title' => 'Feeding a team?', 'text' => 'Staff lunches and meetings on one monthly invoice.', 'cta_label' => 'Corporate accounts', 'link' => '/business'],
            ]]],
            ['app_download', 'Order faster in the Zvino app', ['subtitle' => 'Live tracking, saved addresses and app-only deals.', 'points' => "Track your driver live\nReorder in one tap\nApp-only offers", 'bg_type' => 'color', 'bg_color' => '#1C1C1C', 'text_tone' => 'light', 'radius' => 'xl']],
        ];
        foreach ($add as [$type, $title, $payload]) {
            if (static::where('type', $type)->exists()) {
                continue;
            }
            $subtitle = $payload['subtitle'] ?? null;
            unset($payload['subtitle']);
            static::create(['type' => $type, 'title' => $title, 'subtitle' => $subtitle, 'payload' => $payload + ['channel' => 'web'], 'sort_order' => ++$order, 'is_visible' => true, 'published_at' => now()]);
        }
    }

    /** Scheduled window (payload.starts_at / ends_at) and channel (both | web | app). */
    public function liveFor(string $channel): bool
    {
        $p = $this->payload ?? [];
        if (($p['channel'] ?? 'both') !== 'both' && ($p['channel'] ?? 'both') !== $channel) {
            return false;
        }
        if ($channel === 'app' && ! in_array($this->type, self::APP_TYPES, true)) {
            return false;
        }
        try {
            if (! empty($p['starts_at']) && now()->lt(\Illuminate\Support\Carbon::parse($p['starts_at'], 'Africa/Harare'))) {
                return false;
            }
            if (! empty($p['ends_at']) && now()->gt(\Illuminate\Support\Carbon::parse($p['ends_at'], 'Africa/Harare'))) {
                return false;
            }
        } catch (\Throwable) {
            // Unreadable date: ignore the window.
        }

        return true;
    }
}

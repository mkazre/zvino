<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HomeBlock extends Model
{
    /** Drawn by the customer app as well as the website. */
    public const APP_TYPES = [
        'hero', 'categories', 'specials', 'vendors', 'banner', 'rewards', 'richtext', 'spacer',
        // Store feeds (location-aware), shared with the website.
        'order_again', 'recommended', 'deals_near_you', 'new_stores', 'top_rated', 'free_delivery', 'store_collection',
        'shops_near_you', 'brand_logos', 'all_stores', 'category_icons', 'filter_chips', 'notice_banner', 'promo_cards',
    ];

    /** Website-only sections (Admin → Home builder). */
    public const WEB_TYPES = [
        'image_banner', 'carousel', 'promo_grid', 'cuisine_tiles', 'dish_collection',
        'countdown', 'promo_code', 'app_download', 'how_it_works', 'features', 'testimonials', 'stats', 'faq', 'video', 'cta_band', 'partner_cta',
    ];

    public const TYPES = [...self::APP_TYPES, ...self::WEB_TYPES];

    /** Block types that only make sense when there are multiple vendors to discover. */
    public const MARKETPLACE_ONLY = ['vendors', 'store_collection', 'new_stores', 'top_rated', 'free_delivery', 'cuisine_tiles', 'order_again', 'recommended', 'deals_near_you', 'shops_near_you', 'brand_logos', 'all_stores'];

    protected $guarded = [];
    protected $casts = ['payload' => 'array', 'is_visible' => 'boolean', 'broadcast' => 'boolean', 'published_at' => 'datetime'];

    /**
     * MrD-style home: notice strip, filter chips, order again, recommended, local deals, new, shops,
     * brands and "all stores near you", slotted around the existing blocks in a sensible order.
     */
    public static function addStoreFeedBlocks(): void
    {
        $new = [
            'notice_banner' => ['Delivery available from {opens}', 'In the meantime, click & collect may be available.', null, null, ['only_when_closed' => true, 'tone' => 'olive']],
            'filter_chips' => [null, null, null, null, ['pad' => 'sm', 'chips' => [['label' => 'Top rated', 'link' => '/stores?sort=rating'], ['label' => 'Fast', 'link' => '/stores?sort=fastest'], ['label' => 'Free delivery', 'link' => '/stores?free_delivery=1'], ['label' => 'Offers', 'link' => '/stores?offers=1'], ['label' => 'Halaal', 'link' => '/stores?q=halaal'], ['label' => 'Vegetarian', 'link' => '/stores?q=vegetarian']]]],
            'order_again' => ['Order again', null, null, null, ['limit' => 10, 'layout' => 'rail']],
            'recommended' => ['Recommended for you', null, null, null, ['limit' => 10, 'layout' => 'rail']],
            'deals_near_you' => ['Local deals near you', null, 'See all', '/stores?offers=1', ['limit' => 10, 'layout' => 'rail']],
            'new_stores' => ['New near you', null, null, null, ['limit' => 10, 'days' => 60, 'layout' => 'rail']],
            'shops_near_you' => ['Shops near you', null, 'See all', '/stores?segment=shops', ['limit' => 12, 'shape' => 'square']],
            'brand_logos' => ['Popular brands', null, null, null, ['limit' => 12, 'shape' => 'square', 'vendor_ids' => [], 'ad_ids' => []]],
            'all_stores' => ['All {count} restaurants near you', null, null, null, ['limit' => 30, 'columns' => '2']],
        ];
        foreach ($new as $type => [$title, $subtitle, $cta, $link, $payload]) {
            if (! static::where('type', $type)->exists()) {
                static::create(['type' => $type, 'title' => $title, 'subtitle' => $subtitle, 'cta_label' => $cta, 'link_to' => $link, 'payload' => $payload, 'is_visible' => true, 'published_at' => now(), 'sort_order' => 9999]);
            }
        }

        // Re-number: these types first in this order, everything else (and anything unknown) after, as before.
        $order = ['hero', 'notice_banner', 'banner', 'categories', 'category_icons', 'filter_chips', 'order_again', 'recommended', 'deals_near_you', 'specials', 'new_stores', 'shops_near_you', 'brand_logos', 'vendors', 'rewards', 'all_stores'];
        $blocks = static::orderBy('sort_order')->orderBy('id')->get();
        $sorted = $blocks->sortBy(fn ($b) => [($i = array_search($b->type, $order, true)) === false ? 100 : $i, $b->sort_order, $b->id])->values();
        foreach ($sorted as $i => $b) {
            if ($b->sort_order !== $i) {
                $b->update(['sort_order' => $i]);
            }
        }
    }


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

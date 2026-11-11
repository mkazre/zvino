<?php

namespace App\Http\Middleware;

use App\Models\ExchangeRate;
use App\Models\Setting;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    /** Signed-in customers keep their language on every device; visitors keep it in a cookie. */
    public static function locale(Request $request): string
    {
        $locale = $request->user()?->locale ?: $request->cookie('zvino_locale', 'en');

        return array_key_exists($locale, \App\Support\I18n::LOCALES) ? $locale : 'en';
    }

    public function share(Request $request): array
    {
        return array_merge(parent::share($request), [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user()?->load('vendor:id,name'),
            ],
            'can' => fn () => $request->user() ? \App\Support\Permissions::for($request->user()->role ?? 'customer') : [],
            'badges' => fn () => $request->user()?->isStaff() ? $this->badges($request) : [],
            'notifications' => fn () => $request->user()?->isStaff() ? [
                'unread' => $request->user()->appNotifications()->whereNull('read_at')->count(),
                'latest' => $request->user()->appNotifications()->latest()->limit(8)->get(['id', 'type', 'title', 'body', 'read_at', 'created_at']),
            ] : null,
            'brand' => fn () => ['name' => Setting::get('general.business_name')] + \App\Support\Brand::logos(),
            'appVersion' => fn () => \App\Support\Brand::version(),
            // Website chrome: footer, city picker, app links. Cheap (settings are cached).
            'site' => fn () => [
                'cities' => Setting::get('general.cities'),
                'city' => $request->session()->get('city'),
                'tagline' => Setting::get('branding.tagline'),
                'support_phone' => Setting::get('general.support_phone'),
                'support_whatsapp' => Setting::get('general.support_whatsapp'),
                'support_email' => Setting::get('general.support_email'),
                'social' => ['facebook' => Setting::get('branding.social_facebook'), 'instagram' => Setting::get('branding.social_instagram'), 'tiktok' => Setting::get('branding.social_tiktok')],
                'apps' => ['ios' => Setting::get('apps.ios_store_url'), 'android' => Setting::get('apps.android_store_url')],
                'web_ordering' => Setting::get('apps.web_ordering_enabled'),
                'platform_mode' => Setting::platformMode(),
                'location' => \App\Support\CustomerLocation::fromRequest($request),
                'addresses' => $request->user() && ! $request->user()->isStaff()
                    ? $request->user()->addresses()->orderByDesc('is_default')->get(['id', 'label', 'line1', 'suburb', 'city', 'lat', 'lng'])
                    : [],
            ],
            'googleEnabled' => fn () => \App\Support\GoogleAuth::enabled(),
            'mapsMapId' => fn () => Setting::get('integrations.google_maps_map_id') ?: null,
            'activeOrder' => fn () => \App\Support\ActiveOrder::for($request->user()),
            'platformMode' => fn () => Setting::platformMode(),
            'i18n' => function () use ($request) {
                $locale = self::locale($request);

                return ['locale' => $locale, 'languages' => \App\Support\I18n::LOCALES, 'strings' => (object) \App\Support\I18n::dictionary($locale)];
            },
            'zigPerUsd' => fn () => ExchangeRate::current(),
            'currency' => fn () => \App\Support\Money::display($request),
            'pusher' => [
                'key' => config('broadcasting.connections.pusher.key'),
                'cluster' => config('broadcasting.connections.pusher.options.cluster'),
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error' => fn () => $request->session()->get('error'),
                'reorder' => fn () => $request->session()->get('reorder'),
            ],
        ]);
    }

    /** Sidebar counters: things waiting on a human. */
    private function badges(Request $request): array
    {
        $vendorId = $request->user()->scopedVendorId();
        $orders = \App\Models\Order::query()->when($vendorId, fn ($q) => $q->where('vendor_id', $vendorId));

        return [
            'orders' => (clone $orders)->whereIn('status', \App\Models\Order::LIVE)->count(),
            'incoming' => (clone $orders)->where('status', 'placed')->count(),
            'unassigned' => $vendorId ? 0 : (clone $orders)->where('fulfilment', 'delivery')->whereNull('driver_id')->whereIn('status', ['accepted', 'preparing', 'ready'])->count(),
            'refunds' => $vendorId ? 0 : \App\Models\Refund::where('status', 'requested')->count(),
            'drivers' => $vendorId ? 0 : \App\Models\Driver::where('status', 'applied')->count(),
            'support' => $vendorId ? 0 : \App\Models\SupportTicket::where('status', 'open')->count(),
            'applications' => $vendorId || ! \App\Support\Permissions::allows($request->user(), 'applications.review') ? 0 : \App\Models\PartnerApplication::whereIn('status', \App\Models\PartnerApplication::OPEN)->count(),
        ];
    }
}

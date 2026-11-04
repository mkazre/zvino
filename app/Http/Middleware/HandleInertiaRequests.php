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
            'brand' => fn () => ['name' => Setting::get('general.business_name'), 'logo' => Setting::get('branding.logo')],
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
            ],
            'platformMode' => fn () => Setting::platformMode(),
            'zigPerUsd' => fn () => ExchangeRate::current(),
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
        ];
    }
}

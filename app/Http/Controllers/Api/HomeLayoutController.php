<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VendorResource;
use App\Models\HomeBlock;
use App\Models\Setting;
use App\Models\Vendor;
use App\Support\CustomerLocation;
use App\Support\HomeFeed;
use App\Support\Nearby;
use Illuminate\Http\Request;

/**
 * GET /api/home-layout?lat=&lng=&segment=restaurants|shops
 * Ordered, visible blocks, each resolved with live data for the customer's location
 * (the same data the website home uses).
 */
class HomeLayoutController extends Controller
{
    public function __invoke(Request $request, HomeFeed $feed)
    {
        $single = Setting::platformMode() === 'single';
        $loc = CustomerLocation::fromRequest($request);
        $ctx = [
            'city' => $request->query('city'),
            'loc' => $loc && isset($loc['lat']) ? $loc : null,
            'user' => $request->user('sanctum'),
            'segment' => $request->query('segment') === 'shops' ? 'shops' : 'restaurants',
        ];

        $blocks = HomeBlock::where('is_visible', true)
            ->where(fn ($q) => $q->whereNull('published_at')->orWhere('published_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('city_scope')->orWhere('city_scope', $ctx['city']))
            ->when($single, fn ($q) => $q->whereNotIn('type', HomeBlock::MARKETPLACE_ONLY))
            ->orderBy('sort_order')
            ->get()
            // The app draws the store feeds and the original block types; website-only sections are skipped.
            ->filter(fn (HomeBlock $b) => $b->liveFor('app'))->values();

        return response()->json([
            'platform_mode' => $single ? 'single' : 'marketplace',
            'single_vendor' => $single ? new VendorResource(Vendor::find(Setting::singleVendorId())) : null,
            'nearby' => ['has_location' => (bool) $ctx['loc'], 'count' => $feed->vendors($ctx)->count()],
            'blocks' => $blocks->map(fn (HomeBlock $b) => [
                'id' => $b->id,
                'type' => $b->type,
                'title' => $b->title,
                'subtitle' => $b->subtitle,
                'cta_label' => $b->cta_label,
                'link_to' => $b->link_to,
                'payload' => $b->payload ?? (object) [],
                'data' => $feed->blockData($b, $ctx),
            ]),
        ]);
    }

    /** The app's shops tab: shops near the location, filterable by kind. */
    public function shops(Request $request, HomeFeed $feed)
    {
        $loc = CustomerLocation::fromRequest($request);
        $ctx = ['city' => $request->query('city'), 'loc' => $loc && isset($loc['lat']) ? $loc : null, 'user' => $request->user('sanctum'), 'segment' => 'shops'];
        $shops = $feed->vendors($ctx, 'shops');
        if ($kind = $request->query('kind')) {
            $shops = $shops->where('kind', $kind)->values();
        }

        return response()->json([
            'kinds' => $feed->vendors($ctx, 'shops')->pluck('kind')->unique()->values(),
            'shops' => $feed->cards($shops),
        ]);
    }

    /**
     * App start-up: which saved address is the phone at? Returns the matching address (within
     * ~75 m), or the reverse-geocoded current location so the app can offer to save it.
     */
    public function resolveLocation(Request $request)
    {
        $d = $request->validate(['lat' => ['required', 'numeric', 'between:-90,90'], 'lng' => ['required', 'numeric', 'between:-180,180']]);
        $match = Nearby::nearestAddress($request->user('sanctum'), (float) $d['lat'], (float) $d['lng']);
        if ($match) {
            return response()->json(['matched' => true, 'location' => CustomerLocation::fromAddress($match)]);
        }
        $geo = [];
        try {
            $r = \Illuminate\Support\Facades\Http::withHeaders(['User-Agent' => 'Zvino/1.0'])->timeout(5)
                ->get('https://nominatim.openstreetmap.org/reverse', ['lat' => $d['lat'], 'lon' => $d['lng'], 'format' => 'json', 'addressdetails' => 1])->json();
            $a = $r['address'] ?? [];
            $geo = ['line1' => trim(($a['house_number'] ?? '').' '.($a['road'] ?? '')) ?: null, 'suburb' => $a['suburb'] ?? $a['neighbourhood'] ?? null, 'city' => $a['city'] ?? $a['town'] ?? null];
        } catch (\Throwable) {
            // offline geocoder: the app still uses the GPS point
        }

        return response()->json(['matched' => false, 'location' => ['lat' => (float) $d['lat'], 'lng' => (float) $d['lng'], 'address_id' => null, 'label' => 'Current location', 'line' => $geo['line1'] ?? null, 'city' => $geo['city'] ?? null, 'suburb' => $geo['suburb'] ?? null]]);
    }
}

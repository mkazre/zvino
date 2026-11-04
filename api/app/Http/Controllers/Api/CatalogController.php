<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Http\Resources\VendorResource;
use App\Models\Category;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\PromoCode;
use App\Models\Setting;
use App\Models\Vendor;
use Illuminate\Http\Request;

/** Public browse endpoints: config, vendors, menus, items, specials, search. */
class CatalogController extends Controller
{
    public function config()
    {
        $mode = Setting::platformMode();

        return response()->json([
            'platform_mode' => $mode,
            'single_vendor_id' => $mode === 'single' ? Setting::singleVendorId() : null,
            'cities' => config('zvino.cities'),
            'zig_per_usd' => ExchangeRate::current(),
            'currencies' => ['primary' => 'ZIG', 'secondary' => 'USD'],
            'payment_methods' => ['ecocash', 'onemoney', 'innbucks', 'card', 'wallet', 'cash'],
            'min_app_version' => config('zvino.min_app_version'),
            'pusher' => ['key' => config('broadcasting.connections.pusher.key'), 'cluster' => config('broadcasting.connections.pusher.options.cluster')],
            'features' => ['rewards' => true, 'specials' => true, 'support_chat' => true],
            'brand' => \App\Support\Brand::palette() + collect(\App\Support\Brand::logos())->map(fn ($p) => url($p))->all(),
            'server_version' => config('zvino.version'),
        ]);
    }

    public function vendors(Request $request)
    {
        $q = $this->vendorQuery($request->query('city'));

        if ($search = $request->query('q')) {
            $q->where(fn ($w) => $w->where('name', 'like', "%$search%")->orWhere('cuisine', 'like', "%$search%"));
        }

        match ($request->query('filter')) {
            'fastest' => $q->orderBy('prep_minutes'),
            'rating' => $q->orderByDesc('rating'),
            'free_delivery' => $q->where('delivery_fee_zig', 0),
            'offers' => $q->whereHas('items', fn ($i) => $i->where('is_special', true)),
            default => $q->orderByDesc('is_featured')->orderByDesc('rating'),
        };

        // TODO: when lat/lng are given, sort by distance (haversine) and filter by delivery radius.
        return VendorResource::collection($q->paginate(20));
    }

    public function vendor(Vendor $vendor)
    {
        abort_unless($vendor->status === 'active', 404);

        return new VendorResource($vendor);
    }

    public function menu(Vendor $vendor)
    {
        abort_unless($vendor->status === 'active', 404);
        $vendor->load(['categories.items' => fn ($q) => $q->orderBy('sort_order'), 'categories.items.modifierGroups.options', 'categories.items.vendor']);
        $deals = \App\Models\PromoCode::autoFor($vendor)->filter(fn ($p) => $p->isUsableFor(PHP_FLOAT_MAX, $vendor->id) || ($p->start_time && $p->is_active))
            ->map(fn ($p) => ['id' => $p->id, 'headline' => $p->headline(), 'item_id' => $p->item_id, 'live' => $p->inWindow(), 'min_order_zig' => $p->min_order_zig])->values();

        return (new VendorResource($vendor))->additional(['deals' => $deals]);
    }

    public function item(Item $item)
    {
        return new ItemResource($item->load('vendor', 'modifierGroups.options'));
    }

    public function categories()
    {
        // Global (vendor_id null) categories drive the home "category rail".
        return response()->json(Category::whereNull('vendor_id')->orderBy('sort_order')->get(['id', 'name', 'icon']));
    }

    public function specials(Request $request)
    {
        $items = Item::with('vendor')
            ->where('is_available', true)
            ->where(fn ($q) => $q->where('is_special', true)->orWhereNotNull('special_price_zig'))
            ->whereHas('vendor', fn ($v) => $this->scopeVendor($v, $request->query('city')))
            ->limit(40)->get();

        $banner = PromoCode::where('is_active', true)->whereNull('vendor_id')
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()))
            ->latest()->first(['code', 'type', 'value', 'ends_at']);

        return response()->json(['banner' => $banner, 'items' => ItemResource::collection($items)]);
    }

    public function search(Request $request)
    {
        $term = trim((string) $request->query('q'));
        // Dietary filters (#40): ?dietary=vegetarian,halal limits dishes (and the stores shown) to matching items.
        $diet = array_values(array_filter(explode(',', (string) $request->query('dietary'))));
        $dietScope = function ($q) use ($diet) {
            foreach ($diet as $tag) {
                $q->whereJsonContains('dietary', $tag);
            }
        };
        if ($diet) {
            $items = Item::with('vendor')->where('is_available', true)->where($dietScope)
                ->when(mb_strlen($term) >= 2, fn ($q) => $q->where('name', 'like', "%$term%"))
                ->whereHas('vendor', fn ($v) => $this->scopeVendor($v, $request->query('city')))->limit(40)->get();

            return response()->json([
                'vendors' => VendorResource::collection($this->vendorQuery($request->query('city'))->whereIn('id', $items->pluck('vendor_id')->unique())->limit(10)->get()),
                'items' => ItemResource::collection($items),
                'dietary' => $diet,
            ]);
        }
        if (mb_strlen($term) < 2) {
            return response()->json([
                'vendors' => VendorResource::collection($this->vendorQuery($request->query('city'))->orderByDesc('rating')->limit(6)->get()),
                'items' => [],
            ]);
        }

        return response()->json([
            'vendors' => VendorResource::collection($this->vendorQuery($request->query('city'))
                ->where(fn ($w) => $w->where('name', 'like', "%$term%")->orWhere('cuisine', 'like', "%$term%"))->limit(10)->get()),
            'items' => ItemResource::collection(Item::with('vendor')->where('is_available', true)
                ->where('name', 'like', "%$term%")
                ->whereHas('vendor', fn ($v) => $this->scopeVendor($v, $request->query('city')))->limit(20)->get()),
        ]);
    }

    private function vendorQuery(?string $city)
    {
        return $this->scopeVendor(Vendor::query(), $city)
            ->withExists(['items as has_offers' => fn ($i) => $i->where('is_special', true)]);
    }

    /** Active vendors, limited to the one restaurant in single mode. */
    private function scopeVendor($q, ?string $city)
    {
        $q->where('status', 'active');
        if (Setting::platformMode() === 'single') {
            $q->whereKey(Setting::singleVendorId());
        } elseif ($city) {
            $q->where('city', $city);
        }

        return $q;
    }
}

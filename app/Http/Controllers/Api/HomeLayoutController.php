<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Http\Resources\VendorResource;
use App\Models\Category;
use App\Models\HomeBlock;
use App\Models\Item;
use App\Models\Reward;
use App\Models\Setting;
use App\Models\Vendor;
use Illuminate\Http\Request;

/** GET /api/home-layout: ordered, visible blocks, each resolved with live data. */
class HomeLayoutController extends Controller
{
    public function __invoke(Request $request)
    {
        $city = $request->query('city');
        $single = Setting::platformMode() === 'single';

        $blocks = HomeBlock::where('is_visible', true)
            ->where(fn ($q) => $q->whereNull('published_at')->orWhere('published_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('city_scope')->orWhere('city_scope', $city))
            ->when($single, fn ($q) => $q->whereNotIn('type', HomeBlock::MARKETPLACE_ONLY))
            ->orderBy('sort_order')
            ->get()
            // The app draws the original block types only; website-only sections are skipped.
            ->filter(fn (HomeBlock $b) => $b->liveFor('app'))->values();

        return response()->json([
            'platform_mode' => $single ? 'single' : 'marketplace',
            'single_vendor' => $single ? new VendorResource(Vendor::find(Setting::singleVendorId())) : null,
            'blocks' => $blocks->map(fn (HomeBlock $b) => [
                'id' => $b->id,
                'type' => $b->type,
                'title' => $b->title,
                'subtitle' => $b->subtitle,
                'cta_label' => $b->cta_label,
                'link_to' => $b->link_to,
                'payload' => $b->payload ?? (object) [],
                'data' => $this->resolve($b, $city, $request),
            ]),
        ]);
    }

    private function resolve(HomeBlock $block, ?string $city, Request $request): mixed
    {
        $limit = $block->payload['limit'] ?? 10;
        $activeVendors = fn ($v) => $v->where('status', 'active')->when($city, fn ($q) => $q->where('city', $city));

        return match ($block->type) {
            'categories' => Category::whereNull('vendor_id')->orderBy('sort_order')->get(['id', 'name', 'icon']),
            'specials' => ItemResource::collection(Item::with('vendor')->where('is_available', true)
                ->where(fn ($q) => $q->where('is_special', true)->orWhereNotNull('special_price_zig'))
                ->whereHas('vendor', $activeVendors)
                ->when(Setting::platformMode() === 'single', fn ($q) => $q->where('vendor_id', Setting::singleVendorId()))
                ->limit($limit)->get()),
            'vendors' => VendorResource::collection(Vendor::query()->tap($activeVendors)
                ->when($block->payload['featured_only'] ?? false, fn ($q) => $q->where('is_featured', true))
                ->orderByDesc('is_featured')->orderByDesc('rating')->limit($limit)->get()),
            'rewards' => [
                'points' => $request->user('sanctum')?->loyalty?->points,
                'rewards' => Reward::where('is_active', true)->orderBy('points_cost')->limit(3)->get(['id', 'name', 'points_cost']),
            ],
            default => null,
        };
    }
}

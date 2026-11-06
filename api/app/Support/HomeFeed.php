<?php

namespace App\Support;

use App\Http\Resources\ItemResource;
use App\Http\Resources\VendorResource;
use App\Models\Category;
use App\Models\HomeBlock;
use App\Models\Item;
use App\Models\Order;
use App\Models\Reward;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\StoreAvailability;
use Illuminate\Support\Collection;

/**
 * Data behind the home page blocks, shared by the website (SiteController) and the apps
 * (GET /api/home-layout), so both show the same stores for the same location.
 *
 * $ctx = ['city' => ?string, 'loc' => ?array{lat,lng}, 'user' => ?User, 'segment' => restaurants|shops|all]
 */
class HomeFeed
{
    private array $memo = [];

    public function __construct(private StoreAvailability $availability) {}

    /** Active stores for the context: near the location (or in the city), restaurants or shops. */
    public function vendors(array $ctx, ?string $segment = null): Collection
    {
        $segment ??= $ctx['segment'] ?? 'all';
        $key = $segment.'|'.json_encode($ctx['loc'] ?? null).'|'.($ctx['city'] ?? '');

        return $this->memo[$key] ??= (function () use ($ctx, $segment) {
            $q = Vendor::active()->with('hours')
                ->withExists(['items as has_offers' => fn ($i) => $i->where(fn ($w) => $w->where('is_special', true)->orWhereNotNull('special_price_zig'))])
                ->when($segment === 'restaurants', fn ($w) => $w->where(fn ($k) => $k->where('kind', 'restaurant')->orWhereNull('kind')))
                ->when($segment === 'shops', fn ($w) => $w->whereNotNull('kind')->where('kind', '!=', 'restaurant'));
            if (Setting::platformMode() === 'single') {
                $q->whereKey(Setting::singleVendorId());
            } elseif (empty($ctx['loc']['lat']) && ! empty($ctx['city'])) {
                $q->where('city', $ctx['city']);
            }
            $vendors = $q->orderByDesc('is_featured')->orderByDesc('rating')->get();

            return empty($ctx['loc']['lat']) ? $vendors : Nearby::filter($vendors, $ctx['loc'], false);
        })();
    }

    /** Store cards (resource + open/closed + distance), open stores first. */
    public function cards(Collection $vendors, ?int $limit = null): array
    {
        $cards = $vendors->map(fn (Vendor $v) => (new VendorResource($v))->resolve() + [
            'availability' => $this->availability->status($v),
            'distance_km' => $v->distance_km ?? null,
            'rating_count' => (int) $v->rating_count,
        ]);
        $cards = $cards->sortBy(fn ($c) => [$c['availability']['is_open'] ? 0 : 1, $c['distance_km'] ?? 0])->values();

        return ($limit ? $cards->take($limit) : $cards)->values()->all();
    }

    public function blockData(HomeBlock $b, array $ctx): mixed
    {
        $p = $b->payload ?? [];
        $limit = max(1, min(60, (int) ($p['limit'] ?? 10)));
        $here = fn (?string $segment = null) => $this->vendors($ctx, $segment);
        $user = $ctx['user'] ?? null;
        $items = fn () => Item::with('vendor')->where('is_available', true)->whereIn('vendor_id', $here('all')->pluck('id'));

        return match ($b->type) {
            'hero' => ['stores' => $this->cards($here()->where('is_featured', true)->whenEmpty(fn () => $here()), 4), 'stats' => $this->stats($ctx)],
            'categories' => Category::whereNull('vendor_id')->orderBy('sort_order')->get(['id', 'name', 'icon']),
            'specials' => ItemResource::collection($items()->where(fn ($q) => $q->where('is_special', true)->orWhereNotNull('special_price_zig'))->limit($limit)->get())->resolve(),
            'dish_collection' => ($ids = array_map('intval', (array) ($p['item_ids'] ?? []))) ? ItemResource::collection($items()->whereIn('id', $ids)->get()->sortBy(fn ($i) => array_search($i->id, $ids))->values())->resolve() : [],
            'vendors' => $this->cards(($p['featured_only'] ?? false) ? $here()->where('is_featured', true) : $here(), $limit),
            'store_collection', 'brand_logos' => $this->picked($here('all'), $p, $b->type === 'brand_logos', $limit),
            'new_stores' => $this->cards($here()->where('created_at', '>=', now()->subDays((int) ($p['days'] ?? 60)))->sortByDesc('created_at'), $limit),
            'top_rated' => $this->cards($here()->where('rating', '>=', (float) ($p['min_rating'] ?? 4.2))->sortByDesc('rating'), $limit),
            'free_delivery' => $this->cards($here()->where('delivery_fee_zig', 0), $limit),
            'deals_near_you' => $this->cards($here()->where('has_offers', true), $limit),
            'order_again' => $user ? $this->cards($this->orderedFrom($user, $here('all')), $limit) : [],
            'recommended' => $this->cards($this->recommended($user, $here()), $limit),
            'shops_near_you' => $this->cards($here('shops'), $limit),
            'all_stores' => ['stores' => $this->cards($here(), max($limit, 30)), 'count' => $here()->count()],
            'notice_banner' => $this->openingNotice($here('all')),
            'rewards' => ['points' => $user?->loyalty?->points, 'rewards' => Reward::where('is_active', true)->orderBy('points_cost')->limit(3)->get(['id', 'name', 'points_cost'])],
            'stats' => $this->stats($ctx),
            default => null,
        };
    }

    public function stats(array $ctx): array
    {
        return ['stores' => $this->vendors($ctx, 'all')->count(), 'cities' => count(Setting::get('general.cities') ?: [])];
    }

    /** Hand-picked stores in the chosen order (or featured ones when none are picked). */
    private function picked(Collection $nearby, array $p, bool $fallbackFeatured, int $limit): array
    {
        $ids = array_map('intval', (array) ($p['vendor_ids'] ?? []));
        if (! $ids) {
            return $fallbackFeatured ? $this->cards($nearby->where('is_featured', true)->whenEmpty(fn () => $nearby->sortByDesc('rating')), $limit) : [];
        }

        return $this->cards($nearby->whereIn('id', $ids)->sortBy(fn ($v) => array_search($v->id, $ids)), $limit);
    }

    /** Stores the customer has ordered from before, most recent first. */
    private function orderedFrom(User $user, Collection $nearby): Collection
    {
        $ids = Order::where('user_id', $user->id)->whereNotIn('status', ['cancelled', 'rejected', 'pending_payment'])->latest()->limit(50)->pluck('vendor_id')->unique()->values()->all();

        return $nearby->whereIn('id', $ids)->sortBy(fn ($v) => array_search($v->id, $ids))->values();
    }

    /** Cuisines they like (from past orders) first, then the best rated. */
    private function recommended(?User $user, Collection $nearby): Collection
    {
        $liked = $user ? Order::where('user_id', $user->id)->join('vendors', 'vendors.id', '=', 'orders.vendor_id')->whereNotNull('vendors.cuisine')->pluck('vendors.cuisine')->countBy()->sortDesc()->keys()->all() : [];

        return $nearby->sortBy(fn ($v) => [($i = array_search($v->cuisine, $liked, true)) === false ? 99 : $i, -$v->rating])->values();
    }

    /** "Delivery available from 07:00" when every nearby store is closed. */
    private function openingNotice(Collection $nearby): array
    {
        $open = 0;
        $next = null;
        foreach ($nearby as $v) {
            $s = $this->availability->status($v);
            if ($s['is_open']) {
                $open++;
            } elseif ($s['next_open_at'] && (! $next || $s['next_open_at'] < $next)) {
                $next = $s['next_open_at'];
            }
        }

        return ['open' => $open, 'total' => $nearby->count(), 'next_open_at' => $next];
    }
}

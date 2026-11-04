<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Http\Resources\VendorResource;
use App\Models\Category;
use App\Models\GroupOrder;
use App\Models\HomeBlock;
use App\Models\Item;
use App\Models\Page;
use App\Models\Review;
use App\Models\Setting;
use App\Models\SubscriptionPlan;
use App\Models\Vendor;
use App\Services\StoreAvailability;
use Illuminate\Http\Request;
use Inertia\Inertia;

/** Public website pages. Every page passes `seo` so titles/descriptions are server-rendered. */
class SiteController extends Controller
{
    public function __construct(private StoreAvailability $availability) {}

    private function seo(string $title, ?string $description = null, ?string $image = null, ?array $jsonld = null): array
    {
        return ['title' => $title, 'description' => $description ?? Setting::get('apps.seo_description'), 'image' => $image, 'jsonld' => $jsonld];
    }

    private function storeCards($vendors): array
    {
        return $vendors->map(fn (Vendor $v) => (new VendorResource($v))->resolve() + ['availability' => $this->availability->status($v)])->all();
    }

    private function vendorQuery(?string $city)
    {
        $q = Vendor::active()->with('hours')->withExists(['items as has_offers' => fn ($i) => $i->where(fn ($w) => $w->where('is_special', true)->orWhereNotNull('special_price_zig'))]);
        if (Setting::platformMode() === 'single') {
            return $q->whereKey(Setting::singleVendorId());
        }

        return $q->when($city, fn ($w) => $w->where('city', $city));
    }

    public function home(Request $request)
    {
        if (Setting::platformMode() === 'single' && ($v = Vendor::find(Setting::singleVendorId()))) {
            return redirect()->route('site.store', $v->slug);
        }
        $city = $request->query('city', session('city'));

        $blocks = HomeBlock::where('is_visible', true)->where(fn ($q) => $q->whereNull('city_scope')->orWhere('city_scope', $city))->orderBy('sort_order')->get();
        $vendors = $this->vendorQuery($city)->orderByDesc('is_featured')->orderByDesc('rating')->limit(24)->get();

        return Inertia::render('site/home', [
            'seo' => $this->seo(Setting::get('apps.seo_title'), null, null, [
                '@context' => 'https://schema.org', '@type' => 'Organization', 'name' => Setting::get('general.business_name'), 'url' => url('/'),
                'contactPoint' => ['@type' => 'ContactPoint', 'telephone' => Setting::get('general.support_phone'), 'contactType' => 'customer service', 'areaServed' => 'ZW'],
            ]),
            'city' => $city,
            'blocks' => $blocks->map->only('id', 'type', 'title', 'subtitle', 'cta_label', 'link_to', 'payload'),
            'categories' => Category::whereNull('vendor_id')->orderBy('sort_order')->get(['id', 'name', 'icon']),
            'stores' => $this->storeCards($vendors),
            'specials' => ItemResource::collection(Item::with('vendor')->where('is_available', true)
                ->where(fn ($q) => $q->where('is_special', true)->orWhereNotNull('special_price_zig'))
                ->whereHas('vendor', fn ($v) => $v->where('status', 'active')->when($city, fn ($w) => $w->where('city', $city)))->limit(12)->get()),
            'stats' => ['stores' => Vendor::active()->count(), 'cities' => count(Setting::get('general.cities'))],
        ]);
    }

    public function stores(Request $request)
    {
        $city = $request->query('city', session('city'));
        $cuisine = $request->query('cuisine');
        $q = $request->query('q');
        $sort = $request->query('sort', 'recommended');

        $vendors = $this->vendorQuery($city)
            ->when($cuisine, fn ($w) => $w->where('cuisine', $cuisine))
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', "%$q%")->orWhere('cuisine', 'like', "%$q%")->orWhereHas('items', fn ($i) => $i->where('name', 'like', "%$q%"))))
            ->when($request->boolean('free_delivery'), fn ($w) => $w->where('delivery_fee_zig', 0))
            ->when($request->boolean('offers'), fn ($w) => $w->whereHas('items', fn ($i) => $i->whereNotNull('special_price_zig')))
            ->when($sort === 'rating', fn ($w) => $w->orderByDesc('rating'))
            ->when($sort === 'fastest', fn ($w) => $w->orderBy('prep_minutes'))
            ->when($sort === 'recommended', fn ($w) => $w->orderByDesc('is_featured')->orderByDesc('rating'))
            ->get();

        $title = trim(($cuisine ? "$cuisine " : '').'food delivery'.($city ? " in $city" : ''));

        return Inertia::render('site/stores', [
            'seo' => $this->seo(ucfirst($title).' | Zvino', 'Order from '.$vendors->count().' '.($cuisine ?? '').' restaurants'.($city ? " in $city" : '').'. Pay with EcoCash, InnBucks, OneMoney or card.'),
            'stores' => $this->storeCards($vendors),
            'cuisines' => Vendor::active()->whereNotNull('cuisine')->distinct()->orderBy('cuisine')->pluck('cuisine'),
            'filters' => ['city' => $city, 'cuisine' => $cuisine, 'q' => $q, 'sort' => $sort, 'free_delivery' => $request->boolean('free_delivery'), 'offers' => $request->boolean('offers')],
            'matchingItems' => $q ? ItemResource::collection(Item::with('vendor')->where('is_available', true)->where('name', 'like', "%$q%")->whereHas('vendor', fn ($v) => $v->where('status', 'active'))->limit(12)->get()) : [],
        ]);
    }

    public function store(Request $request, string $slug)
    {
        $vendor = Vendor::where('slug', $slug)->where('status', 'active')->firstOrFail();
        $vendor->load(['categories' => fn ($q) => $q->orderBy('sort_order'), 'categories.items' => fn ($q) => $q->orderBy('sort_order'), 'categories.items.modifierGroups.options', 'categories.items.vendor', 'hours', 'zone']);

        $menu = $vendor->categories->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'items' => ItemResource::collection($c->items->filter(fn ($i) => ! ($i->needs_power && $vendor->power_out))->values())->resolve()])->filter(fn ($c) => count($c['items']))->values();
        $popular = collect($menu)->flatMap(fn ($c) => $c['items'])->filter(fn ($i) => $i['is_popular'] || $i['special_price'])->take(6)->values();

        return Inertia::render('site/store', [
            'seo' => $this->seo("{$vendor->name}: order online in {$vendor->city} | Zvino", ($vendor->description ?: "{$vendor->cuisine} in {$vendor->city}.").' Delivered in '.($vendor->prep_minutes + 15).'–'.($vendor->prep_minutes + 30).' minutes.', $vendor->cover_path ?? $vendor->logo_path, [
                '@context' => 'https://schema.org', '@type' => 'Restaurant', 'name' => $vendor->name, 'servesCuisine' => $vendor->cuisine, 'image' => $vendor->cover_path ? url($vendor->cover_path) : null,
                'address' => ['@type' => 'PostalAddress', 'streetAddress' => $vendor->address, 'addressLocality' => $vendor->city, 'addressCountry' => 'ZW'],
                'aggregateRating' => $vendor->rating_count ? ['@type' => 'AggregateRating', 'ratingValue' => $vendor->rating, 'reviewCount' => $vendor->rating_count] : null,
                'hasMenu' => url("/store/{$vendor->slug}"),
            ]),
            'store' => (new VendorResource($vendor))->resolve() + [
                'availability' => $this->availability->status($vendor),
                'hours' => $vendor->hours->map->only('weekday', 'opens_at', 'closes_at'),
                'offers_delivery' => $vendor->offers_delivery, 'offers_pickup' => $vendor->offers_pickup, 'accepts_scheduled' => $vendor->accepts_scheduled,
                'price_level' => $vendor->price_level, 'power_out' => $vendor->power_out, 'rating_count' => $vendor->rating_count,
                'zone_fee' => $vendor->zone ? ['base' => $vendor->zone->base_delivery_fee_zig, 'free_km' => $vendor->zone->free_km, 'per_km' => $vendor->zone->per_km_fee_zig] : null,
            ],
            'menu' => $menu,
            'popular' => $popular,
            'reviews' => Review::where('vendor_id', $vendor->id)->where('is_hidden', false)->whereNotNull('comment')->with('user:id,name')->latest()->limit(6)->get()
                ->map(fn ($r) => ['id' => $r->id, 'rating' => $r->vendor_rating, 'comment' => $r->comment, 'reply' => $r->vendor_reply, 'author' => explode(' ', $r->user?->name ?? 'Customer')[0], 'at' => $r->created_at]),
            'isFavorite' => $request->user()?->favorites()->where('vendor_id', $vendor->id)->exists() ?? false,
        ]);
    }

    public function page(string $slug)
    {
        $page = Page::where('slug', $slug)->where('is_published', true)->firstOrFail();

        return Inertia::render('site/page', ['seo' => $this->seo("{$page->title} | Zvino", strip_tags(\Illuminate\Support\Str::limit($page->body, 150))), 'page' => $page->only('slug', 'title', 'body', 'updated_at')]);
    }

    public function plus(Request $request)
    {
        return Inertia::render('site/plus', [
            'seo' => $this->seo('Zvino+: free delivery & lower fees | Zvino', 'Join Zvino+ for free delivery and half-price service fees on every order.'),
            'plans' => SubscriptionPlan::where('is_active', true)->get(),
            'current' => $request->user()?->activeSubscription(),
        ]);
    }

    public function giftCards()
    {
        return Inertia::render('site/gift-cards', [
            'seo' => $this->seo('Gift a meal: Zvino gift cards', 'Send a Zvino gift card to anyone in Zimbabwe. They get an SMS and order what they love.'),
            'amounts' => Setting::get('loyalty.gift_card_amounts'),
            'enabled' => Setting::get('loyalty.gift_cards_enabled'),
        ]);
    }

    public function partners()
    {
        return Inertia::render('site/partners', ['seo' => $this->seo('Partner with Zvino: grow your restaurant', 'Reach thousands of new customers in Harare and Bulawayo. Zvino handles delivery, payments and marketing.'), 'commission' => Setting::get('fees.default_commission_pct')]);
    }

    public function drivers()
    {
        return Inertia::render('site/drivers', ['seo' => $this->seo('Drive with Zvino: earn on your schedule', 'Deliver with your motorbike, bicycle or car. Weekly payouts to EcoCash. Keep 100% of tips.'), 'basePay' => Setting::get('delivery.driver_base_pay_zig'), 'perKm' => Setting::get('delivery.driver_per_km_zig')]);
    }

    public function group(string $code)
    {
        $group = GroupOrder::where('code', strtoupper($code))->with('vendor')->firstOrFail();

        return Inertia::render('site/group', [
            'seo' => $this->seo("Join the group order from {$group->vendor->name} | Zvino", 'Add what you want, and the host pays in one go.'),
            'code' => $group->code,
            'store' => $group->vendor->only('id', 'name', 'slug', 'logo_path', 'cover_path'),
            'menu' => ItemResource::collection($group->vendor->items()->with('modifierGroups.options', 'vendor')->where('is_available', true)->orderBy('sort_order')->get()),
        ]);
    }

    public function setCity(Request $request)
    {
        $city = $request->validate(['city' => ['required', 'in:'.implode(',', Setting::get('general.cities'))]])['city'];
        session(['city' => $city]);

        return back();
    }
}

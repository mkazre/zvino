<?php

namespace App\Services;

use App\Models\Category;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\SupplierCategory;
use App\Models\SupplierLocation;
use App\Models\SupplierProduct;
use App\Models\SupplierSource;
use App\Models\Vendor;
use App\Models\VendorHour;
use App\Suppliers\TmPnpClient;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Keeps Zvino in step with a supplier (TM Pick n Pay):
 *   1. categories()  - the supplier's departments and aisles (admin ticks which to sell)
 *   2. locations()   - every physical branch, each becoming a Zvino store (created as a draft)
 *   3. products()    - all products in the ticked categories: price, promo, photo, size, branch stock
 *   4. applyToStore()- each published Zvino store's menu, priced with Zvino's markup
 * Markup: product setting → aisle → department → the supplier default; percent or a fixed USD amount.
 */
class SupplierSync
{
    public function __construct(private ?TmPnpClient $client = null)
    {
        $this->client ??= new TmPnpClient; // pauses between requests per the admin setting
    }

    public static function source(): SupplierSource
    {
        return SupplierSource::firstOrCreate(['key' => 'tmpnp'], ['name' => 'TM Pick n Pay']);
    }

    // ── 1. Categories ────────────────────────────────────────────────

    public function categories(SupplierSource $source): int
    {
        $sort = 0;
        foreach ($this->client->categories() as $dep) {
            SupplierCategory::updateOrCreate(['supplier_source_id' => $source->id, 'slug' => $dep['slug']], ['name' => $dep['name'], 'parent_slug' => null, 'products_count' => $dep['count'], 'sort' => ++$sort]);
            foreach ($dep['children'] as $aisle) {
                SupplierCategory::updateOrCreate(['supplier_source_id' => $source->id, 'slug' => $aisle['slug']], ['name' => $aisle['name'], 'parent_slug' => $dep['slug'], 'sort' => ++$sort]);
            }
        }

        return $sort;
    }

    // ── 2. Branches → Zvino stores ───────────────────────────────────

    /** Creates a draft Zvino store for every new branch; never changes stores the admin has edited. */
    public function locations(SupplierSource $source): array
    {
        $created = 0;
        $seen = [];
        foreach ($this->client->locations() as $l) {
            $seen[] = $l['id'];
            $loc = SupplierLocation::updateOrCreate(['supplier_source_id' => $source->id, 'external_id' => $l['id']], [
                'name' => $l['name'], 'branch' => TmPnpClient::branchName($l['name']), 'region' => $l['region'], 'city' => $l['city'],
                'address' => $l['address'], 'phone' => $l['phone'], 'lat' => $l['lat'], 'lng' => $l['lng'],
                'opens_at' => $l['opens'], 'closes_at' => $l['closes'], 'active' => $l['active'],
            ]);
            if (! $loc->vendor_id && $loc->active) {
                $this->createStore($source, $loc);
                $created++;
            }
        }
        // Branches the supplier closed: pause their Zvino store.
        $closed = SupplierLocation::where('supplier_source_id', $source->id)->whereNotIn('external_id', $seen)->get();
        foreach ($closed as $loc) {
            $loc->update(['active' => false]);
            $loc->vendor?->update(['status' => 'suspended']);
        }

        return ['created' => $created, 'closed' => $closed->count(), 'total' => count($seen)];
    }

    public function createStore(SupplierSource $source, SupplierLocation $loc): Vendor
    {
        return DB::transaction(function () use ($source, $loc) {
            $name = $source->storeName($loc->branch);
            $vendor = Vendor::create([
                'name' => $name, 'slug' => Str::slug($name).'-'.Str::lower(Str::random(4)),
                'kind' => 'grocery', 'cuisine' => 'Groceries', 'status' => 'pending', // draft until published
                'description' => "Groceries and household essentials, hand-picked and delivered by Zvino.",
                'city' => $loc->city ?: 'Harare', 'address' => $loc->address, 'lat' => $loc->lat, 'lng' => $loc->lng,
                'commission_pct' => 0, 'prep_minutes' => $source->shopping_minutes ?: 25, 'auto_accept' => true,
            ]);
            if ($loc->opens_at && $loc->closes_at) {
                foreach (range(0, 6) as $day) {
                    VendorHour::create(['vendor_id' => $vendor->id, 'weekday' => $day, 'opens_at' => $loc->opens_at, 'closes_at' => $loc->closes_at]);
                }
            }
            $loc->update(['vendor_id' => $vendor->id]);

            return $vendor;
        });
    }

    // ── 3. Products ──────────────────────────────────────────────────

    /** Departments/aisles to fetch, most specific first so products get their aisle. */
    public function targets(SupplierSource $source): array
    {
        $cats = SupplierCategory::where('supplier_source_id', $source->id)->get();
        $deps = $cats->whereNull('parent_slug')->keyBy('slug');
        $targets = [];
        foreach ($cats->whereNotNull('parent_slug') as $aisle) {
            if ($aisle->selected || ($deps[$aisle->parent_slug]->selected ?? false)) {
                $targets[] = ['slug' => $aisle->slug, 'category' => $aisle->name, 'department' => $deps[$aisle->parent_slug]->name ?? null, 'department_slug' => $aisle->parent_slug];
            }
        }
        foreach ($deps->where('selected', true) as $dep) { // leftovers not in any aisle
            $targets[] = ['slug' => $dep->slug, 'category' => $dep->name, 'department' => $dep->name, 'department_slug' => $dep->slug];
        }

        return $targets;
    }

    /** Fetch one department/aisle. Products already seen in this run (in an aisle) keep that aisle. */
    public function products(SupplierSource $source, array $target, string $runId): int
    {
        $n = 0;
        foreach ($this->client->products($target['slug']) as $p) {
            $price = (float) ($p['price'] ?? 0);
            if ($price <= 0 || (($p['status'] ?? 'published') !== 'published')) {
                continue;
            }
            $existing = SupplierProduct::where('supplier_source_id', $source->id)->where('external_id', (string) $p['id'])->first();
            if ($existing && ($existing->attributes['run'] ?? null) === $runId) {
                continue; // already picked up from its aisle this run
            }
            $sale = (float) ($p['sale_price'] ?? 0);
            $stock = collect($p['stock_levels'] ?? [])->mapWithKeys(fn ($s) => [(string) $s['id'] => (int) ($s['pivot']['stock_quantity'] ?? 0)])->all();
            $image = ! empty($p['image']) ? TmPnpClient::CDN.ltrim($p['image'], '/') : null;
            $num = fn ($v) => is_numeric($v) && (float) $v > 0 ? round((float) $v, 3) : null;

            $data = [
                'sku' => 'TMPNP-'.($p['product_code'] ?? $p['id']),
                'name' => TmPnpClient::tidyName($p['name']),
                'description' => TmPnpClient::text($p['description'] ?? null),
                'department' => $target['department'], 'department_slug' => $target['department_slug'],
                'category' => $target['category'], 'category_slug' => $target['slug'],
                'price_usd' => round($price, 2),
                'sale_price_usd' => $sale > 0 && $sale < $price ? round($sale, 2) : null,
                'image_url' => $image,
                'attributes' => array_filter(['weight_kg' => $num($p['weight'] ?? null), 'width_cm' => $num($p['width'] ?? null), 'height_cm' => $num($p['height'] ?? null),
                    'source_url' => ! empty($p['slug']) ? TmPnpClient::SITE.'/products/'.$p['slug'] : null, 'run' => $runId]),
                'stock' => $stock,
                'active' => true,
                'synced_at' => now(),
            ];
            if ($existing) {
                if ($image && $image !== $existing->image_url) {
                    $data['image_path'] = null; // new photo: copy it again
                }
                $existing->update($data);
            } else {
                SupplierProduct::create($data + ['supplier_source_id' => $source->id, 'external_id' => (string) $p['id']]);
            }
            $n++;
        }

        return $n;
    }

    /** After all categories: products not seen this run are no longer sold (photos are copied by CopyPhotos jobs). */
    public function finishProducts(SupplierSource $source, string $runId): int
    {
        $gone = SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)
            ->where(fn ($q) => $q->whereNull('attributes->run')->orWhere('attributes->run', '!=', $runId))->update(['active' => false]);

        return $gone;
    }

    // ── 4. Pricing and store menus ───────────────────────────────────

    /** Markup rule for a product: [type, value, where it came from]. */
    public function markupFor(SupplierProduct $p, SupplierSource $source, $cats): array
    {
        if ($p->markup_type) {
            return [$p->markup_type, (float) $p->markup_value, 'product'];
        }
        foreach ([$p->category_slug, $p->department_slug] as $slug) {
            $c = $slug ? ($cats[$slug] ?? null) : null;
            if ($c && $c->markup_type) {
                return [$c->markup_type, (float) $c->markup_value, $c->parent_slug ? 'aisle' : 'department'];
            }
        }

        return [$source->markup_type, (float) $source->markup_value, 'default'];
    }

    public static function applyMarkup(float $usd, string $type, float $value): float
    {
        return round($type === 'fixed' ? $usd + $value : $usd * (1 + $value / 100), 2);
    }

    /** Zvino's selling prices in USD: [price, sale price]. */
    public function sellUsd(SupplierProduct $p, SupplierSource $source, $cats): array
    {
        [$type, $value] = $this->markupFor($p, $source, $cats);

        return [self::applyMarkup($p->price_usd, $type, $value), $p->sale_price_usd ? self::applyMarkup($p->sale_price_usd, $type, $value) : null];
    }

    /** Build/refresh one Zvino store's menu from the supplier catalogue. */
    public function applyToStore(SupplierSource $source, SupplierLocation $loc): array
    {
        $vendor = $loc->vendor;
        if (! $vendor) {
            return ['new' => 0, 'updated' => 0, 'off' => 0];
        }
        @set_time_limit(600);
        $rate = ExchangeRate::current();
        $cats = SupplierCategory::where('supplier_source_id', $source->id)->get()->keyBy('slug');
        $counts = ['new' => 0, 'updated' => 0, 'off' => 0];

        DB::transaction(function () use ($source, $loc, $vendor, $rate, $cats, &$counts) {
            $items = Item::where('vendor_id', $vendor->id)->whereNotNull('supplier_product_id')->get()->keyBy('supplier_product_id');
            $menuCats = Category::where('vendor_id', $vendor->id)->get()->keyBy(fn ($c) => mb_strtolower($c->name));
            $sort = (int) Category::where('vendor_id', $vendor->id)->max('sort_order');
            $now = now();
            $inserts = [];

            SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)->orderBy('department')->orderBy('category')->orderBy('name')
                ->chunk(500, function ($products) use ($source, $loc, $vendor, $rate, $cats, $items, &$menuCats, &$sort, $now, &$inserts, &$counts) {
                    foreach ($products as $p) {
                        $section = ($source->group_by === 'department' ? $p->department : $p->category) ?: ($p->category ?: 'Other');
                        $cat = $menuCats[mb_strtolower($section)] ??= Category::create(['vendor_id' => $vendor->id, 'name' => $section, 'sort_order' => ++$sort]);
                        [$sell, $sale] = $this->sellUsd($p, $source, $cats);
                        $price = round($sell * $rate, 2);
                        $special = $sale ? round($sale * $rate, 2) : null;
                        $stock = $p->stock[$loc->external_id] ?? null;
                        $available = ! $source->hide_out_of_stock || $stock === null || $stock > 0;
                        $attrs = array_filter(($p->attributes ?? []) + ['branch_stock' => $stock], fn ($v, $k) => $v !== null && $k !== 'run', ARRAY_FILTER_USE_BOTH);
                        $fields = [
                            'category_id' => $cat->id, 'name' => $p->name, 'description' => $p->description, 'image_path' => $p->image_path ?? $p->image_url,
                            'source_image_url' => $p->image_url, 'price_zig' => $price, 'special_price_zig' => $special, 'is_special' => (bool) $special,
                            'cost_usd' => $p->price_usd, 'is_available' => $available, 'sku' => $p->sku,
                        ];
                        $item = $items[$p->id] ?? null;
                        if (! $item) {
                            $inserts[] = $fields + ['vendor_id' => $vendor->id, 'supplier_product_id' => $p->id, 'attributes' => json_encode($attrs), 'sold_by' => 'unit', 'created_at' => $now, 'updated_at' => $now];
                            $counts['new']++;

                            continue;
                        }
                        $item->fill($fields + ['attributes' => $attrs]);
                        if ($item->isDirty()) {
                            $item->save();
                            $counts['updated']++;
                        }
                    }
                });
            foreach (array_chunk($inserts, 500) as $chunk) {
                Item::insert($chunk);
            }
            // No longer sold by the supplier (or category unticked): switch off.
            $counts['off'] = Item::where('vendor_id', $vendor->id)->whereNotNull('supplier_product_id')->where('is_available', true)
                ->whereHas('supplierProduct', fn ($q) => $q->where('active', false))->update(['is_available' => false]);
        });

        return $counts;
    }

    /** Re-price every published store now (after a markup change) without fetching from the supplier. */
    public function publishedLocations(SupplierSource $source)
    {
        return SupplierLocation::where('supplier_source_id', $source->id)->whereHas('vendor', fn ($q) => $q->where('status', 'active'))->with('vendor')->get();
    }

    // ── Running a sync ───────────────────────────────────────────────

    /**
     * Queue a full sync: categories & branches → each ticked department/aisle → finish (retire,
     * photos, store menus). Runs on the separate 'supplier' queue, one small step at a time.
     */
    public static function start(SupplierSource $source, string $trigger = 'manual'): string
    {
        $s = $source->sync_status ?? [];
        if (($s['state'] ?? null) === 'running' && isset($s['started_at']) && now()->subHours(3)->lt($s['started_at'])) {
            return $s['run_id']; // already running
        }
        $run = (string) Str::uuid();
        $source->update(['sync_status' => ['state' => 'running', 'run_id' => $run, 'trigger' => $trigger, 'started_at' => now()->toIso8601String(), 'step' => 'Waiting to start', 'done' => 0, 'total' => null, 'products' => 0]]);
        $id = $source->id;

        \Illuminate\Support\Facades\Bus::chain([
            new \App\Jobs\Supplier\SyncCatalogue($id, $run),
            new \App\Jobs\Supplier\FinishSync($id, $run),
        ])->onQueue('supplier')->catch(function (\Throwable $e) use ($id, $run) {
            $src = SupplierSource::find($id);
            if ($src && ($src->sync_status['run_id'] ?? null) === $run) {
                $src->update(['sync_status' => array_merge($src->sync_status, ['state' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 300), 'finished_at' => now()->toIso8601String()])]);
            }
        })->dispatch();

        return $run;
    }
}

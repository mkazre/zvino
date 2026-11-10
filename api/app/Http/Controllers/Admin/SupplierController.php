<?php

namespace App\Http\Controllers\Admin;

use App\Jobs\Supplier\ApplyToStore;
use App\Models\AuditLog;
use App\Models\ExchangeRate;
use App\Models\SupplierCategory;
use App\Models\SupplierLocation;
use App\Models\SupplierProduct;
use App\Models\SupplierSource;
use App\Services\SupplierSync;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/**
 * Admin → Suppliers → TM Pick n Pay: pick categories, set markups, publish branches as Zvino
 * stores, and run / watch the sync (also runs every Monday night).
 */
class SupplierController extends AdminController
{
    private function source(): SupplierSource
    {
        return SupplierSync::source();
    }

    public function show(Request $request, SupplierSync $sync)
    {
        $source = $this->source();
        $tab = in_array($request->query('tab'), ['categories', 'products', 'stores'], true) ? $request->query('tab') : 'overview';
        $cats = SupplierCategory::where('supplier_source_id', $source->id)->orderBy('sort')->get();
        $synced = SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)->selectRaw('category_slug, department_slug, count(*) as n')->groupBy('category_slug', 'department_slug')->get();
        $perAisle = $synced->groupBy('category_slug')->map->sum('n');
        $perDep = $synced->groupBy('department_slug')->map->sum('n');
        $rate = ExchangeRate::current();
        $catsBySlug = $cats->keyBy('slug');

        $products = null;
        if ($tab === 'products') {
            $products = SupplierProduct::where('supplier_source_id', $source->id)
                ->when($request->query('q'), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('sku', 'like', "%$s%")))
                ->when($request->query('category'), fn ($q, $c) => $q->where(fn ($w) => $w->where('category_slug', $c)->orWhere('department_slug', $c)))
                ->when($request->query('show') === 'custom', fn ($q) => $q->whereNotNull('markup_type'))
                ->when($request->query('show') === 'inactive', fn ($q) => $q->where('active', false), fn ($q) => $request->query('show') === 'all' ? $q : $q->where('active', true))
                ->orderBy('department')->orderBy('category')->orderBy('name')
                ->paginate(50)->withQueryString()
                ->through(function (SupplierProduct $p) use ($sync, $source, $catsBySlug, $rate) {
                    [$type, $value, $from] = $sync->markupFor($p, $source, $catsBySlug);
                    [$sell, $sale] = $sync->sellUsd($p, $source, $catsBySlug);

                    return [
                        'id' => $p->id, 'sku' => $p->sku, 'name' => $p->name, 'category' => $p->category, 'department' => $p->department,
                        'image' => $p->image_path ?? $p->image_url, 'active' => $p->active,
                        'cost_usd' => $p->price_usd, 'sale_cost_usd' => $p->sale_price_usd,
                        'sell_usd' => $sell, 'sale_sell_usd' => $sale, 'sell_zig' => round($sell * $rate, 2),
                        'markup' => ['type' => $type, 'value' => $value, 'from' => $from],
                        'branches_in_stock' => collect($p->stock ?? [])->filter(fn ($q) => $q > 0)->count(),
                    ];
                });
        }

        return Inertia::render('admin/suppliers', [
            'tab' => $tab,
            'source' => $source->only('id', 'name', 'enabled', 'store_name_pattern', 'markup_type', 'markup_value', 'group_by', 'hide_out_of_stock', 'weekly_sync', 'shopping_minutes', 'request_pause_ms', 'last_synced_at', 'sync_status'),
            'stats' => [
                'categories_selected' => $cats->where('selected', true)->count(),
                'products' => SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)->count(),
                'photos_pending' => SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)->whereNull('image_path')->whereNotNull('image_url')->count(),
                'stores' => SupplierLocation::where('supplier_source_id', $source->id)->whereNotNull('vendor_id')->count(),
                'published' => SupplierLocation::where('supplier_source_id', $source->id)->whereHas('vendor', fn ($q) => $q->where('status', 'active'))->count(),
                'rate' => $rate,
            ],
            'categories' => $cats->whereNull('parent_slug')->values()->map(fn ($d) => [
                'id' => $d->id, 'slug' => $d->slug, 'name' => $d->name, 'selected' => $d->selected, 'count' => $d->products_count, 'synced' => (int) ($perDep[$d->slug] ?? 0),
                'markup_type' => $d->markup_type, 'markup_value' => $d->markup_value,
                'aisles' => $cats->where('parent_slug', $d->slug)->values()->map(fn ($a) => ['id' => $a->id, 'slug' => $a->slug, 'name' => $a->name, 'selected' => $a->selected, 'synced' => (int) ($perAisle[$a->slug] ?? 0), 'markup_type' => $a->markup_type, 'markup_value' => $a->markup_value]),
            ]),
            'products' => $products,
            'filters' => $request->only('q', 'category', 'show'),
            'stores' => $tab === 'stores' || $tab === 'overview' ? SupplierLocation::where('supplier_source_id', $source->id)->with(['vendor' => fn ($q) => $q->withCount(['items', 'items as live_items_count' => fn ($i) => $i->where('is_available', true)])])->orderBy('city')->orderBy('branch')->get()->map(fn ($l) => [
                'id' => $l->id, 'branch' => $l->branch, 'city' => $l->city, 'region' => $l->region, 'address' => $l->address, 'phone' => $l->phone,
                'hours' => $l->opens_at ? substr($l->opens_at, 0, 5).'–'.substr($l->closes_at, 0, 5) : null, 'active' => $l->active,
                'has_pin' => $l->vendor?->lat !== null,
                'vendor' => $l->vendor ? ['id' => $l->vendor->id, 'name' => $l->vendor->name, 'status' => $l->vendor->status, 'items' => $l->vendor->items_count, 'live_items' => $l->vendor->live_items_count] : null,
            ]) : [],
        ]);
    }

    public function settings(Request $request)
    {
        $source = $this->source();
        $data = $request->validate([
            'enabled' => ['boolean'],
            'store_name_pattern' => ['required', 'string', 'max:80', 'regex:/\{branch\}/'],
            'markup_type' => ['required', 'in:percent,fixed'],
            'markup_value' => ['required', 'numeric', 'between:0,1000'],
            'group_by' => ['required', 'in:category,department'],
            'hide_out_of_stock' => ['boolean'],
            'weekly_sync' => ['boolean'],
            'shopping_minutes' => ['required', 'integer', 'between:5,120'],
            'request_pause_ms' => ['required', 'integer', 'between:300,10000'],
        ], ['store_name_pattern.regex' => 'Include {branch} in the store name, e.g. “Zvino Market {branch}”.']);

        // Rename stores that still use the old automatic name.
        if ($data['store_name_pattern'] !== $source->store_name_pattern) {
            foreach (SupplierLocation::where('supplier_source_id', $source->id)->with('vendor')->get() as $l) {
                if ($l->vendor && $l->vendor->name === $source->storeName($l->branch)) {
                    $l->vendor->update(['name' => trim(str_replace('{branch}', $l->branch, $data['store_name_pattern']))]);
                }
            }
        }
        $repriced = $source->markup_type !== $data['markup_type'] || $source->markup_value != $data['markup_value'] || $source->group_by !== $data['group_by'] || $source->hide_out_of_stock !== ($data['hide_out_of_stock'] ?? $source->hide_out_of_stock);
        $source->update($data);
        AuditLog::record('supplier.settings', $source, $data);
        if ($repriced) {
            $this->repriceStores($source);
        }

        return back()->with('success', 'Supplier settings saved.'.($repriced ? ' Store prices are being updated.' : ''));
    }

    /** Load categories and branches from the supplier now (quick: two requests). */
    public function refresh(SupplierSync $sync)
    {
        $source = $this->source();
        try {
            $sync->categories($source);
            $r = $sync->locations($source);
        } catch (\Throwable $e) {
            report($e);

            return back()->with('error', 'Couldn’t reach TM Pick n Pay right now: '.$e->getMessage());
        }

        return back()->with('success', "Categories and branches loaded. {$r['total']} branches".($r['created'] ? ", {$r['created']} new draft stores" : '').'.');
    }

    public function categories(Request $request)
    {
        $source = $this->source();
        $data = $request->validate(['selected' => ['array'], 'selected.*' => ['string', 'max:120']]);
        SupplierCategory::where('supplier_source_id', $source->id)->update(['selected' => false]);
        SupplierCategory::where('supplier_source_id', $source->id)->whereIn('slug', $data['selected'] ?? [])->update(['selected' => true]);
        AuditLog::record('supplier.categories', $source, ['selected' => $data['selected'] ?? []]);

        return back()->with('success', count($data['selected'] ?? []).' categories selected. Run a sync to bring in their products.');
    }

    /** Markup for a department/aisle (null type = use the default). */
    public function categoryMarkup(Request $request, SupplierCategory $category)
    {
        abort_unless($category->supplier_source_id === $this->source()->id, 404);
        $data = $this->markupRules($request);
        $category->update(['markup_type' => $data['type'], 'markup_value' => $data['type'] ? $data['value'] : null]);
        $this->repriceStores($this->source());

        return back()->with('success', "Markup saved for {$category->name}. Store prices are being updated.");
    }

    /** Markup for one or many products at once. */
    public function productMarkup(Request $request)
    {
        $source = $this->source();
        $ids = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:5000'], 'ids.*' => ['integer']])['ids'];
        $data = $this->markupRules($request);
        $n = SupplierProduct::where('supplier_source_id', $source->id)->whereIn('id', $ids)
            ->update(['markup_type' => $data['type'], 'markup_value' => $data['type'] ? $data['value'] : null]);
        $this->repriceStores($source);

        return back()->with('success', "Markup updated for $n product".($n === 1 ? '' : 's').'. Store prices are being updated.');
    }

    private function markupRules(Request $request): array
    {
        $data = $request->validate(['type' => ['nullable', Rule::in(['percent', 'fixed'])], 'value' => ['nullable', 'required_with:type', 'numeric', 'between:-50,1000']]);

        return ['type' => $data['type'] ?? null, 'value' => (float) ($data['value'] ?? 0)];
    }

    /** Publish or draft branches (Zvino stores). Publishing fills the store's menu. */
    public function stores(Request $request, SupplierSync $sync)
    {
        $source = $this->source();
        $data = $request->validate(['ids' => ['required', 'array', 'min:1'], 'ids.*' => ['integer'], 'status' => ['required', 'in:active,pending']]);
        $locs = SupplierLocation::where('supplier_source_id', $source->id)->whereIn('id', $data['ids'])->get();
        $changed = 0;
        foreach ($locs as $loc) {
            $vendor = $loc->vendor ?? ($loc->active ? $sync->createStore($source, $loc) : null);
            if (! $vendor) {
                continue;
            }
            $vendor->update(['status' => $data['status']]);
            if ($data['status'] === 'active') {
                ApplyToStore::dispatch($source->id, 'publish', $loc->id);
            }
            $changed++;
        }
        AuditLog::record('supplier.stores', $source, $data);

        return back()->with('success', $data['status'] === 'active'
            ? "$changed store".($changed === 1 ? '' : 's').' published. Their menus are being filled in the background.'
            : "$changed store".($changed === 1 ? '' : 's').' moved to draft (hidden from customers).');
    }

    public function sync()
    {
        $source = $this->source();
        if (! SupplierCategory::where('supplier_source_id', $source->id)->where('selected', true)->exists()) {
            return back()->with('error', 'Choose at least one category first.');
        }
        SupplierSync::start($source, 'manual');
        AuditLog::record('supplier.sync', $source);

        return back()->with('success', 'Sync started. It runs gently in the background; this page shows progress.');
    }

    public function status()
    {
        $s = $this->source();

        return response()->json(['sync_status' => $s->sync_status, 'last_synced_at' => $s->last_synced_at]);
    }

    private function repriceStores(SupplierSource $source): void
    {
        foreach (app(SupplierSync::class)->publishedLocations($source) as $loc) {
            ApplyToStore::dispatch($source->id, 'reprice', $loc->id);
        }
    }
}

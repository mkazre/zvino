<?php

namespace App\Services;

use App\Jobs\ImportItemImages;
use App\Models\Category;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Vendor;
use Illuminate\Support\Facades\DB;

/**
 * Puts checked CSV rows (App\Support\ProductCsv) into one or more stores' menus.
 * Products are matched by their code (sku) per store, so importing a newer file updates prices and
 * stock instead of creating duplicates. Same options for the preview and the real import.
 *
 * Options:
 *   markup_pct          added on top of the shelf price (Zvino buys at the shelf price)
 *   group_by            'category' (aisle, e.g. Eggs) or 'department' (e.g. Perishables)
 *   hide_out_of_stock   products out of stock at every branch are added but switched off
 *   overwrite_details   also replace names, descriptions, photos and category of existing products
 *   deactivate_missing  switch off this store's imported products (same source) that aren't in the file
 */
class ProductImporter
{
    public function options(array $o): array
    {
        return [
            'markup_pct' => max(0, min(200, (float) ($o['markup_pct'] ?? 0))),
            'group_by' => ($o['group_by'] ?? 'category') === 'department' ? 'department' : 'category',
            'hide_out_of_stock' => (bool) ($o['hide_out_of_stock'] ?? true),
            'overwrite_details' => (bool) ($o['overwrite_details'] ?? false),
            'deactivate_missing' => (bool) ($o['deactivate_missing'] ?? false),
        ];
    }

    /** ZiG price for a row (USD shelf price + markup, at today's rate), or the row's own ZiG price. */
    public function prices(array $row, array $o, float $rate): array
    {
        $k = 1 + $o['markup_pct'] / 100;
        $price = $row['price_usd'] ? round($row['price_usd'] * $k * $rate, 2) : round($row['price_zig'] * $k, 2);
        $sale = $row['sale_price_usd'] ? round($row['sale_price_usd'] * $k * $rate, 2) : null;

        return [$price, $sale && $sale < $price ? $sale : null];
    }

    private function categoryName(array $row, array $o): string
    {
        $name = $o['group_by'] === 'department' ? ($row['department'] ?: $row['category']) : ($row['category'] ?: $row['department']);

        return $name !== '' ? $name : 'Other';
    }

    /** What would happen, per store, without saving anything. */
    public function preview(array $rows, array $vendorIds, array $o): array
    {
        $o = $this->options($o);
        $rate = ExchangeRate::current();
        $stores = [];
        foreach (Vendor::whereIn('id', $vendorIds)->get(['id', 'name']) as $v) {
            $existing = Item::where('vendor_id', $v->id)->whereNotNull('sku')->get(['id', 'sku', 'price_zig', 'special_price_zig', 'is_available'])->keyBy('sku');
            $cats = Category::where('vendor_id', $v->id)->pluck('name')->map(fn ($n) => mb_strtolower($n))->flip();
            $new = $updated = $same = 0;
            $priceChanges = [];
            $newCats = [];
            foreach ($rows as $r) {
                [$price, $sale] = $this->prices($r, $o, $rate);
                $cat = $this->categoryName($r, $o);
                if (! isset($cats[mb_strtolower($cat)])) {
                    $newCats[$cat] = true;
                }
                $e = $existing[$r['sku']] ?? null;
                if (! $e) {
                    $new++;
                } elseif (abs((float) $e->price_zig - $price) >= 0.01 || abs((float) $e->special_price_zig - (float) $sale) >= 0.01) {
                    $updated++;
                    if (count($priceChanges) < 8) {
                        $priceChanges[] = ['name' => $r['name'], 'from' => (float) $e->price_zig, 'to' => $price];
                    }
                } else {
                    $same++;
                }
            }
            $missing = $o['deactivate_missing'] ? $existing->keys()->diff(array_column($rows, 'sku'))->count() : 0;
            $stores[] = ['id' => $v->id, 'name' => $v->name, 'new' => $new, 'updated' => $updated, 'unchanged' => $same, 'switched_off' => $missing, 'new_categories' => array_keys($newCats), 'price_changes' => $priceChanges];
        }

        return [
            'stores' => $stores,
            'rate' => $rate,
            'out_of_stock' => count(array_filter($rows, fn ($r) => ! $r['in_stock'])),
            'with_images' => count(array_filter($rows, fn ($r) => $r['image_url'])),
            'sample' => array_map(function ($r) use ($o, $rate) {
                [$price, $sale] = $this->prices($r, $o, $rate);

                return ['sku' => $r['sku'], 'name' => $r['name'], 'category' => $this->categoryName($r, $o), 'image' => $r['image_url'], 'cost_usd' => $r['price_usd'], 'price_zig' => $price, 'sale_zig' => $sale, 'in_stock' => $r['in_stock']];
            }, array_slice($rows, 0, 12)),
        ];
    }

    /** Save the rows into each store. Returns per-store counts. */
    public function import(array $rows, array $vendorIds, array $o): array
    {
        $o = $this->options($o);
        $rate = ExchangeRate::current();
        @set_time_limit(600);
        $result = [];
        $imageItems = [];

        foreach (Vendor::whereIn('id', $vendorIds)->get() as $vendor) {
            $counts = ['store' => $vendor->name, 'new' => 0, 'updated' => 0, 'switched_off' => 0];
            DB::transaction(function () use ($rows, $o, $rate, $vendor, &$counts, &$imageItems) {
                $existing = Item::where('vendor_id', $vendor->id)->whereNotNull('sku')->get()->keyBy('sku');
                $cats = Category::where('vendor_id', $vendor->id)->get()->keyBy(fn ($c) => mb_strtolower($c->name));
                $nextSort = (int) Category::where('vendor_id', $vendor->id)->max('sort_order');
                $now = now();
                $inserts = [];

                foreach ($rows as $i => $r) {
                    $catName = $this->categoryName($r, $o);
                    $cat = $cats[mb_strtolower($catName)] ??= Category::create(['vendor_id' => $vendor->id, 'name' => $catName, 'sort_order' => ++$nextSort]);
                    [$price, $sale] = $this->prices($r, $o, $rate);
                    $available = $r['in_stock'] || ! $o['hide_out_of_stock'];
                    $e = $existing[$r['sku']] ?? null;

                    if (! $e) {
                        $inserts[] = [
                            'vendor_id' => $vendor->id, 'sku' => $r['sku'], 'category_id' => $cat->id, 'name' => $r['name'],
                            'description' => $r['description'] ?: null, 'image_path' => $r['image_url'] ?: null, 'source_image_url' => $r['image_url'] ?: null,
                            'price_zig' => $price, 'special_price_zig' => $sale, 'is_special' => (bool) $sale, 'cost_usd' => $r['price_usd'],
                            'sold_by' => $r['sold_by'], 'is_available' => $available, 'attributes' => json_encode($r['attributes'] ?: null),
                            'sort_order' => $i, 'created_at' => $now, 'updated_at' => $now,
                        ];
                        $counts['new']++;

                        continue;
                    }

                    $changes = ['price_zig' => $price, 'special_price_zig' => $sale, 'is_special' => (bool) $sale, 'cost_usd' => $r['price_usd'], 'is_available' => $available, 'attributes' => $r['attributes'] ?: null];
                    if ($o['overwrite_details']) {
                        $changes += ['name' => $r['name'], 'description' => $r['description'] ?: null, 'category_id' => $cat->id];
                        if ($r['image_url'] && $r['image_url'] !== $e->source_image_url) {
                            $changes += ['image_path' => $r['image_url'], 'source_image_url' => $r['image_url']];
                        }
                    } elseif (! $e->image_path && $r['image_url']) {
                        $changes += ['image_path' => $r['image_url'], 'source_image_url' => $r['image_url']];
                    }
                    $e->fill($changes);
                    if ($e->isDirty()) {
                        $e->save();
                        $counts['updated']++;
                    }
                }

                foreach (array_chunk($inserts, 500) as $chunk) {
                    Item::insert($chunk);
                }

                if ($o['deactivate_missing']) {
                    $counts['switched_off'] = Item::where('vendor_id', $vendor->id)->whereNotNull('sku')
                        ->whereNotIn('sku', array_column($rows, 'sku'))->where('is_available', true)->update(['is_available' => false]);
                }

                // Photos still pointing at the other website: copy them to Zvino in the background.
                $imageItems = array_merge($imageItems, Item::where('vendor_id', $vendor->id)->whereNotNull('source_image_url')->where('image_path', 'like', 'http%')->pluck('id')->all());
            });
            $result[] = $counts;
        }

        foreach (array_chunk(array_unique($imageItems), 40) as $chunk) {
            ImportItemImages::dispatch($chunk);
        }

        return $result;
    }
}

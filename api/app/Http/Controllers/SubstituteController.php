<?php

namespace App\Http\Controllers;

use App\Http\Resources\ItemResource;
use App\Models\Item;
use App\Support\Money;
use Illuminate\Http\Request;

/**
 * "Select substitute": similar products from the same store (website and app). Same aisle first,
 * closest in price; then the same brand from other aisles. Optional search.
 */
class SubstituteController extends Controller
{
    public function index(Request $request, Item $item)
    {
        abort_unless($item->vendor?->is_shopper_store, 404);
        $q = trim((string) $request->query('q'));
        $base = fn () => Item::where('vendor_id', $item->vendor_id)->where('is_available', true)->where('id', '!=', $item->id)
            ->where(fn ($w) => $w->whereNull('unavailable_until')->orWhere('unavailable_until', '<', now()));
        $price = (float) ($item->special_price_zig ?: $item->price_zig);

        if ($q !== '') {
            $items = $base()->where('name', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%')->orderBy('name')->limit(30)->get();
        } else {
            $items = $base()->where('category_id', $item->category_id)
                ->orderByRaw('ABS(COALESCE(special_price_zig, price_zig) - ?)', [$price])->limit(24)->get();
            $brand = collect(explode(' ', $item->name))->first(fn ($w) => mb_strlen($w) >= 3 && ! is_numeric($w[0]));
            if ($items->count() < 12 && $brand) {
                $items = $items->concat($base()->where('name', 'like', $brand.'%')->whereNotIn('id', $items->pluck('id'))->limit(12 - $items->count())->get());
            }
        }

        return response()->json([
            'item' => ['id' => $item->id, 'name' => $item->name, 'price' => Money::both($price)],
            'options' => $items->map(fn (Item $i) => [
                'id' => $i->id, 'name' => $i->name, 'image' => $i->image_path,
                'price' => Money::both((float) ($i->special_price_zig ?: $i->price_zig)),
                'difference' => Money::both(round((float) ($i->special_price_zig ?: $i->price_zig) - $price, 2)),
                'size' => ItemResource::size($i->getAttribute('attributes')),
            ])->values(),
        ]);
    }
}

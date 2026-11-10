<?php

namespace App\Http\Controllers\Api\Driver;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Services\ShopperService;
use App\Support\Money;
use Illuminate\Http\Request;

/** Driver app: shopping an order in a Zvino-run store (prefix /api/driver/jobs/{order}/shop). */
class ShopController extends Controller
{
    public function __construct(private ShopperService $shopper) {}

    private function own(Request $request, Order $order): void
    {
        $driver = $request->user()->driver;
        abort_unless($driver && $driver->status === 'approved' && $order->driver_id === $driver->id, 404);
        abort_unless(ShopperService::isShopperOrder($order), 422, 'This order isn’t a shopping order.');
    }

    public function show(Request $request, Order $order)
    {
        $this->own($request, $order);

        return response()->json($this->present($order));
    }

    public function start(Request $request, Order $order)
    {
        $this->own($request, $order);

        return response()->json($this->present($this->shopper->start($order)));
    }

    public function mark(Request $request, Order $order, OrderItem $line)
    {
        $this->own($request, $order);
        $data = $request->validate([
            'status' => ['required', 'in:found,partial,missing,replaced'],
            'found_qty' => ['required_if:status,partial', 'nullable', 'integer', 'min:1'],
            'replacement_item_id' => ['required_if:status,replaced', 'nullable', 'integer'],
            'replacement_qty' => ['nullable', 'integer', 'min:1', 'max:99'],
        ]);
        $this->shopper->mark($order, $line, $data);

        return response()->json($this->present($order->fresh()));
    }

    /** Replacement search in this store's catalogue (in stock, similar first). */
    public function search(Request $request, Order $order)
    {
        $this->own($request, $order);
        $q = trim((string) $request->query('q'));
        $line = $request->integer('for') ? OrderItem::where('order_id', $order->id)->find($request->integer('for')) : null;
        $categoryId = $line?->item?->category_id;

        $items = Item::where('vendor_id', $order->vendor_id)->where('is_available', true)
            ->when($q !== '', fn ($w) => $w->where('name', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $q).'%'), fn ($w) => $w->where('category_id', $categoryId))
            ->when($line?->item_id, fn ($w) => $w->where('id', '!=', $line->item_id))
            ->orderByRaw('category_id = ? desc', [$categoryId ?? 0])->orderBy('name')->limit(30)->get();

        return response()->json($items->map(fn (Item $i) => [
            'id' => $i->id, 'name' => $i->name, 'image' => $i->image_path, 'price' => Money::both((float) ($i->special_price_zig ?: $i->price_zig)),
            'size' => \App\Http\Resources\ItemResource::size($i->getAttribute('attributes')),
        ]));
    }

    public function finish(Request $request, Order $order)
    {
        $this->own($request, $order);
        $data = $request->validate([
            'till_total_usd' => ['required', 'numeric', 'min:0.01', 'max:100000'],
            'paid_with' => ['required', 'in:zvino_card,own_cash'],
            'slip' => ['required', 'image', 'max:8192'],
        ], ['slip.required' => 'Take a photo of the till slip.']);
        $path = $request->file('slip')->store("till-slips/{$order->id}", 'local'); // private
        $this->shopper->finish($order, $data, $path);

        return response()->json($this->present($order->fresh()));
    }

    private function present(Order $order): array
    {
        $order->load('items.item.category', 'vendor', 'user');
        $lines = $order->items->map(fn (OrderItem $l) => [
            'id' => $l->id,
            'name' => $l->name,
            'quantity' => $l->quantity,
            'options' => collect($l->options ?? [])->map(fn ($o) => is_array($o) ? ($o['name'] ?? '') : (string) $o)->filter()->values(),
            'notes' => $l->notes,
            'image' => $l->item?->image_path,
            'aisle' => $l->item?->category?->name ?? 'Other',
            'size' => $l->item ? \App\Http\Resources\ItemResource::size($l->item->getAttribute('attributes')) : null,
            'unit_price' => Money::both($l->unit_price_zig),
            'shelf_usd' => $l->item?->cost_usd,
            'status' => $l->shop_status,
            'found_qty' => $l->found_qty,
            'replacement' => $l->replacement,
        ])->sortBy('aisle')->values();

        return [
            'id' => $order->id,
            'reference' => $order->reference,
            'status' => $order->status,
            'store' => $order->vendor->only('name', 'address'),
            'customer' => ['name' => $order->user?->name, 'phone' => $order->user?->phone],
            'substitution_pref' => $order->substitution_pref ?? 'best',
            'notes' => $order->notes,
            'started' => (bool) $order->shopping_started_at,
            'finished' => (bool) $order->shopping_finished_at,
            'lines' => $lines,
            'done' => $lines->whereNotNull('status')->count(),
            'total' => $lines->count(),
            'expected_till_usd' => ShopperService::expectedTillUsd($order),
            'refund' => Money::both((float) $order->items->sum('refund_zig')),
        ];
    }
}

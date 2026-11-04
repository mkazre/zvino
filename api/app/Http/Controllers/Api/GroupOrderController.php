<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GroupOrder;
use App\Models\Item;
use App\Models\Setting;
use App\Models\Vendor;
use App\Services\CartService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Group orders: the host shares a link/code, friends add items, the host checks out.
 * At checkout the group's items are moved into the host's cart and the normal checkout runs.
 */
class GroupOrderController extends Controller
{
    public function create(Request $request)
    {
        abort_unless(Setting::get('orders.allow_group_orders'), 422, 'Group orders are not available.');
        $data = $request->validate([
            'vendor_id' => ['required', 'exists:vendors,id'],
            'spend_limit_zig' => ['nullable', 'numeric', 'min:10'],
            'deadline_minutes' => ['nullable', 'integer', 'between:5,240'],
        ]);

        $group = GroupOrder::create([
            'host_id' => $request->user()->id,
            'vendor_id' => $data['vendor_id'],
            'spend_limit_zig' => $data['spend_limit_zig'] ?? null,
            'deadline_at' => isset($data['deadline_minutes']) ? now()->addMinutes($data['deadline_minutes']) : null,
        ]);

        return response()->json($this->present($group), 201);
    }

    public function show(string $code)
    {
        return response()->json($this->present($this->find($code)));
    }

    public function addItem(Request $request, string $code)
    {
        $group = $this->find($code);
        abort_unless($group->status === 'open' && (! $group->deadline_at || $group->deadline_at->isFuture()), 422, 'This group order is closed.');

        $data = $request->validate([
            'item_id' => ['required', 'exists:items,id'],
            'quantity' => ['required', 'integer', 'between:1,20'],
            'variant' => ['nullable', 'string'],
            'modifiers' => ['array'],
            'notes' => ['nullable', 'string', 'max:200'],
            'guest_name' => [$request->user('sanctum') ? 'nullable' : 'required', 'string', 'max:60'],
        ]);
        $item = Item::findOrFail($data['item_id']);
        abort_unless($item->vendor_id === $group->vendor_id && $item->isOrderable(), 422, 'That item isn’t available from this store.');

        $user = $request->user('sanctum');
        $unit = $item->priceFor($data['variant'] ?? null, $data['modifiers'] ?? []);

        if ($group->spend_limit_zig) {
            $mine = $group->items()->where($user ? 'user_id' : 'guest_name', $user?->id ?? $data['guest_name'])->get()->sum(fn ($i) => $i->unit_price_zig * $i->quantity);
            abort_if($mine + $unit * $data['quantity'] > $group->spend_limit_zig, 422, 'That would go over the host’s spend limit of ZiG '.$group->spend_limit_zig.'.');
        }

        $group->items()->create([
            'user_id' => $user?->id,
            'guest_name' => $user ? null : $data['guest_name'],
            'item_id' => $item->id,
            'quantity' => $data['quantity'],
            'options' => ['variant' => $data['variant'] ?? null, 'modifiers' => $data['modifiers'] ?? []],
            'unit_price_zig' => $unit,
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json($this->present($group->fresh()), 201);
    }

    public function removeItem(Request $request, string $code, int $itemId)
    {
        $group = $this->find($code);
        $line = $group->items()->findOrFail($itemId);
        $user = $request->user('sanctum');
        abort_unless($user && ($line->user_id === $user->id || $group->host_id === $user->id), 403);
        $line->delete();

        return response()->json($this->present($group->fresh()));
    }

    /** Host locks the group and moves everything into their cart for checkout. */
    public function checkout(Request $request, string $code, CartService $carts)
    {
        $group = $this->find($code);
        abort_unless($group->host_id === $request->user()->id, 403, 'Only the host can check out.');
        abort_unless($group->status === 'open' && $group->items()->exists(), 422, 'Nothing to check out.');

        DB::transaction(function () use ($group, $request, $carts) {
            $cart = $carts->for($request->user());
            $cart->items()->delete();
            $cart->update(['vendor_id' => $group->vendor_id, 'promo_code_id' => null]);
            foreach ($group->items()->with('user')->get() as $line) {
                $who = $line->user?->name ?? $line->guest_name;
                $cart->items()->create([
                    'item_id' => $line->item_id, 'quantity' => $line->quantity, 'options' => $line->options,
                    'unit_price_zig' => $line->unit_price_zig, 'notes' => trim("For {$who}. ".($line->notes ?? '')),
                ]);
            }
            $group->update(['status' => 'locked']);
        });

        return response()->json(['ok' => true, 'group_order_id' => $group->id, 'cart' => $carts->present($carts->for($request->user()))]);
    }

    private function find(string $code): GroupOrder
    {
        return GroupOrder::where('code', strtoupper($code))->with('vendor', 'items.item', 'items.user', 'host')->firstOrFail();
    }

    private function present(GroupOrder $g): array
    {
        $g->loadMissing('vendor', 'items.item', 'items.user', 'host');

        return [
            'code' => $g->code,
            'status' => $g->status,
            'host' => $g->host->only('id', 'name'),
            'vendor' => $g->vendor->only('id', 'name', 'slug'),
            'spend_limit' => $g->spend_limit_zig ? Money::both($g->spend_limit_zig) : null,
            'deadline_at' => $g->deadline_at,
            'share_url' => url("/group/{$g->code}"),
            'participants' => $g->items->groupBy(fn ($i) => $i->user?->name ?? $i->guest_name)->map(fn ($lines, $name) => [
                'name' => $name,
                'items' => $lines->map(fn ($l) => ['id' => $l->id, 'name' => $l->item->name, 'quantity' => $l->quantity, 'options' => $l->options, 'total' => Money::both($l->unit_price_zig * $l->quantity)])->values(),
                'subtotal' => Money::both($lines->sum(fn ($l) => $l->unit_price_zig * $l->quantity)),
            ])->values(),
            'subtotal' => Money::both($g->items->sum(fn ($l) => $l->unit_price_zig * $l->quantity)),
        ];
    }
}

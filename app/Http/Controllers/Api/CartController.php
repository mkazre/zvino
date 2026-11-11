<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CartItem;
use App\Models\Item;
use App\Services\CartService;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function __construct(private CartService $carts) {}

    public function show(Request $request)
    {
        return response()->json($this->carts->present($this->carts->for($request->user())));
    }

    public function add(Request $request)
    {
        $data = $request->validate([
            'item_id' => ['required', 'exists:items,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:50'],
            'variant' => ['nullable', 'string'],
            'modifiers' => ['array'],
            'modifiers.*' => ['string'],
            'notes' => ['nullable', 'string', 'max:255'],
            'replace' => ['boolean'],
            'substitute_item_id' => ['nullable', 'integer'],
        ]);

        $cart = $this->carts->add(
            $request->user(), Item::findOrFail($data['item_id']), $data['quantity'],
            $data['variant'] ?? null, $data['modifiers'] ?? [], $data['notes'] ?? null, $data['replace'] ?? false, $data['substitute_item_id'] ?? null,
        );

        return response()->json($this->carts->present($cart), 201);
    }

    public function update(Request $request, CartItem $cartItem)
    {
        abort_unless($cartItem->cart->user_id === $request->user()->id, 404);
        $data = $request->validate(['quantity' => ['required', 'integer', 'min:0', 'max:50']]);

        $data['quantity'] === 0 ? $cartItem->delete() : $cartItem->update($data);

        return $this->show($request);
    }

    public function remove(Request $request, CartItem $cartItem)
    {
        abort_unless($cartItem->cart->user_id === $request->user()->id, 404);
        $cartItem->delete();

        return $this->show($request);
    }

    public function clear(Request $request)
    {
        $cart = $this->carts->for($request->user());
        $cart->items()->delete();
        $cart->update(['vendor_id' => null, 'promo_code_id' => null]);

        return $this->show($request);
    }

    public function voucher(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'max:40']]);
        $this->carts->applyPromo($this->carts->for($request->user()), $data['code']);

        return $this->show($request);
    }

    public function removeVoucher(Request $request)
    {
        $this->carts->for($request->user())->update(['promo_code_id' => null]);

        return $this->show($request);
    }
}

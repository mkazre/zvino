<?php

namespace App\Services;

use App\Models\Cart;
use App\Models\Item;
use App\Models\PromoCode;
use App\Models\User;
use App\Support\Money;
use Illuminate\Validation\ValidationException;

class CartService
{
    public function for(User $user): Cart
    {
        return Cart::firstOrCreate(['user_id' => $user->id])->load('items.item', 'vendor', 'promoCode');
    }

    /** One vendor per cart: adding from another vendor requires replace=true. */
    public function add(User $user, Item $item, int $qty, ?string $variant, array $modifiers, ?string $notes, bool $replace = false): Cart
    {
        if (! $item->is_available) {
            throw ValidationException::withMessages(['item_id' => 'This item is currently unavailable.']);
        }

        $cart = $this->for($user);

        if ($cart->vendor_id && $cart->vendor_id !== $item->vendor_id && $cart->items->isNotEmpty()) {
            if (! $replace) {
                throw ValidationException::withMessages([
                    'vendor' => 'Your cart has items from '.$cart->vendor->name.'. Start a new cart?',
                ])->status(409);
            }
            $cart->items()->delete();
            $cart->promo_code_id = null;
        }

        $cart->vendor_id = $item->vendor_id;
        $cart->save();

        $cart->items()->create([
            'item_id' => $item->id,
            'quantity' => $qty,
            'options' => ['variant' => $variant, 'modifiers' => $modifiers],
            'unit_price_zig' => $item->priceFor($variant, $modifiers),
            'notes' => $notes,
        ]);

        return $this->for($user);
    }

    public function applyPromo(Cart $cart, string $code): Cart
    {
        $promo = PromoCode::where('code', strtoupper($code))->first();
        $subtotal = $this->subtotal($cart);

        if (! $promo || ! $promo->isUsableFor($subtotal, $cart->vendor_id)) {
            throw ValidationException::withMessages(['code' => 'This voucher is not valid for your cart.']);
        }

        $cart->update(['promo_code_id' => $promo->id]);

        return $cart->load('promoCode');
    }

    public function subtotal(Cart $cart): float
    {
        return round($cart->items->sum(fn ($i) => $i->unit_price_zig * $i->quantity), 2);
    }

    /** Fee breakdown in ZiG; shared by the Cart screen and order placement. */
    public function totals(Cart $cart, string $fulfilment = 'delivery'): array
    {
        $subtotal = $this->subtotal($cart);
        $delivery = $fulfilment === 'delivery' ? (float) ($cart->vendor?->delivery_fee_zig ?? 0) : 0.0;
        $service = $subtotal > 0 ? (float) config('zvino.service_fee_zig') : 0.0;
        $promo = $cart->promoCode;
        $discount = $promo && $promo->isUsableFor($subtotal, $cart->vendor_id) ? $promo->discountFor($subtotal, $delivery) : 0.0;
        $total = max(0, $subtotal + $delivery + $service - $discount);
        // Prices are VAT-inclusive; we report the VAT portion for receipts.
        $vat = round($total - $total / (1 + config('zvino.vat_pct') / 100), 2);

        return compact('subtotal', 'delivery', 'service', 'discount', 'vat', 'total');
    }

    public function present(Cart $cart): array
    {
        $t = $this->totals($cart);

        return [
            'vendor' => $cart->vendor?->only('id', 'name', 'slug', 'min_order_zig'),
            'items' => $cart->items->map(fn ($ci) => [
                'id' => $ci->id,
                'item_id' => $ci->item_id,
                'name' => $ci->item?->name,
                'image' => $ci->item?->image_path,
                'quantity' => $ci->quantity,
                'options' => $ci->options,
                'notes' => $ci->notes,
                'unit_price' => Money::both($ci->unit_price_zig),
                'line_total' => Money::both($ci->unit_price_zig * $ci->quantity),
            ])->values(),
            'voucher' => $cart->promoCode?->only('code', 'type', 'value'),
            'totals' => array_map(fn ($v) => Money::both($v), $t),
        ];
    }
}

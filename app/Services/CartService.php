<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\Cart;
use App\Models\Item;
use App\Models\PromoCode;
use App\Models\User;
use App\Support\Money;
use Illuminate\Validation\ValidationException;

class CartService
{
    public function __construct(private PricingService $pricing) {}

    public function for(User $user): Cart
    {
        return Cart::firstOrCreate(['user_id' => $user->id])->load('items.item', 'vendor.zone', 'promoCode', 'user');
    }

    /** One vendor per cart: adding from another vendor requires replace=true. */
    public function add(User $user, Item $item, int $qty, ?string $variant, array $modifiers, ?string $notes, bool $replace = false): Cart
    {
        if (! $item->isOrderable()) {
            throw ValidationException::withMessages(['item_id' => 'This item is currently unavailable.']);
        }
        $item->loadMissing('modifierGroups.options');
        $item->validateSelection($variant, $modifiers);

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

    /** Fee breakdown in ZiG via PricingService; shared by the Cart screen and order placement. */
    public function totals(Cart $cart, string $fulfilment = 'delivery', array $dest = [], float $tip = 0): array
    {
        if (! $cart->vendor) {
            return ['subtotal' => 0.0, 'delivery' => 0.0, 'service' => 0.0, 'small_order' => 0.0, 'discount' => 0.0, 'tip' => 0.0, 'vat' => 0.0, 'total' => 0.0, 'member_savings' => 0.0, 'surge' => null, 'distance_km' => null, 'eta_minutes' => null, 'zone_id' => null, 'promo_id' => null, 'deal' => null];
        }

        $lines = $cart->items->map(fn ($i) => ['item_id' => $i->item_id, 'quantity' => $i->quantity, 'unit' => (float) $i->unit_price_zig])->all();

        return $this->pricing->quote($cart->vendor, $this->subtotal($cart), $fulfilment, $dest, $cart->user, $cart->promoCode, $tip, $lines);
    }

    public function present(Cart $cart, string $fulfilment = 'delivery', array $dest = []): array
    {
        $t = $this->totals($cart, $fulfilment, $dest);
        $moneyKeys = ['subtotal', 'delivery', 'service', 'small_order', 'discount', 'tip', 'vat', 'total', 'member_savings'];

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
            'totals' => collect($t)->only($moneyKeys)->map(fn ($v) => Money::both($v))->all(),
            'surge' => $t['surge'],
            'deal' => $t['deal'] ?? null,
            'distance_km' => $t['distance_km'],
            'eta_minutes' => $t['eta_minutes'],
            'store' => $cart->vendor ? app(StoreAvailability::class)->status($cart->vendor) : null,
            'needs_prescription' => (bool) Setting::get('orders.prescriptions_required') && $cart->items->contains(fn ($ci) => $ci->item?->requires_prescription),
        ];
    }
}

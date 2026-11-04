<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\Item;
use App\Models\Setting;
use App\Models\Vendor;
use App\Services\CartService;
use App\Services\OrderService;
use App\Services\StoreAvailability;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/**
 * The website keeps the basket in the browser (works before sign-in) and syncs it
 * into the customer's server cart at checkout, so pricing and validation are identical to the app.
 */
class CheckoutController extends Controller
{
    public function __construct(private CartService $carts, private OrderService $orders) {}

    public function show(Request $request, StoreAvailability $availability)
    {
        $user = $request->user();
        $cart = $this->carts->for($user);

        return Inertia::render('site/checkout', [
            'seo' => ['title' => 'Checkout | Zvino'],
            'cart' => $this->carts->present($cart),
            'addresses' => $user->addresses()->orderByDesc('is_default')->get(),
            'wallet' => Money::both($user->walletBalance()),
            'methods' => collect(OrderService::METHODS)->filter(fn ($m) => Setting::get("payments.$m"))->values(),
            'tipPresets' => Setting::get('orders.allow_tips') ? Setting::get('orders.tip_presets_pct') : [],
            'scheduleDays' => Setting::get('orders.allow_scheduled') ? Setting::get('orders.schedule_days_ahead') : 0,
            'store' => $cart->vendor ? ['availability' => $availability->status($cart->vendor), 'offers_delivery' => $cart->vendor->offers_delivery, 'offers_pickup' => $cart->vendor->offers_pickup && Setting::get('orders.allow_pickup'), 'accepts_scheduled' => $cart->vendor->accepts_scheduled, 'address' => $cart->vendor->address] : null,
            'cities' => Setting::get('general.cities'),
            'codLimit' => Setting::get('delivery.cash_on_delivery_limit_zig'),
            'phone' => $user->phone,
            'splitTender' => (bool) (Setting::get('payments.split_tender') && Setting::get('payments.wallet')),
            'needsPrescription' => Setting::get('orders.prescriptions_required') && $cart->items->contains(fn ($ci) => $ci->item?->requires_prescription),
            'splitBill' => Setting::get('orders.split_bill') ? (int) Setting::get('orders.split_bill_max_people') : 0,
            'charity' => Setting::get('orders.charity_round_up') ? ['name' => Setting::get('orders.charity_name'), 'step' => (int) Setting::get('orders.charity_round_to_zig')] : null,
        ]);
    }

    /** Replace the server cart with the browser basket. */
    public function sync(Request $request)
    {
        $data = $request->validate([
            'vendor_id' => ['required', 'exists:vendors,id'],
            'lines' => ['required', 'array', 'min:1', 'max:50'],
            'lines.*.item_id' => ['required', 'integer'],
            'lines.*.quantity' => ['required', 'integer', 'between:1,50'],
            'lines.*.variant' => ['nullable', 'string'],
            'lines.*.modifiers' => ['nullable', 'array'],
            'lines.*.notes' => ['nullable', 'string', 'max:200'],
            'promo' => ['nullable', 'string', 'max:40'],
        ]);
        $user = $request->user();

        DB::transaction(function () use ($user, $data) {
            $cart = $this->carts->for($user);
            $cart->items()->delete();
            $cart->update(['vendor_id' => $data['vendor_id']]);
            foreach ($data['lines'] as $l) {
                $item = Item::where('vendor_id', $data['vendor_id'])->find($l['item_id']);
                if ($item) {
                    $this->carts->add($user, $item, $l['quantity'], $l['variant'] ?? null, $l['modifiers'] ?? [], $l['notes'] ?? null, true);
                }
            }
        });
        $cart = $this->carts->for($user);
        if (! empty($data['promo'])) {
            $this->carts->applyPromo($cart, $data['promo']);
        }

        return response()->json($this->carts->present($this->carts->for($user)));
    }

    public function quote(Request $request)
    {
        $data = $request->validate([
            'fulfilment' => ['required', 'in:delivery,pickup'],
            'address_id' => ['nullable', Rule::exists('addresses', 'id')->where('user_id', $request->user()->id)],
            'tip' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'promo' => ['nullable', 'string', 'max:40'],
        ]);
        $cart = $this->carts->for($request->user());
        if (array_key_exists('promo', $data)) {
            $data['promo'] ? $this->carts->applyPromo($cart, $data['promo']) : $cart->update(['promo_code_id' => null]);
            $cart = $this->carts->for($request->user());
        }
        $address = isset($data['address_id']) ? Address::find($data['address_id']) : null;

        $bz = $data['fulfilment'] === 'delivery' && $address ? \App\Models\Zone::batchFor($address->lat, $address->lng) : null;
        $slot = $bz && $cart->vendor ? $bz->batchSlot($cart->vendor) : null;

        return response()->json($this->carts->present($cart, $data['fulfilment'], $address ? ['lat' => $address->lat, 'lng' => $address->lng] : []) + [
            'batch' => $slot,
            'tip_totals' => collect($this->carts->totals($cart, $data['fulfilment'], $address ? ['lat' => $address->lat, 'lng' => $address->lng] : [], (float) ($data['tip'] ?? 0)))
                ->only(['subtotal', 'delivery', 'service', 'small_order', 'discount', 'tip', 'vat', 'total', 'member_savings'])->map(fn ($v) => Money::both((float) $v)),
        ]);
    }

    public function place(Request $request)
    {
        $data = $request->validate([
            'fulfilment' => ['required', 'in:delivery,pickup'],
            'address_id' => ['required_if:fulfilment,delivery', 'nullable', Rule::exists('addresses', 'id')->where('user_id', $request->user()->id)],
            'payment_method' => ['required', Rule::in(OrderService::METHODS)],
            'phone' => ['required_if:payment_method,ecocash,onemoney,innbucks', 'nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:500'],
            'tip' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'scheduled_for' => ['nullable', 'date'],
            'dropoff' => ['nullable', 'in:hand_to_me,leave_at_door'],
            'use_wallet' => ['nullable', 'boolean'],
            'cash_part' => ['nullable', 'numeric', 'min:0'],
            'split_with' => ['nullable', 'array', 'max:10'],
            'split_with.*.phone' => ['required', 'string', 'max:20'],
            'split_with.*.name' => ['nullable', 'string', 'max:40'],
            'split_with.*.amount' => ['required', 'numeric', 'min:1'],
            'prescription' => ['nullable', 'string'],
            'round_up' => ['nullable', 'boolean'],
            'no_cutlery' => ['nullable', 'boolean'],
        ]);
        $data['source'] = 'web';
        if (! empty($data['phone'])) {
            $data['phone'] = SignInController::normalise($data['phone']);
        }
        foreach ($data['split_with'] ?? [] as $i => $s) {
            $data['split_with'][$i]['phone'] = SignInController::normalise($s['phone']);
        }

        [$order, $payment] = $this->orders->placeFromCart($request->user(), $data);

        if ($payment->redirect_url) {
            return Inertia::location($payment->redirect_url); // card: Paynow hosted page
        }

        return redirect()->route('site.order', $order)->with('success', $payment->status === 'paid' || $data['payment_method'] === 'cash' ? 'Order placed! 🎉' : 'Approve the payment prompt on your phone to confirm your order.');
    }
}

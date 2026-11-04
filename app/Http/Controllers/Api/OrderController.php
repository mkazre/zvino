<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Item;
use App\Models\Order;
use App\Services\CartService;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(private OrderService $orders) {}

    public function index(Request $request)
    {
        $orders = $request->user()->orders()->with('vendor', 'items')
            ->where('status', '!=', 'pending_payment')
            ->latest()->paginate(20);

        return OrderResource::collection($orders);
    }

    public function store(Request $request)
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
            'group_order_id' => ['nullable', Rule::exists('group_orders', 'id')->where('host_id', $request->user()->id)],
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

        [$order, $payment] = $this->orders->placeFromCart($request->user(), $data);
        if (! empty($data['group_order_id'])) {
            \App\Models\GroupOrder::whereKey($data['group_order_id'])->update(['status' => 'ordered']);
        }

        return response()->json([
            'order' => new OrderResource($order),
            'payment' => $payment->only('id', 'status', 'method', 'redirect_url'),
            'next' => match (true) {
                $payment->status === 'paid' || $data['payment_method'] === 'cash' => 'track',
                (bool) $payment->redirect_url => 'redirect',
                default => 'await_phone_approval',
            },
        ], 201);
    }

    /** Split bill: resend a friend's prompt (optionally to a new number), or pay their share yourself. */
    public function resendShare(Request $request, Order $order, \App\Models\Payment $payment, \App\Services\Payments\PaynowGateway $paynow)
    {
        abort_unless($order->user_id === $request->user()->id && $payment->order_id === $order->id && ($payment->raw['split_share'] ?? false), 404);
        abort_unless(in_array($payment->status, ['pending', 'failed', 'cancelled'], true) && $order->status === 'pending_payment', 422, 'This share can’t be changed now.');
        $data = $request->validate(['phone' => ['nullable', 'string', 'max:20'], 'pay_myself' => ['nullable', 'boolean']]);

        $payment->update([
            'status' => 'initiated',
            'phone' => ! empty($data['pay_myself']) ? $request->user()->phone : ($data['phone'] ?? $payment->phone),
            'raw' => array_merge($payment->raw, ['reference' => $order->reference.'-S'.$payment->id.'R'.now()->timestamp] + (! empty($data['pay_myself']) ? ['split_share' => false, 'covered_by_host' => true] : [])),
        ]);
        $paynow->initiate($payment);
        if ($paynow->fake()) {
            $this->orders->markPaid($payment->fresh());
        }

        return response()->json($payment->fresh()->only('id', 'status', 'phone'));
    }

    public function show(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        return (new OrderResource($order->load('vendor', 'items', 'address', 'driver.user', 'review')))
            ->additional(['delivery_pin' => $order->delivery_pin, 'split' => $order->payments()->where('provider', 'paynow')->get()
                ->filter(fn ($p) => ($p->raw['split_share'] ?? false) || ($p->raw['covered_by_host'] ?? false))
                ->map(fn ($p) => ['payment_id' => $p->id, 'name' => $p->raw['name'] ?? null, 'phone' => $p->phone, 'amount' => \App\Support\Money::both($p->amount_zig), 'status' => $p->status])->values()]);
    }

    /** Live price for the checkout screen: fees for the chosen address, tip and time. */
    public function quote(Request $request, CartService $carts)
    {
        $data = $request->validate([
            'fulfilment' => ['required', 'in:delivery,pickup'],
            'address_id' => ['nullable', Rule::exists('addresses', 'id')->where('user_id', $request->user()->id)],
            'lat' => ['nullable', 'numeric'], 'lng' => ['nullable', 'numeric'],
            'tip' => ['nullable', 'numeric', 'min:0'],
        ]);
        $address = isset($data['address_id']) ? \App\Models\Address::find($data['address_id']) : null;
        $dest = $address ? ['lat' => $address->lat, 'lng' => $address->lng] : array_filter(['lat' => $data['lat'] ?? null, 'lng' => $data['lng'] ?? null]);

        $cart = $carts->for($request->user());
        $t = $carts->totals($cart, $data['fulfilment'], $dest, (float) ($data['tip'] ?? 0));
        $money = ['subtotal', 'delivery', 'service', 'small_order', 'discount', 'tip', 'vat', 'total', 'member_savings'];

        return response()->json([
            'totals' => collect($t)->only($money)->map(fn ($v) => \App\Support\Money::both($v)),
            'surge' => $t['surge'],
            'distance_km' => $t['distance_km'],
            'eta_minutes' => $t['eta_minutes'],
            'tip_presets_pct' => \App\Models\Setting::get('orders.tip_presets_pct'),
            'payment_methods' => collect(OrderService::METHODS)->filter(fn ($m) => \App\Models\Setting::get("payments.$m"))->values(),
            'wallet_balance' => \App\Support\Money::both($request->user()->walletBalance()),
            'batch' => ($bz = $data['fulfilment'] === 'delivery' ? \App\Models\Zone::batchFor($dest['lat'] ?? null, $dest['lng'] ?? null) : null) && $cart->vendor && ($slot = $bz->batchSlot($cart->vendor))
                ? ['zone' => $slot['zone'], 'departs_at' => $slot['departs_at'], 'arrives_at' => $slot['arrives_at']] : null,
            'deal' => $t['deal'] ?? null,
            'needs_prescription' => (bool) \App\Models\Setting::get('orders.prescriptions_required') && $cart->items->contains(fn ($ci) => $ci->item?->requires_prescription),
            'split_bill' => \App\Models\Setting::get('orders.split_bill') ? ['max_people' => (int) \App\Models\Setting::get('orders.split_bill_max_people')] : null,
            'split_tender' => (bool) (\App\Models\Setting::get('payments.split_tender') && \App\Models\Setting::get('payments.wallet')),
            'round_up' => \App\Models\Setting::get('orders.charity_round_up') ? [
                'charity' => \App\Models\Setting::get('orders.charity_name'),
                'amount' => \App\Support\Money::both(OrderService::roundUpAmount($t['total'])),
            ] : null,
        ]);
    }

    /** Polling fallback for OrderTracking; live updates arrive on private-order.{id}. */
    public function track(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        return response()->json([
            'id' => $order->id,
            'reference' => $order->reference,
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'status_history' => $order->status_history,
            'rider' => $order->rider_name ? $order->only('rider_name', 'rider_phone', 'rider_lat', 'rider_lng') : null,
            'vendor' => $order->vendor->only('name', 'lat', 'lng'),
            'destination' => $order->address?->only('line1', 'lat', 'lng'),
            'channel' => 'private-order.'.$order->id,
        ]);
    }

    public function reorder(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);
        $carts = app(CartService::class);
        $items = Item::whereIn('id', $order->items->pluck('item_id'))->where('is_available', true)->get()->keyBy('id');

        foreach ($order->items as $line) {
            if ($item = $items->get($line->item_id)) {
                $carts->add($request->user(), $item, $line->quantity, $line->options['variant'] ?? null, $line->options['modifiers'] ?? [], $line->notes, true);
            }
        }

        return response()->json($carts->present($carts->for($request->user())));
    }
}

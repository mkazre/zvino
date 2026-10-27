<?php

namespace App\Services;

use App\Events\OrderUpdated;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Payments\PaynowGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderService
{
    public const METHODS = ['ecocash', 'onemoney', 'innbucks', 'card', 'wallet', 'cash'];

    private const STATUS_MESSAGES = [
        'placed' => ['Order placed', 'We\'ve sent your order to the restaurant.'],
        'accepted' => ['Order accepted', 'The restaurant has accepted your order.'],
        'preparing' => ['Being prepared', 'Your food is being prepared.'],
        'ready' => ['Ready', 'Your order is ready.'],
        'picked_up' => ['On the way', 'Your rider has picked up your order.'],
        'delivered' => ['Delivered', 'Enjoy your meal!'],
        'cancelled' => ['Order cancelled', 'Your order was cancelled.'],
    ];

    public function __construct(
        private CartService $carts,
        private PaynowGateway $paynow,
        private PushService $push,
        private LoyaltyService $loyalty,
    ) {}

    public function placeFromCart(User $user, array $data): array
    {
        $cart = $this->carts->for($user);
        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages(['cart' => 'Your cart is empty.']);
        }

        $vendor = $cart->vendor;
        $t = $this->carts->totals($cart, $data['fulfilment']);

        if ($t['subtotal'] < $vendor->min_order_zig) {
            throw ValidationException::withMessages(['cart' => "Minimum order for {$vendor->name} is ZiG {$vendor->min_order_zig}."]);
        }
        if ($data['payment_method'] === 'wallet' && $user->walletBalance() < $t['total']) {
            throw ValidationException::withMessages(['payment_method' => 'Insufficient wallet balance.']);
        }

        [$order, $payment] = DB::transaction(function () use ($user, $cart, $vendor, $t, $data) {
            $rate = ExchangeRate::current();
            $order = Order::create([
                'user_id' => $user->id,
                'vendor_id' => $vendor->id,
                'address_id' => $data['address_id'] ?? null,
                'promo_code_id' => $t['discount'] > 0 ? $cart->promo_code_id : null,
                'source' => 'app',
                'fulfilment' => $data['fulfilment'],
                'payment_method' => $data['payment_method'],
                'notes' => $data['notes'] ?? null,
                'subtotal_zig' => $t['subtotal'],
                'delivery_fee_zig' => $t['delivery'],
                'service_fee_zig' => $t['service'],
                'discount_zig' => $t['discount'],
                'vat_zig' => $t['vat'],
                'total_zig' => $t['total'],
                'zig_per_usd' => $rate,
                'total_usd' => ExchangeRate::toUsd($t['total'], $rate),
                'commission_zig' => round($t['subtotal'] * $vendor->commission_pct / 100, 2),
            ]);

            foreach ($cart->items as $ci) {
                $order->items()->create([
                    'item_id' => $ci->item_id,
                    'name' => $ci->item->name,
                    'quantity' => $ci->quantity,
                    'options' => $ci->options,
                    'unit_price_zig' => $ci->unit_price_zig,
                    'line_total_zig' => $ci->unit_price_zig * $ci->quantity,
                    'notes' => $ci->notes,
                ]);
            }

            if ($order->promo_code_id) {
                $cart->promoCode->increment('used_count');
            }
            $cart->items()->delete();
            $cart->update(['promo_code_id' => null, 'vendor_id' => null]);

            return [$order, $this->startPayment($order, $data['payment_method'], $data['phone'] ?? $user->phone)];
        });

        if ($this->paynow->fake() && $payment->status === 'pending') {
            $this->markPaid($payment);
        }

        return [$order->fresh(['items', 'vendor']), $payment->fresh()];
    }

    /** POS sale: same orders table (source=pos) so reporting is unified. */
    public function placePos(User $cashier, Vendor $vendor, array $lines, string $method, ?string $phone): array
    {
        return DB::transaction(function () use ($cashier, $vendor, $lines, $method, $phone) {
            $items = Item::where('vendor_id', $vendor->id)->whereIn('id', collect($lines)->pluck('item_id'))->get()->keyBy('id');
            $subtotal = collect($lines)->sum(fn ($l) => $items[$l['item_id']]->priceFor($l['variant'] ?? null, $l['modifiers'] ?? []) * $l['quantity']);
            $vat = round($subtotal - $subtotal / (1 + config('zvino.vat_pct') / 100), 2);
            $rate = ExchangeRate::current();

            $order = Order::create([
                'vendor_id' => $vendor->id,
                'cashier_id' => $cashier->id,
                'source' => 'pos',
                'fulfilment' => 'dine_in',
                'status' => 'placed',
                'payment_method' => $method,
                'subtotal_zig' => $subtotal,
                'vat_zig' => $vat,
                'total_zig' => $subtotal,
                'zig_per_usd' => $rate,
                'total_usd' => ExchangeRate::toUsd($subtotal, $rate),
            ]);

            foreach ($lines as $l) {
                $item = $items[$l['item_id']];
                $unit = $item->priceFor($l['variant'] ?? null, $l['modifiers'] ?? []);
                $order->items()->create([
                    'item_id' => $item->id, 'name' => $item->name, 'quantity' => $l['quantity'],
                    'options' => ['variant' => $l['variant'] ?? null, 'modifiers' => $l['modifiers'] ?? []],
                    'unit_price_zig' => $unit, 'line_total_zig' => $unit * $l['quantity'],
                ]);
            }

            // Cash and in-store card terminals settle immediately at the counter.
            if (in_array($method, ['cash', 'card'], true)) {
                $order->update(['payment_status' => 'paid']);
                Payment::create(['order_id' => $order->id, 'provider' => 'pos', 'method' => $method, 'amount_zig' => $subtotal, 'status' => 'paid']);
                OrderUpdated::dispatch($order);

                return [$order->load('items'), null];
            }

            $payment = $this->startPayment($order, $method, $phone);

            return [$order->load('items'), $payment];
        });
    }

    private function startPayment(Order $order, string $method, ?string $phone): Payment
    {
        $payment = Payment::create([
            'order_id' => $order->id,
            'provider' => match ($method) { 'wallet' => 'wallet', 'cash' => 'cash', default => 'paynow' },
            'method' => $method,
            'phone' => $phone,
            'amount_zig' => $order->total_zig,
        ]);

        if ($method === 'wallet') {
            $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'debit', 'amount_zig' => $order->total_zig, 'reason' => 'Order '.$order->reference]);
            $payment->update(['status' => 'paid']);
            $order->update(['payment_status' => 'paid']);
            $this->setStatus($order, 'placed');
        } elseif ($method === 'cash') {
            $payment->update(['status' => 'pending']);
            $order->update(['payment_status' => 'pending_cash']);
            $this->setStatus($order, 'placed');
        } else {
            $order->update(['payment_status' => 'pending']);
            $this->paynow->initiate($payment);
        }

        return $payment;
    }

    public function markPaid(Payment $payment): void
    {
        if ($payment->status === 'paid') {
            return;
        }
        $payment->update(['status' => 'paid']);
        $order = $payment->order;
        $order->update(['payment_status' => 'paid']);

        if ($order->status === 'pending_payment') {
            $this->setStatus($order, 'placed');
        } else {
            OrderUpdated::dispatch($order);
        }
    }

    public function markFailed(Payment $payment, string $status = 'failed'): void
    {
        $payment->update(['status' => $status]);
        $payment->order->update(['payment_status' => 'failed']);
        OrderUpdated::dispatch($payment->order);
    }

    public function setStatus(Order $order, string $status): Order
    {
        $history = $order->status_history ?? [];
        $history[] = ['status' => $status, 'at' => now()->toIso8601String()];

        $stage = match ($status) {
            'preparing' => 'cooking',
            'ready', 'picked_up', 'delivered' => 'ready',
            default => $order->kitchen_stage,
        };

        $order->update(['status' => $status, 'status_history' => $history, 'kitchen_stage' => $stage]);

        if ($status === 'delivered') {
            if ($order->payment_status === 'pending_cash') {
                $order->update(['payment_status' => 'paid']);
                $order->payments()->where('method', 'cash')->update(['status' => 'paid']);
            }
            $this->loyalty->earnForOrder($order);
        }

        OrderUpdated::dispatch($order);

        if ($order->user && isset(self::STATUS_MESSAGES[$status])) {
            [$title, $body] = self::STATUS_MESSAGES[$status];
            $this->push->toUser($order->user, 'order_status', $title, $body, ['order_id' => $order->id]);
        }

        return $order;
    }

    /** Kitchen display: new → cooking → ready, mapped onto order status. */
    public function advanceKitchen(Order $order): Order
    {
        return match ($order->kitchen_stage) {
            'new' => $this->setStatus($order, 'preparing'),
            'cooking' => $this->setStatus($order, 'ready'),
            default => $order,
        };
    }
}

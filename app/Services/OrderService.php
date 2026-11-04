<?php

namespace App\Services;

use App\Events\OrderUpdated;
use App\Models\Address;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Payments\PaynowGateway;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Order lifecycle:
 *   pending_payment → (scheduled) → placed → accepted → preparing → ready → picked_up → arriving → delivered
 *   placed → rejected (store)        any live → cancelled (customer/admin/system)
 */
class OrderService
{
    public const METHODS = ['ecocash', 'onemoney', 'innbucks', 'card', 'wallet', 'cash'];

    public const TRANSITIONS = [
        'pending_payment' => ['scheduled', 'placed', 'cancelled'],
        'scheduled' => ['placed', 'cancelled'],
        'placed' => ['accepted', 'rejected', 'cancelled'],
        'accepted' => ['preparing', 'ready', 'cancelled'],
        'preparing' => ['ready', 'cancelled'],
        'ready' => ['picked_up', 'delivered', 'cancelled'],
        'picked_up' => ['arriving', 'delivered', 'cancelled'],
        'arriving' => ['delivered', 'cancelled'],
        'delivered' => [],
        'rejected' => [],
        'cancelled' => [],
    ];

    private const STATUS_MESSAGES = [
        'scheduled' => ['Order scheduled', 'We’ll send it to {store} in time for {time}.'],
        'placed' => ['Order placed', 'Waiting for {store} to confirm.'],
        'accepted' => ['Order confirmed', '{store} is on it. Ready in about {prep} min.'],
        'preparing' => ['Being prepared', 'Your food is being prepared.'],
        'ready' => ['Ready', 'Your order is ready.'],
        'picked_up' => ['On the way', 'Your driver has picked up your order.'],
        'arriving' => ['Driver arriving', 'Your driver is almost there.'],
        'delivered' => ['Delivered', 'Enjoy your meal! Tap to rate your order.'],
        'rejected' => ['Order declined', '{store} couldn’t take your order. You’ve been refunded.'],
        'cancelled' => ['Order cancelled', 'Your order was cancelled.'],
    ];

    public function __construct(
        private CartService $carts,
        private PaynowGateway $paynow,
        private PushService $push,
        private LoyaltyService $loyalty,
        private StoreAvailability $availability,
        private PricingService $pricing,
        private LedgerService $ledger,
    ) {}

    public function placeFromCart(User $user, array $data): array
    {
        $cart = $this->carts->for($user);
        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages(['cart' => 'Your cart is empty.']);
        }
        $vendor = $cart->vendor;

        $scheduledFor = ! empty($data['scheduled_for']) ? Carbon::parse($data['scheduled_for']) : null;
        $this->assertCanOrder($vendor, $data['fulfilment'], $scheduledFor, $data['payment_method']);

        foreach ($cart->items as $ci) {
            if (! $ci->item?->isOrderable()) {
                throw ValidationException::withMessages(['cart' => "{$ci->item?->name} is no longer available. Please remove it."]);
            }
        }

        $address = isset($data['address_id']) ? Address::find($data['address_id']) : null;
        $dest = $address ? ['lat' => $address->lat, 'lng' => $address->lng] : [];
        $t = $this->carts->totals($cart, $data['fulfilment'], $dest, (float) ($data['tip'] ?? 0));

        if ($t['subtotal'] < max($vendor->min_order_zig, $vendor->zone?->min_order_zig ?? 0)) {
            throw ValidationException::withMessages(['cart' => "Minimum order for {$vendor->name} is ZiG {$vendor->min_order_zig}."]);
        }
        app(RiskService::class)->assertCanPlace($user, $data['payment_method'], $t['total']);
        if ($data['payment_method'] === 'wallet' && $user->walletBalance() < $t['total']) {
            throw ValidationException::withMessages(['payment_method' => 'Insufficient wallet balance.']);
        }
        if ($data['payment_method'] === 'cash' && $t['total'] > Setting::get('delivery.cash_on_delivery_limit_zig')) {
            throw ValidationException::withMessages(['payment_method' => 'Cash on delivery is limited to ZiG '.Setting::get('delivery.cash_on_delivery_limit_zig').'. Please choose another method.']);
        }

        [$order, $payment] = DB::transaction(function () use ($user, $cart, $vendor, $t, $data, $scheduledFor) {
            $rate = ExchangeRate::current();
            $commissionPct = $data['fulfilment'] === 'pickup' ? Setting::get('fees.pickup_commission_pct') : $vendor->commission_pct;

            $order = Order::create([
                'user_id' => $user->id,
                'vendor_id' => $vendor->id,
                'zone_id' => $t['zone_id'],
                'address_id' => $data['address_id'] ?? null,
                'promo_code_id' => $t['discount'] > 0 ? $cart->promo_code_id : null,
                'group_order_id' => $data['group_order_id'] ?? null,
                'source' => $data['source'] ?? 'app',
                'fulfilment' => $data['fulfilment'],
                'dropoff' => $data['dropoff'] ?? 'hand_to_me',
                'payment_method' => $data['payment_method'],
                'notes' => $data['notes'] ?? null,
                'scheduled_for' => $scheduledFor,
                'subtotal_zig' => $t['subtotal'],
                'delivery_fee_zig' => $t['delivery'],
                'service_fee_zig' => $t['service'],
                'small_order_fee_zig' => $t['small_order'],
                'discount_zig' => $t['discount'],
                'tip_zig' => $t['tip'],
                'vat_zig' => $t['vat'],
                'total_zig' => $t['total'],
                'distance_km' => $t['distance_km'],
                'zig_per_usd' => $rate,
                'total_usd' => ExchangeRate::toUsd($t['total'], $rate),
                'commission_zig' => round($t['subtotal'] * $commissionPct / 100, 2),
                'driver_pay_zig' => $data['fulfilment'] === 'delivery' ? $this->pricing->driverPay($t['distance_km']) : 0,
                'delivery_pin' => $data['fulfilment'] === 'delivery' ? str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT) : null,
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

    public function assertCanOrder(Vendor $vendor, string $fulfilment, ?Carbon $scheduledFor, string $method): void
    {
        if (Setting::get('apps.maintenance_mode')) {
            throw ValidationException::withMessages(['cart' => Setting::get('apps.maintenance_message')]);
        }
        if (! Setting::get("payments.$method")) {
            throw ValidationException::withMessages(['payment_method' => 'This payment method is currently unavailable.']);
        }
        if ($fulfilment === 'delivery' && ! $vendor->offers_delivery) {
            throw ValidationException::withMessages(['fulfilment' => "{$vendor->name} only offers pickup."]);
        }
        if ($fulfilment === 'pickup' && (! $vendor->offers_pickup || ! Setting::get('orders.allow_pickup'))) {
            throw ValidationException::withMessages(['fulfilment' => 'Pickup isn’t available for this store.']);
        }

        if ($scheduledFor) {
            if (! Setting::get('orders.allow_scheduled') || ! $vendor->accepts_scheduled) {
                throw ValidationException::withMessages(['scheduled_for' => 'Scheduled orders aren’t available for this store.']);
            }
            if ($scheduledFor->lt(now()->addMinutes(30)) || $scheduledFor->gt(now()->addDays(Setting::get('orders.schedule_days_ahead')))) {
                throw ValidationException::withMessages(['scheduled_for' => 'Choose a time between 30 minutes and '.Setting::get('orders.schedule_days_ahead').' days from now.']);
            }
            if (! $this->availability->isOpen($vendor, $scheduledFor)) {
                throw ValidationException::withMessages(['scheduled_for' => "{$vendor->name} is closed at that time."]);
            }

            return;
        }

        $status = $this->availability->status($vendor);
        if (! $status['is_open']) {
            $when = $status['next_open_at'] ? ' Opens '.Carbon::parse($status['next_open_at'])->format('D H:i').'.' : '';
            throw ValidationException::withMessages(['cart' => "{$vendor->name} isn’t taking orders right now.$when You can schedule for later."]);
        }
    }

    /** POS sale: same orders table (source=pos) so reporting is unified. */
    public function placePos(User $cashier, Vendor $vendor, array $lines, string $method, ?string $phone): array
    {
        return DB::transaction(function () use ($cashier, $vendor, $lines, $method, $phone) {
            $items = Item::where('vendor_id', $vendor->id)->whereIn('id', collect($lines)->pluck('item_id'))->get()->keyBy('id');
            $subtotal = collect($lines)->sum(fn ($l) => $items[$l['item_id']]->priceFor($l['variant'] ?? null, $l['modifiers'] ?? []) * $l['quantity']);
            $vatPct = (float) Setting::get('currency.vat_pct');
            $vat = round($subtotal - $subtotal / (1 + $vatPct / 100), 2);
            $rate = ExchangeRate::current();

            $order = Order::create([
                'vendor_id' => $vendor->id,
                'cashier_id' => $cashier->id,
                'source' => 'pos',
                'fulfilment' => 'dine_in',
                'status' => 'accepted', // counter sales go straight to the kitchen
                'accepted_at' => now(),
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

            if (in_array($method, ['cash', 'card'], true)) {
                $order->update(['payment_status' => 'paid']);
                Payment::create(['order_id' => $order->id, 'provider' => 'pos', 'method' => $method, 'amount_zig' => $subtotal, 'status' => 'paid']);
                OrderUpdated::dispatch($order);

                return [$order->load('items'), null];
            }

            $payment = Payment::create(['order_id' => $order->id, 'provider' => 'paynow', 'method' => $method, 'phone' => $phone, 'amount_zig' => $subtotal]);
            $order->update(['payment_status' => 'pending']);
            $this->paynow->initiate($payment);
            OrderUpdated::dispatch($order);

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
            $this->release($order);
        } elseif ($method === 'cash') {
            $payment->update(['status' => 'pending']);
            $order->update(['payment_status' => 'pending_cash']);
            $this->release($order);
        } else {
            $order->update(['payment_status' => 'pending']);
            $this->paynow->initiate($payment);
        }

        return $payment;
    }

    /** Payment secured: send to the store now, or hold until the scheduled time. */
    private function release(Order $order): void
    {
        if ($order->scheduled_for && $order->scheduled_for->isFuture()) {
            $this->setStatus($order, 'scheduled');
        } else {
            $this->setStatus($order, 'placed');
            if ($order->vendor->auto_accept) {
                $this->accept($order->fresh(), $this->availability->prepMinutes($order->vendor));
            }
        }
    }

    public function markPaid(Payment $payment): void
    {
        if ($payment->status === 'paid') {
            return;
        }
        $payment->update(['status' => 'paid']);
        $order = $payment->order;
        if (! $order) {
            return; // wallet top-up / gift card: handled by WalletService
        }
        $order->update(['payment_status' => 'paid']);

        $order->status === 'pending_payment' ? $this->release($order) : OrderUpdated::dispatch($order);
    }

    public function markFailed(Payment $payment, string $status = 'failed'): void
    {
        $payment->update(['status' => $status]);
        if ($payment->order) {
            $payment->order->update(['payment_status' => 'failed']);
            OrderUpdated::dispatch($payment->order);
        }
    }

    // ── Store actions ────────────────────────────────────────────────

    public function accept(Order $order, int $prepMinutes): Order
    {
        $this->guard($order, 'accepted');
        $ride = $order->distance_km ? \App\Support\Geo::rideMinutes($order->distance_km) : 15;
        $order->update([
            'prep_minutes' => $prepMinutes,
            'accepted_at' => now(),
            'estimated_delivery_at' => now()->addMinutes($prepMinutes + ($order->fulfilment === 'delivery' ? $ride : 0)),
        ]);

        return $this->setStatus($order, 'accepted', ['prep' => $prepMinutes]);
    }

    public function reject(Order $order, string $reason): Order
    {
        $this->guard($order, 'rejected');
        $order->update(['reject_reason' => $reason, 'cancelled_at' => now(), 'cancelled_by' => 'store']);
        $this->refundInFull($order, 'Store declined: '.$reason);

        return $this->setStatus($order, 'rejected');
    }

    public function cancel(Order $order, string $by, string $reason): Order
    {
        $this->guard($order, 'cancelled');

        if ($by === 'customer') {
            $window = now()->subMinutes(Setting::get('orders.customer_cancel_window_minutes'));
            $freeCancel = in_array($order->status, ['pending_payment', 'scheduled', 'placed'], true) || $order->created_at->gte($window);
            if (! $freeCancel) {
                throw ValidationException::withMessages(['order' => 'The store has started your order. Please contact support to cancel.']);
            }
        }

        $order->update(['cancel_reason' => $reason, 'cancelled_at' => now(), 'cancelled_by' => $by]);
        $order->dispatchOffers()->where('status', 'offered')->update(['status' => 'cancelled']);
        $this->refundInFull($order, 'Cancelled: '.$reason);

        return $this->setStatus($order, 'cancelled');
    }

    private function refundInFull(Order $order, string $reason): void
    {
        if ($order->payment_status !== 'paid' || ! $order->user) {
            return;
        }
        // Fast path: credit the wallet instantly; card/mobile reversals are processed by ops from Refunds.
        $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $order->total_zig, 'reason' => $reason]);
        $order->refunds()->create(['amount_zig' => $order->total_zig, 'destination' => 'wallet', 'status' => 'paid', 'reason' => $reason]);
        $order->update(['payment_status' => 'refunded', 'refunded_zig' => $order->total_zig]);
    }

    // ── Status engine ────────────────────────────────────────────────

    public function canTransition(Order $order, string $to): bool
    {
        return in_array($to, self::TRANSITIONS[$order->status] ?? [], true);
    }

    private function guard(Order $order, string $to): void
    {
        if (! $this->canTransition($order, $to)) {
            throw ValidationException::withMessages(['status' => "Order {$order->reference} can’t go from {$order->status} to {$to}."]);
        }
    }

    public function setStatus(Order $order, string $status, array $vars = []): Order
    {
        if ($order->status !== $status) {
            $this->guard($order, $status);
        }

        $history = $order->status_history ?? [];
        $history[] = ['status' => $status, 'at' => now()->toIso8601String()];

        $updates = ['status' => $status, 'status_history' => $history];
        $updates['kitchen_stage'] = match ($status) {
            'preparing' => 'cooking',
            'ready', 'picked_up', 'arriving', 'delivered' => 'ready',
            default => $order->kitchen_stage,
        };
        $stamp = ['ready' => 'ready_at', 'picked_up' => 'picked_up_at', 'delivered' => 'delivered_at'][$status] ?? null;
        if ($stamp) {
            $updates[$stamp] = now();
        }
        $order->update($updates);

        if ($status === 'delivered') {
            if ($order->payment_status === 'pending_cash') {
                $order->update(['payment_status' => 'paid']);
                $order->payments()->where('method', 'cash')->update(['status' => 'paid']);
            }
            if ($order->source !== 'pos') {
                $this->ledger->settleDelivered($order->fresh());
            }
            $this->loyalty->earnForOrder($order);
            app(GrowthService::class)->onOrderDelivered($order);
            $this->hotMealGuarantee($order->fresh());
        }

        OrderUpdated::dispatch($order);

        // Find a driver as soon as the store commits (or when nearly ready, per settings).
        if (in_array($status, ['accepted', 'preparing', 'ready'], true)) {
            $when = Setting::get('delivery.dispatch_when');
            if ($when === 'accepted' || $status !== 'accepted') {
                app(DispatchService::class)->dispatch($order);
            }
        }

        if ($order->user && isset(self::STATUS_MESSAGES[$status])) {
            [$title, $body] = self::STATUS_MESSAGES[$status];
            $body = strtr($body, [
                '{store}' => $order->vendor->name,
                '{prep}' => $vars['prep'] ?? $order->prep_minutes,
                '{time}' => $order->scheduled_for?->format('D H:i'),
            ]);
            $this->push->toUser($order->user, 'order_status', $title, $body, ['order_id' => $order->id, 'status' => $status]);

            // SMS fallback (#45): customers with no app installed still hear about the key moments.
            if (Setting::get('orders.sms_fallback') && $order->user->phone && in_array($status, ['accepted', 'picked_up', 'delivered', 'rejected', 'cancelled'], true)
                && ! $order->user->deviceTokens()->exists()) {
                app(SmsService::class)->send($order->user->phone, "Zvino {$order->reference}: {$title}. {$body}");
            }
        }

        return $order;
    }

    /** Hot-meal guarantee (#12): late delivery → automatic wallet credit, once per order. */
    private function hotMealGuarantee(Order $order): void
    {
        if (! Setting::get('orders.hot_meal_guarantee') || ! $order->user || ! $order->estimated_delivery_at || $order->fulfilment !== 'delivery') {
            return;
        }
        $late = (int) $order->estimated_delivery_at->diffInMinutes($order->delivered_at ?? now(), false);
        if ($late <= Setting::get('orders.late_grace_minutes')) {
            return;
        }
        if ($order->user->walletTransactions()->where('order_id', $order->id)->where('reason', 'like', 'Hot-meal guarantee%')->exists()) {
            return;
        }

        $credit = round(min($order->subtotal_zig * Setting::get('orders.late_credit_pct') / 100, Setting::get('orders.late_credit_max_zig')), 2);
        if ($credit <= 0) {
            return;
        }
        $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $credit, 'reason' => "Hot-meal guarantee: {$order->reference} was {$late} min late"]);
        $this->push->toUser($order->user, 'late_credit', 'Sorry we were late 🙏', 'We’ve added ZiG '.number_format($credit, 2).' to your Zvino wallet.', ['order_id' => $order->id]);
    }

    /** Kitchen display: new → cooking → ready, mapped onto order status. */
    public function advanceKitchen(Order $order): Order
    {
        if ($order->status === 'placed') {
            $order = $this->accept($order, $this->availability->prepMinutes($order->vendor));
        }

        return match ($order->kitchen_stage) {
            'new' => $this->setStatus($order, 'preparing'),
            'cooking' => $this->setStatus($order, 'ready'),
            default => $order,
        };
    }

    // ── Scheduler jobs ───────────────────────────────────────────────

    /** Scheduled orders go to the store prep + ride minutes before the promised time. */
    public function releaseScheduled(): int
    {
        $due = Order::where('status', 'scheduled')->with('vendor')->get()
            ->filter(fn (Order $o) => $o->scheduled_for->subMinutes($this->availability->prepMinutes($o->vendor) + 20)->isPast());

        foreach ($due as $order) {
            $this->setStatus($order, 'placed');
            if ($order->vendor->auto_accept) {
                $this->accept($order->fresh(), $this->availability->prepMinutes($order->vendor));
            }
        }

        return $due->count();
    }

    /** Stores that ignore orders: auto-cancel and refund so customers aren't left waiting. */
    public function cancelUnaccepted(): int
    {
        $stale = Order::where('status', 'placed')->where('source', '!=', 'pos')
            ->where('updated_at', '<', now()->subMinutes(Setting::get('orders.store_accept_timeout_minutes')))
            ->get();

        foreach ($stale as $order) {
            $this->cancel($order, 'system', 'Store did not confirm in time');
        }

        return $stale->count();
    }

    /** Unpaid checkouts older than 30 minutes are abandoned. */
    public function expireUnpaid(): int
    {
        return Order::where('status', 'pending_payment')->where('created_at', '<', now()->subMinutes(30))
            ->update(['status' => 'cancelled', 'cancelled_by' => 'system', 'cancel_reason' => 'Payment not completed', 'cancelled_at' => now()]);
    }
}

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
use App\Support\I18n;
use App\Support\PrescriptionStore;
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
    /**
     * Set by driver endpoints: customer messages (push, email, SMS) go out just after the response,
     * so the driver's phone never waits on a slow mail or SMS server.
     */
    public static bool $notifyAfterResponse = false;

    public const METHODS = ['ecocash', 'onemoney', 'innbucks', 'card', 'wallet', 'cash', 'company'];

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

    /** Zvino-run stores (a Zvino shopper buys the items). */
    private const SHOPPER_MESSAGES = [
        'accepted' => ['Order confirmed', 'A Zvino shopper will pick your items at {store}.'],
        'preparing' => ['Shopping started', 'Your shopper is picking your items at {store}.'],
        'picked_up' => ['On the way', 'Shopping done! Your order is on its way.'],
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
        $batch = null;
        if ($data['fulfilment'] === 'delivery' && isset($data['address_id']) && ($addr = Address::find($data['address_id']))
            && ($batch = \App\Models\Zone::batchFor($addr->lat, $addr->lng))) {
            $slot = $batch->batchSlot($vendor, $scheduledFor);
            if (! $slot) {
                throw ValidationException::withMessages(['address_id' => "No {$batch->name} run is scheduled. Please try again later."]);
            }
            $scheduledFor = $slot['arrives_at'];
        }
        $this->assertCanOrder($vendor, $data['fulfilment'], $scheduledFor, $data['payment_method'], (bool) $batch);

        foreach ($cart->items as $ci) {
            if (! $ci->item?->isOrderable()) {
                throw ValidationException::withMessages(['cart' => "{$ci->item?->name} is no longer available. Please remove it."]);
            }
        }

        $address = isset($data['address_id']) ? Address::find($data['address_id']) : null;
        $dest = $address ? ['lat' => $address->lat, 'lng' => $address->lng] : [];
        $pref = $vendor->is_shopper_store ? ($data['substitution_pref'] ?? 'best') : null;
        $t = $this->carts->totals($cart, $data['fulfilment'], $dest, (float) ($data['tip'] ?? 0), $pref);

        if ($t['subtotal'] < max($vendor->min_order_zig, $vendor->zone?->min_order_zig ?? 0)) {
            throw ValidationException::withMessages(['cart' => "Minimum order for {$vendor->name} is ZiG {$vendor->min_order_zig}."]);
        }
        // Charity round-up (#38): the change goes to the partner charity, outside VAT and fees.
        $t['donation'] = ! empty($data['round_up']) ? self::roundUpAmount($t['total']) : 0.0;
        $t['total'] = round($t['total'] + $t['donation'], 2);

        // Split tender (#13): wallet balance first, the rest by the chosen method.
        $t['wallet_applied'] = 0.0;
        if (! empty($data['use_wallet']) && $data['payment_method'] !== 'wallet' && Setting::get('payments.split_tender') && Setting::get('payments.wallet')) {
            $t['wallet_applied'] = round(min(max(0, $user->walletBalance()), $t['total']), 2);
            if ($t['wallet_applied'] >= $t['total']) {
                $data['payment_method'] = 'wallet';
                $t['wallet_applied'] = 0.0;
            }
        }
        $due = round($t['total'] - $t['wallet_applied'], 2);

        // Pharmacy (#30): prescription medicines need a photo the pharmacist checks before accepting.
        if (Setting::get('orders.prescriptions_required') && $cart->items->contains(fn ($ci) => $ci->item?->requires_prescription)) {
            $path = PrescriptionStore::resolve($data['prescription'] ?? null, $user);
            if (! $path) {
                throw ValidationException::withMessages(['prescription' => 'Please add a photo of your prescription.']);
            }
            $data['prescription_path'] = $path;
        }

        // Split the bill (#13): each friend gets their own EcoCash/OneMoney/InnBucks prompt.
        $shares = collect($data['split_with'] ?? [])->filter(fn ($s) => ($s['amount'] ?? 0) > 0)->values();
        if ($shares->isNotEmpty()) {
            if (! Setting::get('orders.split_bill') || ! in_array($data['payment_method'], ['ecocash', 'onemoney', 'innbucks'], true)) {
                throw ValidationException::withMessages(['split_with' => 'Splitting the bill works with EcoCash, OneMoney or InnBucks.']);
            }
            if ($shares->count() > Setting::get('orders.split_bill_max_people')) {
                throw ValidationException::withMessages(['split_with' => 'You can split with up to '.Setting::get('orders.split_bill_max_people').' friends.']);
            }
            if (round($shares->sum('amount'), 2) >= $due) {
                throw ValidationException::withMessages(['split_with' => 'Your friends’ shares must leave something for you to pay.']);
            }
            $data['split_with'] = $shares->map(fn ($s) => ['phone' => $s['phone'], 'name' => $s['name'] ?? null, 'amount' => round((float) $s['amount'], 2)])->all();
        }

        // Split tender, cash + mobile money: e.g. USD notes to the driver, the balance by EcoCash.
        $t['cash_part'] = 0.0;
        if (($data['cash_part'] ?? 0) > 0 && Setting::get('payments.split_tender') && Setting::get('payments.cash')
            && $data['fulfilment'] === 'delivery' && in_array($data['payment_method'], ['ecocash', 'onemoney', 'innbucks', 'card'], true)) {
            $t['cash_part'] = round(min((float) $data['cash_part'], $due), 2);
            if ($t['cash_part'] >= $due) {
                throw ValidationException::withMessages(['cash_part' => 'To pay everything in cash, choose Cash on delivery.']);
            }
            if ($t['cash_part'] > Setting::get('delivery.cash_on_delivery_limit_zig')) {
                throw ValidationException::withMessages(['cash_part' => 'The cash part is limited to ZiG '.Setting::get('delivery.cash_on_delivery_limit_zig').'.']);
            }
            app(RiskService::class)->assertCanPlace($user, 'cash', $t['cash_part']);
        }

        app(RiskService::class)->assertCanPlace($user, $data['payment_method'], $due);
        if ($data['payment_method'] === 'company') {
            [$t['wallet_applied'], $t['cash_part'], $due] = [0.0, 0.0, $t['total']]; // the company pays the whole order
        }
        $companyMember = $data['payment_method'] === 'company' ? app(CompanyService::class)->assertCanCharge($user, $due) : null;
        if ($data['payment_method'] === 'wallet' && $user->walletBalance() < $t['total']) {
            throw ValidationException::withMessages(['payment_method' => 'Insufficient wallet balance.']);
        }
        if ($data['payment_method'] === 'cash' && $due > Setting::get('delivery.cash_on_delivery_limit_zig')) {
            throw ValidationException::withMessages(['payment_method' => 'Cash on delivery is limited to ZiG '.Setting::get('delivery.cash_on_delivery_limit_zig').'. Please choose another method.']);
        }

        [$order, $payment] = DB::transaction(function () use ($user, $cart, $vendor, $t, $data, $scheduledFor, $companyMember) {
            $rate = ExchangeRate::current();
            $commissionPct = $data['fulfilment'] === 'pickup' ? Setting::get('fees.pickup_commission_pct') : $vendor->commission_pct;

            $order = Order::create([
                'user_id' => $user->id,
                'company_id' => $companyMember?->company_id,
                'vendor_id' => $vendor->id,
                'zone_id' => $t['zone_id'],
                'address_id' => $data['address_id'] ?? null,
                'promo_code_id' => $t['discount'] > 0 ? $t['promo_id'] : null,
                'group_order_id' => $data['group_order_id'] ?? null,
                'source' => $data['source'] ?? 'app',
                'fulfilment' => $data['fulfilment'],
                'dropoff' => $data['dropoff'] ?? 'hand_to_me',
                'no_cutlery' => (bool) ($data['no_cutlery'] ?? false),
                'substitution_pref' => $vendor->is_shopper_store ? ($data['substitution_pref'] ?? 'best') : null,
                'payment_method' => $data['payment_method'],
                'notes' => $data['notes'] ?? null,
                'prescription_path' => $data['prescription_path'] ?? null,
                'scheduled_for' => $scheduledFor,
                'subtotal_zig' => $t['subtotal'],
                'delivery_fee_zig' => $t['delivery'],
                'service_fee_zig' => $t['service'],
                'small_order_fee_zig' => $t['small_order'],
                'discount_zig' => $t['discount'],
                'tip_zig' => $t['tip'],
                'vat_zig' => $t['vat'],
                'total_zig' => $t['total'],
                'wallet_applied_zig' => $t['wallet_applied'],
                'cash_part_zig' => $t['cash_part'],
                'donation_zig' => $t['donation'],
                'substitution_buffer_zig' => $t['buffer'] ?? 0,
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
                    'name' => $ci->item->name.(($w = $ci->item->weightLabel($ci->quantity)) ? " ($w)" : ''),
                    'quantity' => $ci->quantity,
                    'options' => $ci->options,
                    'unit_price_zig' => $ci->unit_price_zig,
                    'line_total_zig' => $ci->unit_price_zig * $ci->quantity,
                    'notes' => $ci->notes,
                    // Customer's chosen substitute (Zvino-run stores) and the buffer paid for it.
                    'substitute' => $ci->substitute && $order->substitution_pref !== 'refund' ? ['item_id' => $ci->substitute->id, 'name' => $ci->substitute->name, 'image' => $ci->substitute->image_path, 'unit_price_zig' => CartService::itemPrice($ci->substitute)] : null,
                    'buffer_zig' => $ci->substitute && ($t['buffer'] ?? 0) > 0 ? round(max(0, CartService::itemPrice($ci->substitute) - (float) $ci->unit_price_zig) * $ci->quantity, 2) ?: null : null,
                ]);
            }

            if ($order->promo_code_id) {
                \App\Models\PromoCode::whereKey($order->promo_code_id)->increment('used_count');
            }
            $cart->items()->delete();
            $cart->update(['promo_code_id' => null, 'vendor_id' => null]);

            return [$order, $this->startPayment($order, $data['payment_method'], $data['phone'] ?? $user->phone, $data['split_with'] ?? [])];
        });

        if ($this->paynow->fake()) {
            // Simulated gateway: every pending prompt (host and friends) is approved.
            $order->payments()->where('provider', 'paynow')->where('status', 'pending')->get()->each(fn ($p) => $this->markPaid($p));
        }

        return [$order->fresh(['items', 'vendor']), $payment->fresh()];
    }

    public function assertCanOrder(Vendor $vendor, string $fulfilment, ?Carbon $scheduledFor, string $method, bool $batchRun = false): void
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

        if ($scheduledFor && $batchRun) {
            // Batch run slot was chosen by Zvino; the store just needs to be open to prepare it.
            if (! $this->availability->isOpen($vendor, $scheduledFor->copy()->subMinutes(45))) {
                throw ValidationException::withMessages(['scheduled_for' => "{$vendor->name} is closed for the next run."]);
            }

            return;
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

            $payment = Payment::create(['order_id' => $order->id, 'provider' => 'paynow', 'method' => $method, 'phone' => $phone, 'amount_zig' => $subtotal]
                + ($method === 'qr' ? ['raw' => ['reference' => $order->reference.'-QR']] : []));
            $order->update(['payment_status' => 'pending']);
            $this->paynow->initiate($payment);
            OrderUpdated::dispatch($order);

            return [$order->load('items'), $payment];
        });
    }

    /** Amount that rounds $total up to the next multiple of the configured step (0 if already round). */
    public static function roundUpAmount(float $total): float
    {
        if (! Setting::get('orders.charity_round_up') || $total <= 0) {
            return 0.0;
        }
        $step = max(1, (int) Setting::get('orders.charity_round_to_zig'));

        return round(ceil(round($total, 2) / $step) * $step - $total, 2);
    }

    private function startPayment(Order $order, string $method, ?string $phone, array $shares = []): Payment
    {
        foreach ($shares as $i => $s) {
            $share = Payment::create([
                'order_id' => $order->id, 'provider' => 'paynow', 'method' => $method, 'phone' => $s['phone'], 'amount_zig' => $s['amount'],
                'raw' => ['split_share' => true, 'name' => $s['name'], 'reference' => $order->reference.'-S'.($i + 1)],
            ]);
            $this->paynow->initiate($share);
        }

        if ($order->wallet_applied_zig > 0) {
            $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'debit', 'amount_zig' => $order->wallet_applied_zig, 'reason' => 'Order '.$order->reference.' (part)']);
            Payment::create(['order_id' => $order->id, 'provider' => 'wallet', 'method' => 'wallet', 'amount_zig' => $order->wallet_applied_zig, 'status' => 'paid']);
        }
        if ($order->cash_part_zig > 0) {
            Payment::create(['order_id' => $order->id, 'provider' => 'cash', 'method' => 'cash', 'amount_zig' => $order->cash_part_zig, 'status' => 'pending']);
        }

        $payment = Payment::create([
            'order_id' => $order->id,
            'provider' => match ($method) { 'wallet' => 'wallet', 'cash' => 'cash', default => 'paynow' },
            'method' => $method,
            'phone' => $phone,
            'amount_zig' => round($order->total_zig - $order->wallet_applied_zig - $order->cash_part_zig - collect($shares)->sum('amount'), 2),
        ]);

        if ($method === 'company') {
            $payment->update(['provider' => 'company', 'status' => 'paid']);
            $order->update(['payment_status' => 'paid']);
            $this->release($order);
        } elseif ($method === 'wallet') {
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
        // Split bill: the order only goes to the store once every share is in.
        if ($order->payments()->where('provider', 'paynow')->whereNotIn('status', ['paid', 'cancelled'])->exists()) {
            $order->update(['payment_status' => 'partially_paid']);
            OrderUpdated::dispatch($order);

            return;
        }
        $order->update(['payment_status' => $order->cash_part_zig > 0 ? 'pending_cash' : 'paid']);

        $order->status === 'pending_payment' ? $this->release($order) : OrderUpdated::dispatch($order);
    }

    public function markFailed(Payment $payment, string $status = 'failed'): void
    {
        $payment->update(['status' => $status]);
        if (($payment->raw['split_share'] ?? false) && $payment->order?->user) {
            // A friend declined: the host can resend the prompt or pay that share themselves.
            $who = $payment->raw['name'] ?? $payment->phone;
            $this->push->toUser($payment->order->user, 'split_declined', "{$who}’s share wasn’t paid", 'Resend their prompt or pay it yourself from the order screen.', ['order_id' => $payment->order_id]);

            return;
        }
        if ($payment->order) {
            $payment->order->update(['payment_status' => 'failed']);
            OrderUpdated::dispatch($payment->order);
        }
    }

    // ── Store actions ────────────────────────────────────────────────

    public function accept(Order $order, int $prepMinutes): Order
    {
        $this->guard($order, 'accepted');
        $order->update(['prep_minutes' => $prepMinutes, 'accepted_at' => now()]);
        // First real estimate: prep time + road distance to the customer. Also the time we promise.
        \App\Support\DeliveryEta::refresh($order, promise: true);

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
        if (! $order->user) {
            return;
        }
        // Only what was actually paid comes back (cash not yet handed over is simply not collected).
        $order->payments()->where('method', 'cash')->where('status', 'pending')->update(['status' => 'cancelled']);
        if ($order->refunded_zig > 0) {
            return;
        }
        if ($order->payment_method === 'company') {
            $order->payments()->where('provider', 'company')->update(['status' => 'cancelled']);
            $order->update(['payment_status' => 'refunded', 'refunded_zig' => $order->total_zig]);

            return;
        }
        $paidPayments = $order->payments()->where('status', 'paid')->get();
        $shares = $paidPayments->filter(fn ($p) => $p->raw['split_share'] ?? false);
        $own = $paidPayments->isEmpty() && $order->payment_status === 'paid'
            ? $order->total_zig
            : round($paidPayments->sum('amount_zig') - $shares->sum('amount_zig'), 2);

        // Host's money: instant wallet credit. Friends' split shares: reversed to their own phones by ops (Refunds).
        if ($own > 0) {
            $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $own, 'reason' => $reason]);
            $order->refunds()->create(['amount_zig' => $own, 'destination' => 'wallet', 'status' => 'paid', 'reason' => $reason]);
        }
        foreach ($shares as $share) {
            $order->refunds()->create(['amount_zig' => $share->amount_zig, 'destination' => 'original', 'status' => 'approved', 'reason' => "$reason (split share, return to {$share->phone})"]);
        }
        $total = round($own + $shares->sum('amount_zig'), 2);
        if ($total > 0) {
            $order->update(['payment_status' => 'refunded', 'refunded_zig' => $total]);
        }
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

        // Things moved on (food ready early, driver collected…): recalculate the delivery time.
        if (in_array($status, ['ready', 'picked_up', 'arriving'], true)) {
            \App\Support\DeliveryEta::refresh($order);
        }

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

        $shopperStore = (bool) $order->vendor?->is_shopper_store && $order->fulfilment === 'delivery';
        if ($order->user && isset(self::STATUS_MESSAGES[$status]) && ! ($shopperStore && $status === 'ready')) {
            [$title, $body] = $shopperStore && isset(self::SHOPPER_MESSAGES[$status]) ? self::SHOPPER_MESSAGES[$status] : self::STATUS_MESSAGES[$status];
            $locale = $order->user->locale ?? 'en';
            $title = I18n::t($title, $locale);
            $body = I18n::t($body, $locale, [
                'store' => $order->vendor->name,
                'prep' => $vars['prep'] ?? $order->prep_minutes,
                'time' => $order->scheduled_for?->format('D H:i'),
            ]);
            $tell = function () use ($order, $status, $title, $body) {
                $this->push->toUser($order->user, 'order_status', $title, $body, ['order_id' => $order->id, 'status' => $status]);
                app(OrderMailer::class)->statusChanged($order, $status);

                // SMS fallback (#45): customers with no app installed still hear about the key moments.
                if (Setting::get('orders.sms_fallback') && $order->user->phone && in_array($status, ['accepted', 'picked_up', 'delivered', 'rejected', 'cancelled'], true)
                    && ! $order->user->deviceTokens()->exists()) {
                    app(SmsService::class)->send($order->user->phone, "Zvino {$order->reference}: {$title}. {$body}");
                }
            };
            self::$notifyAfterResponse ? \Illuminate\Support\defer($tell) : $tell();
        }

        // Admin panel + kitchen: bell, pop-up and sound.
        $staff = app(StaffNotifier::class);
        $order->loadMissing('vendor', 'items');
        if ($status !== 'placed') {
            // The order has been handled: stop its new-order alarm for everyone.
            \App\Models\AppNotification::where('type', 'new_order')->whereNull('read_at')->where('data->order_id', $order->id)->update(['read_at' => now()]);
        }
        if ($status === 'placed') {
            $items = $order->items->sum('quantity');
            $staff->notify('new_order', "New order #{$order->reference}", "{$order->vendor->name} · {$items} item".($items === 1 ? '' : 's').' · ZiG '.number_format((float) $order->total_zig, 2).' · '.ucfirst($order->fulfilment),
                "/admin/orders/{$order->id}", $order->vendor_id, ['orders.view', 'kitchen.use'], ['order_id' => $order->id, 'alarm' => true]);
        } elseif (in_array($status, ['cancelled', 'rejected'], true)) {
            $staff->notify('order_problem', "Order #{$order->reference} ".($status === 'rejected' ? 'declined' : 'cancelled'), $order->vendor->name.($order->cancel_reason ? ' · '.$order->cancel_reason : ''),
                "/admin/orders/{$order->id}", $order->vendor_id, ['orders.view', 'kitchen.use'], ['order_id' => $order->id]);
        }

        return $order;
    }

    /** Hot-meal guarantee (#12): late delivery → automatic wallet credit, once per order. */
    private function hotMealGuarantee(Order $order): void
    {
        // Judged against the time we promised, not the live estimate (which moves as things happen).
        $promised = $order->promised_delivery_at ?? $order->estimated_delivery_at;
        if (! Setting::get('orders.hot_meal_guarantee') || ! $order->user || ! $promised || $order->fulfilment !== 'delivery') {
            return;
        }
        $late = (int) $promised->diffInMinutes($order->delivered_at ?? now(), false);
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

    /** Unpaid checkouts older than 30 minutes are abandoned (any wallet part of a split payment goes back). */
    public function expireUnpaid(): int
    {
        $stale = Order::where('status', 'pending_payment')->where('created_at', '<', now()->subMinutes(30))->get();
        foreach ($stale as $order) {
            $order->update(['status' => 'cancelled', 'cancelled_by' => 'system', 'cancel_reason' => 'Payment not completed', 'cancelled_at' => now()]);
            $this->refundInFull($order, 'Returned: payment not completed');
        }

        return $stale->count();
    }
}

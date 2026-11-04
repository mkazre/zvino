<?php

namespace App\Services;

use App\Models\Item;
use App\Models\Order;
use App\Models\RecurringOrder;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Places recurring orders ahead of time and reminds customers before the month-end shop. */
class RecurringOrderService
{
    /** Orders go to the store as scheduled orders this many minutes before the delivery time. */
    public const LEAD_MINUTES = 120;

    public function __construct(private CartService $carts, private OrderService $orders, private PushService $push) {}

    public function run(): int
    {
        if (! Setting::get('orders.recurring_orders')) {
            return 0;
        }
        $this->remind();

        $placed = 0;
        $due = RecurringOrder::with('user', 'vendor')->where('is_active', true)
            ->whereNotNull('next_run_at')->where('next_run_at', '<=', now()->addMinutes(self::LEAD_MINUTES))->get();

        foreach ($due as $plan) {
            $deliverAt = $plan->next_run_at->copy();
            try {
                $order = $this->place($plan, $deliverAt);
                $plan->update(['last_order_id' => $order->id, 'last_error' => null]);
                $placed++;
            } catch (ValidationException $e) {
                $msg = collect($e->errors())->flatten()->first();
                $plan->update(['last_error' => $msg]);
                $this->push->toUser($plan->user, 'plan_failed', "{$plan->name} wasn’t placed", $msg, ['plan_id' => $plan->id]);
            }
            $plan->kind === 'once'
                ? $plan->update(['next_run_at' => null, 'is_active' => false])
                : $plan->update(['next_run_at' => $plan->computeNext($deliverAt), 'reminded_for' => null]);
        }

        return $placed;
    }

    /**
     * Uses the normal checkout so every rule applies (hours, fees, fraud, payment). The customer's live
     * basket is set aside and restored afterwards.
     */
    public function place(RecurringOrder $plan, $deliverAt): Order
    {
        $user = $plan->user;
        $cart = $this->carts->for($user);
        $saved = $cart->items->map(fn ($i) => $i->only('item_id', 'quantity', 'options', 'unit_price_zig', 'notes'))->all();
        $savedVendor = $cart->vendor_id;
        $savedPromo = $cart->promo_code_id;

        try {
            return DB::transaction(function () use ($plan, $user, $cart, $deliverAt) {
                $cart->items()->delete();
                $items = Item::where('vendor_id', $plan->vendor_id)->whereIn('id', collect($plan->lines)->pluck('item_id'))->get()->keyBy('id');
                foreach ($plan->lines as $l) {
                    if ($item = $items->get($l['item_id'])) {
                        $this->carts->add($user, $item, (int) $l['quantity'], $l['variant'] ?? null, $l['modifiers'] ?? [], $l['notes'] ?? null, true);
                    }
                }

                $method = $plan->payment_method === 'wallet' && $user->walletBalance() <= 0 && $plan->phone ? 'ecocash' : $plan->payment_method;
                [$order] = $this->orders->placeFromCart($user, [
                    'fulfilment' => $plan->fulfilment,
                    'address_id' => $plan->fulfilment === 'delivery' ? $plan->address_id : null,
                    'payment_method' => $method,
                    'phone' => $plan->phone ?? $user->phone,
                    'notes' => trim(($plan->notes ?? '')."\n[{$plan->name}]".($plan->recipient_name ? "\nDeliver to {$plan->recipient_name} {$plan->recipient_phone}".($plan->gift_message ? "\nCard: “{$plan->gift_message}”" : '') : '')),
                    // Far enough ahead → a normal scheduled order; if the scheduler ran late, send it now.
                    'scheduled_for' => $deliverAt->gt(now()->addMinutes(35)) ? $deliverAt->toDateTimeString() : null,
                    'use_wallet' => $method !== 'wallet',
                    'source' => 'plan',
                ]);
                $order->update(['recurring_order_id' => $plan->id]);
                if ($plan->recipient_phone) {
                    app(SmsService::class)->send($plan->recipient_phone, "Zvino: {$user->name} is sending you a {$plan->name}. It arrives ".($order->scheduled_for ?? now())->format('D j M H:i').'. Order '.$order->reference);
                }

                return $order;
            });
        } finally {
            $cart = $this->carts->for($user);
            $cart->items()->delete();
            foreach ($saved as $row) {
                $cart->items()->create($row);
            }
            $cart->update(['vendor_id' => $savedVendor, 'promo_code_id' => $savedPromo]);
        }
    }

    /** Month-end shop: a nudge the day before so the list can be changed in time. */
    private function remind(): void
    {
        RecurringOrder::with('user')->where('is_active', true)->where('kind', 'monthly')
            ->whereBetween('next_run_at', [now(), now()->addDay()])
            ->where(fn ($q) => $q->whereNull('reminded_for')->orWhereColumn('reminded_for', '!=', 'next_run_at'))
            ->get()->each(function (RecurringOrder $plan) {
                $this->push->toUser($plan->user, 'plan_reminder', "{$plan->name} is tomorrow 🛒",
                    'Your month-end shop goes out '.$plan->next_run_at->format('D H:i').'. Tap to change the list or skip this month.', ['plan_id' => $plan->id]);
                $plan->update(['reminded_for' => $plan->next_run_at]);
            });
    }
}

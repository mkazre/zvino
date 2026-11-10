<?php

namespace App\Services;

use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Zvino-run stores (e.g. TM Pick n Pay): the driver shops the order in the store.
 *   start()   - at the store, the driver starts shopping (order → "preparing" = "Shopping")
 *   mark()    - each item: found (all or some), replaced with something similar, or not available
 *   finish()  - till total + slip photo: missing/cheaper items are refunded to the customer's
 *               wallet, the driver is reimbursed if they paid with their own money, and the
 *               order is collected (on its way).
 * Customers are never charged more: a dearer replacement is covered by Zvino.
 */
class ShopperService
{
    public function __construct(private OrderService $orders, private PushService $push) {}

    public static function isShopperOrder(Order $order): bool
    {
        return (bool) $order->vendor?->is_shopper_store;
    }

    public function start(Order $order): Order
    {
        $this->guard($order);
        if (! $order->shopping_started_at) {
            $order->update(['shopping_started_at' => now()]);
        }
        if ($order->status === 'accepted') {
            $order = $this->orders->setStatus($order, 'preparing');
        }

        return $order->fresh();
    }

    /** @param array{status: string, found_qty?: int, replacement_item_id?: int, replacement_qty?: int} $data */
    public function mark(Order $order, OrderItem $line, array $data): OrderItem
    {
        $this->guard($order);
        abort_unless($line->order_id === $order->id, 404);
        if (! $order->shopping_started_at) {
            $this->start($order);
        }
        $status = $data['status'];
        $update = ['shop_status' => $status, 'found_qty' => null, 'replacement' => null, 'refund_zig' => 0, 'shopped_at' => now()];

        if ($status === 'found') {
            $update['found_qty'] = $line->quantity;
        } elseif ($status === 'partial') {
            $qty = (int) ($data['found_qty'] ?? 0);
            if ($qty < 1 || $qty >= $line->quantity) {
                throw ValidationException::withMessages(['found_qty' => 'Enter how many you found (less than '.$line->quantity.').']);
            }
            $update['found_qty'] = $qty;
            $update['refund_zig'] = round(($line->quantity - $qty) * $line->unit_price_zig, 2);
        } elseif ($status === 'missing') {
            $update['found_qty'] = 0;
            $update['refund_zig'] = $line->line_total_zig;
        } elseif ($status === 'replaced') {
            if ($order->substitution_pref === 'refund') {
                throw ValidationException::withMessages(['status' => 'This customer asked for refunds, not replacements.']);
            }
            $item = Item::where('vendor_id', $order->vendor_id)->where('is_available', true)->findOrFail($data['replacement_item_id'] ?? 0);
            $qty = max(1, (int) ($data['replacement_qty'] ?? $line->quantity));
            $unit = (float) ($item->special_price_zig ?: $item->price_zig);
            $total = round($unit * $qty, 2);
            $cap = round($line->line_total_zig * ((int) Setting::get('delivery.shopper_max_replacement_pct') ?: 120) / 100, 2);
            if ($total > $cap) {
                throw ValidationException::withMessages(['replacement_item_id' => 'That replacement costs too much more than the original. Choose a cheaper one or mark it not available.']);
            }
            $update['found_qty'] = 0;
            $update['replacement'] = ['item_id' => $item->id, 'name' => $item->name, 'quantity' => $qty, 'unit_price_zig' => $unit, 'line_total_zig' => $total, 'image' => $item->image_path];
            $update['refund_zig'] = max(0, round($line->line_total_zig - $total, 2)); // cheaper: refund the difference; dearer: Zvino covers it
        }
        $line->update($update);

        // Tell the customer about anything that isn't exactly what they ordered.
        if ($order->user && in_array($status, ['missing', 'replaced', 'partial'], true)) {
            $body = match ($status) {
                'missing' => "{$line->name} isn’t available. You’ll get ".self::money($line->line_total_zig).' back.',
                'partial' => "Only {$update['found_qty']} of {$line->quantity} × {$line->name} available. The rest is refunded.",
                default => "{$line->name} was out, so your shopper chose {$update['replacement']['name']}.",
            };
            $this->push->toUser($order->user, 'order_status', 'Update from your shopper', $body, ['order_id' => $order->id, 'status' => 'shopping']);
        }
        \App\Events\OrderUpdated::dispatch($order);

        return $line->fresh();
    }

    /** Done shopping: refunds, reimbursement, till record; the order is on its way. */
    public function finish(Order $order, array $data, ?string $slipPath): Order
    {
        $this->guard($order);
        $order->loadMissing('items');
        $open = $order->items->whereNull('shop_status');
        if ($open->isNotEmpty()) {
            throw ValidationException::withMessages(['items' => $open->count().' item(s) still to tick off: '.$open->pluck('name')->take(3)->implode(', ')]);
        }
        if ($order->items->every(fn ($i) => $i->shop_status === 'missing')) {
            throw ValidationException::withMessages(['items' => 'Nothing was found. Call support to cancel this order instead.']);
        }

        return DB::transaction(function () use ($order, $data, $slipPath) {
            $order = Order::lockForUpdate()->findOrFail($order->id);
            if ($order->shopping_finished_at) {
                return $order; // already done (double tap)
            }
            $refund = round((float) $order->items()->sum('refund_zig'), 2);
            $order->update([
                'shopping_finished_at' => now(), 'till_total_usd' => $data['till_total_usd'], 'till_slip_path' => $slipPath,
                'till_paid_with' => $data['paid_with'], 'shopping_refund_zig' => $refund,
            ]);
            if ($refund > 0 && $order->user) {
                $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $refund, 'reason' => "Items not available on order {$order->reference}"]);
                $order->update(['refunded_zig' => round((float) $order->refunded_zig + $refund, 2)]);
            }
            if ($data['paid_with'] === 'own_cash' && $order->driver) {
                $zig = round($data['till_total_usd'] * ExchangeRate::current(), 2);
                $order->driver->ledger()->create(['order_id' => $order->id, 'type' => 'adjustment', 'amount_zig' => $zig, 'description' => "Shopping paid at the till for {$order->reference} (\$".number_format($data['till_total_usd'], 2).')']);
            }
            if (in_array($order->status, ['accepted', 'preparing'], true)) {
                $order = $this->orders->setStatus($order, 'ready');
            }
            $order = $this->orders->setStatus($order->fresh(), 'picked_up');
            if ($refund > 0 && $order->user) {
                $this->push->toUser($order->user, 'order_status', 'Your refund', self::money($refund).' for unavailable items is in your Zvino wallet.', ['order_id' => $order->id]);
            }

            return $order->fresh();
        });
    }

    /** Expected till amount in USD from the shelf prices (for the driver and for checking slips). */
    public static function expectedTillUsd(Order $order): float
    {
        $order->loadMissing('items.item');
        $rate = (float) ($order->zig_per_usd ?: ExchangeRate::current());

        return round($order->items->sum(function (OrderItem $l) use ($rate) {
            if ($l->shop_status === 'missing') {
                return 0;
            }
            if ($l->shop_status === 'replaced' && $l->replacement) {
                $cost = Item::find($l->replacement['item_id'])?->cost_usd;

                return ($cost ?? $l->replacement['line_total_zig'] / $rate / $l->replacement['quantity']) * $l->replacement['quantity'];
            }
            $qty = $l->shop_status === 'partial' ? (int) $l->found_qty : $l->quantity;

            return ($l->item?->cost_usd ?? $l->unit_price_zig / $rate) * $qty;
        }), 2);
    }

    private function guard(Order $order): void
    {
        abort_unless(self::isShopperOrder($order), 422, 'This order isn’t a shopping order.');
        abort_unless(in_array($order->status, ['accepted', 'preparing', 'ready'], true), 422, 'This order can’t be shopped any more.');
    }

    private static function money(float $zig): string
    {
        return 'ZiG '.number_format($zig, 2);
    }
}

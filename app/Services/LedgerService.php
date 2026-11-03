<?php

namespace App\Services;

use App\Models\LedgerEntry;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Records what Zvino owes stores and drivers (and what they owe Zvino, e.g. cash held).
 * Positive amount = owed to the account.
 */
class LedgerService
{
    public function settleDelivered(Order $order): void
    {
        if (LedgerEntry::where('order_id', $order->id)->exists()) {
            return; // idempotent
        }

        DB::transaction(function () use ($order) {
            $vendor = $order->vendor;

            // Store: food subtotal, minus commission, minus store-funded promos.
            $storeFundedDiscount = $order->promo_code_id && $order->promoCode?->vendor_id === $vendor->id ? $order->discount_zig : 0;
            $vendorPayout = round($order->subtotal_zig - $order->commission_zig - $storeFundedDiscount, 2);
            $order->update(['vendor_payout_zig' => $vendorPayout]);

            $this->entry($vendor, $order, 'earning', $order->subtotal_zig, "Sales {$order->reference}");
            $this->entry($vendor, $order, 'commission', -$order->commission_zig, "Commission {$order->reference}");
            if ($storeFundedDiscount > 0) {
                $this->entry($vendor, $order, 'adjustment', -$storeFundedDiscount, "Store promo {$order->reference}");
            }

            // Driver: trip pay + tip. Cash orders: the driver is holding Zvino's money.
            if ($driver = $order->driver) {
                $this->entry($driver, $order, 'earning', $order->driver_pay_zig, "Delivery {$order->reference}");
                if ($order->tip_zig > 0) {
                    $tipShare = round($order->tip_zig * \App\Models\Setting::get('delivery.driver_keeps_tips_pct') / 100, 2);
                    $this->entry($driver, $order, 'tip', $tipShare, "Tip {$order->reference}");
                }
                if ($order->payment_method === 'cash') {
                    $this->entry($driver, $order, 'cash_collected', -$order->total_zig, "Cash collected {$order->reference}");
                }
                $driver->increment('completed_deliveries');
            }
        });
    }

    public function refund(Order $order, float $amount, string $reason): void
    {
        // Refunds come out of the store's share pro-rata to food value.
        if ($order->subtotal_zig > 0 && $order->vendor_payout_zig > 0) {
            $share = round(min($amount, $order->subtotal_zig) / $order->subtotal_zig * $order->vendor_payout_zig, 2);
            $this->entry($order->vendor, $order, 'refund', -$share, "Refund {$order->reference}: {$reason}");
        }
    }

    private function entry($account, Order $order, string $type, float $amount, string $description): void
    {
        if (round($amount, 2) == 0.0) {
            return;
        }
        $account->ledger()->create(['order_id' => $order->id, 'type' => $type, 'amount_zig' => round($amount, 2), 'description' => $description]);
    }
}

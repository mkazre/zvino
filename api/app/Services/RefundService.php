<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Refund;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class RefundService
{
    public function __construct(private LedgerService $ledger, private PushService $push) {}

    public function approve(Refund $refund, ?User $by, ?float $amount = null): Refund
    {
        return DB::transaction(function () use ($refund, $by, $amount) {
            $refund = Refund::lockForUpdate()->findOrFail($refund->id);
            abort_unless($refund->status === 'requested', 422, 'This refund has already been processed.');

            $order = $refund->order;
            $amount = round(min($amount ?? $refund->amount_zig, $order->total_zig - $order->refunded_zig), 2);

            if ($order->payment_method === 'company') {
                $status = 'paid'; // credited against the company's invoice, not the employee
            } elseif ($refund->destination === 'wallet' && $order->user) {
                $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $amount, 'reason' => "Refund {$order->reference}"]);
                $status = 'paid';
            } else {
                $status = 'approved'; // ops reverses on Paynow/EcoCash, then marks paid
            }

            $refund->update(['amount_zig' => $amount, 'status' => $status, 'processed_by' => $by?->id]);
            $order->update([
                'refunded_zig' => $order->refunded_zig + $amount,
                'payment_status' => $order->refunded_zig + $amount >= $order->total_zig ? 'refunded' : 'partially_refunded',
            ]);
            $this->ledger->refund($order, $amount, $refund->reason);
            AuditLog::record('refund.approved', $refund, ['amount_zig' => $amount]);

            if ($order->user) {
                $this->push->toUser($order->user, 'refund', 'Refund approved', 'ZiG '.number_format($amount, 2).' has been '.($status === 'paid' ? 'added to your Zvino wallet.' : 'approved and is on its way.'), ['order_id' => $order->id]);
            }

            return $refund->fresh();
        });
    }

    public function reject(Refund $refund, User $by, string $note): Refund
    {
        abort_unless($refund->status === 'requested', 422, 'This refund has already been processed.');
        $refund->update(['status' => 'rejected', 'processed_by' => $by->id, 'note' => $note]);
        AuditLog::record('refund.rejected', $refund, ['note' => $note]);

        return $refund;
    }
}

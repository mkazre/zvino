<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\CateringRequest;
use App\Models\Payment;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\Payments\PaynowGateway;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Funeral & gathering catering (#9).
 *   requested → quoted (store sets the price) → deposit_paid → paid → completed
 *   any open state → declined (store) / cancelled (customer; deposit refunded to wallet per policy)
 */
class CateringService
{
    public function __construct(private PushService $push, private PaynowGateway $paynow) {}

    public function request(User $user, Vendor $vendor, array $data): CateringRequest
    {
        if (! Setting::get('orders.catering') || ! $vendor->accepts_catering) {
            throw ValidationException::withMessages(['vendor_id' => "{$vendor->name} doesn’t take catering orders."]);
        }
        $eventAt = Carbon::parse($data['event_at']);
        // Funerals often come at short notice, so they get a shorter minimum.
        $notice = (int) Setting::get($data['event_type'] === 'funeral' ? 'orders.catering_funeral_notice_hours' : 'orders.catering_notice_hours');
        if ($eventAt->lt(now()->addHours($notice))) {
            throw ValidationException::withMessages(['event_at' => "Please give at least {$notice} hours’ notice."]);
        }
        if ($data['headcount'] < Setting::get('orders.catering_min_headcount')) {
            throw ValidationException::withMessages(['headcount' => 'Catering starts at '.Setting::get('orders.catering_min_headcount').' people. For smaller groups use a normal or group order.']);
        }

        $req = CateringRequest::create($data + [
            'user_id' => $user->id, 'vendor_id' => $vendor->id, 'event_at' => $eventAt,
            'deposit_pct' => Setting::get('orders.catering_deposit_pct'),
            'contact_phone' => $data['contact_phone'] ?? $user->phone, 'contact_name' => $data['contact_name'] ?? $user->name,
        ]);
        $vendor->staff()->whereIn('role', ['vendor_manager'])->get()->each(fn ($m) => $this->push->toUser($m, 'catering_request',
            'New catering request 🍲', ucfirst($req->event_type)." for {$req->headcount} on ".$req->event_at->format('D j M H:i').'. Tap to quote.', ['catering_id' => $req->id]));

        return $req;
    }

    public function quote(CateringRequest $req, float $total, ?string $note, ?float $depositPct = null): CateringRequest
    {
        abort_unless(in_array($req->status, ['requested', 'quoted'], true), 422, 'This request can’t be re-quoted now.');
        $req->update(['quote_zig' => round($total, 2), 'quote_note' => $note, 'status' => 'quoted', 'quoted_at' => now()]
            + ($depositPct !== null ? ['deposit_pct' => $depositPct] : []));
        $this->push->toUser($req->user, 'catering_quote', "Your catering quote from {$req->vendor->name}",
            'ZiG '.number_format($req->quote_zig, 2)." for {$req->headcount} people. Pay a ".(int) $req->deposit_pct.'% deposit to confirm.', ['catering_id' => $req->id]);

        return $req->fresh();
    }

    public function pay(CateringRequest $req, string $method, ?string $phone): Payment
    {
        abort_unless(in_array($req->status, ['quoted', 'deposit_paid'], true) && $req->amountDue() > 0, 422, 'Nothing to pay right now.');
        $user = $req->user;
        $amount = $req->amountDue();
        $purpose = $req->status === 'quoted' ? 'catering_deposit' : 'catering_balance';

        if ($method === 'wallet') {
            abort_if($user->walletBalance() < $amount, 422, 'Not enough in your wallet.');
            $user->walletTransactions()->create(['type' => 'debit', 'amount_zig' => $amount, 'reason' => "Catering {$req->reference}"]);
            $payment = Payment::create(['provider' => 'wallet', 'method' => 'wallet', 'amount_zig' => $amount, 'status' => 'paid',
                'payable_type' => $req->getMorphClass(), 'payable_id' => $req->id, 'raw' => ['user_id' => $user->id, 'purpose' => $purpose]]);
            $this->onPaid($payment);

            return $payment;
        }

        $payment = Payment::create(['provider' => 'paynow', 'method' => $method, 'phone' => $phone ?? $user->phone, 'amount_zig' => $amount,
            'payable_type' => $req->getMorphClass(), 'payable_id' => $req->id,
            'raw' => ['user_id' => $user->id, 'purpose' => $purpose, 'reference' => $req->reference.'-'.($purpose === 'catering_deposit' ? 'D' : 'B').now()->timestamp]]);
        $this->paynow->initiate($payment);
        if ($this->paynow->fake()) {
            $payment->update(['status' => 'paid']);
            $this->onPaid($payment->fresh());
        }

        return $payment->fresh();
    }

    public function onPaid(Payment $payment): void
    {
        $req = $payment->payable;
        if (! $req instanceof CateringRequest) {
            return;
        }
        DB::transaction(function () use ($req, $payment) {
            $req->refresh();
            $paid = round($req->paid_zig + $payment->amount_zig, 2);
            $status = $paid >= $req->quote_zig ? 'paid' : ($paid >= $req->depositZig() ? 'deposit_paid' : $req->status);
            $req->update(['paid_zig' => $paid, 'status' => $status]);
        });
        $req->refresh();
        $msg = $req->status === 'paid' ? 'Fully paid. We’ll see you on '.$req->event_at->format('D j M').'.' : 'Deposit received. Your booking is confirmed.';
        $this->push->toUser($req->user, 'catering_paid', "Catering {$req->reference}", $msg, ['catering_id' => $req->id]);
        $req->vendor->staff()->where('role', 'vendor_manager')->get()->each(fn ($m) => $this->push->toUser($m, 'catering_paid',
            "Catering {$req->reference} confirmed", "{$req->headcount} people on ".$req->event_at->format('D j M H:i').' · paid ZiG '.number_format($req->paid_zig, 2), ['catering_id' => $req->id]));
    }

    /** Store delivered the event: what was paid is settled to the store, less commission. */
    public function complete(CateringRequest $req): CateringRequest
    {
        abort_unless(in_array($req->status, ['deposit_paid', 'paid'], true), 422, 'Only confirmed bookings can be completed.');
        DB::transaction(function () use ($req) {
            $commission = round($req->paid_zig * ((float) ($req->vendor->commission_pct ?? Setting::get('fees.default_commission_pct'))) / 100, 2);
            $req->vendor->ledger()->create(['type' => 'earning', 'amount_zig' => $req->paid_zig, 'description' => "Catering {$req->reference}"]);
            $req->vendor->ledger()->create(['type' => 'commission', 'amount_zig' => -$commission, 'description' => "Commission catering {$req->reference}"]);
            $req->update(['status' => 'completed', 'completed_at' => now()]);
        });
        $this->push->toUser($req->user, 'catering_done', 'Thank you for choosing Zvino 🙏', "We hope the {$req->event_type} went well.", ['catering_id' => $req->id]);

        return $req->fresh();
    }

    /** Store declines, or the customer cancels. Money paid goes back to the customer's wallet. */
    public function close(CateringRequest $req, string $by, ?string $reason = null): CateringRequest
    {
        abort_unless(in_array($req->status, ['requested', 'quoted', 'deposit_paid', 'paid'], true), 422, 'This booking is already closed.');
        $refund = $req->paid_zig;
        // Customer cancellations close to the event keep the deposit (food is already bought).
        if ($by === 'customer' && $req->event_at->lt(now()->addHours((int) Setting::get('orders.catering_cancel_hours')))) {
            $refund = max(0, round($req->paid_zig - $req->depositZig(), 2));
        }
        DB::transaction(function () use ($req, $by, $reason, $refund) {
            if ($refund > 0) {
                $req->user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => $refund, 'reason' => "Catering {$req->reference} ".($by === 'store' ? 'declined' : 'cancelled')]);
            }
            $kept = round($req->paid_zig - $refund, 2);
            if ($kept > 0) {
                $req->vendor->ledger()->create(['type' => 'earning', 'amount_zig' => $kept, 'description' => "Catering {$req->reference} late-cancellation deposit"]);
            }
            $req->update(['status' => $by === 'store' ? 'declined' : 'cancelled', 'quote_note' => trim(($req->quote_note ?? '')."\n".($reason ?? ''))]);
        });
        AuditLog::record('catering.closed', $req, ['by' => $by, 'refund' => $refund]);
        $this->push->toUser($req->user, 'catering_closed', "Catering {$req->reference} ".($by === 'store' ? 'declined' : 'cancelled'),
            $refund > 0 ? 'ZiG '.number_format($refund, 2).' is back in your Zvino wallet.' : ($reason ?? ''), ['catering_id' => $req->id]);

        return $req->fresh();
    }

    public function present(CateringRequest $c): array
    {
        return $c->only('id', 'reference', 'event_type', 'event_at', 'headcount', 'location', 'contact_name', 'contact_phone', 'notes', 'status', 'quote_zig', 'quote_note', 'deposit_pct', 'paid_zig', 'created_at') + [
            'vendor' => $c->vendor?->only('id', 'name', 'slug', 'phone'),
            'customer' => $c->user?->only('id', 'name', 'phone'),
            'deposit_zig' => $c->depositZig(),
            'amount_due_zig' => $c->amountDue(),
            'lines' => collect($c->lines ?? [])->map(fn ($l) => $l + ['name' => \App\Models\Item::find($l['item_id'])?->name])->values(),
        ];
    }
}

<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Driver;
use App\Models\LedgerEntry;
use App\Models\Payout;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Batches unpaid ledger entries into payouts for stores and drivers.
 * Ops reviews the batch in Admin → Payouts, sends the money (EcoCash / bank), then marks each paid.
 */
class PayoutService
{
    /** @return int number of payouts created */
    public function generate(?Carbon $until = null): int
    {
        $until ??= now();
        $min = (float) Setting::get('payments.min_payout_zig');
        $created = 0;

        foreach ([Vendor::class, Driver::class] as $type) {
            $morph = (new $type)->getMorphClass();
            $balances = LedgerEntry::where('account_type', $morph)->whereNull('payout_id')->where('created_at', '<=', $until)
                ->selectRaw('account_id, SUM(amount_zig) as total, MIN(created_at) as first_at')->groupBy('account_id')->get();

            foreach ($balances as $row) {
                if ((float) $row->total < $min) {
                    continue; // carries over to the next run
                }
                DB::transaction(function () use ($type, $morph, $row, $until, &$created) {
                    $account = $type::find($row->account_id);
                    $payout = Payout::create([
                        'account_type' => $morph, 'account_id' => $row->account_id,
                        'amount_zig' => round((float) $row->total, 2),
                        'period_start' => Carbon::parse($row->first_at)->toDateString(),
                        'period_end' => $until->toDateString(),
                        'method' => $account?->payout_method ?? 'ecocash',
                    ]);
                    LedgerEntry::where('account_type', $morph)->where('account_id', $row->account_id)
                        ->whereNull('payout_id')->where('created_at', '<=', $until)->update(['payout_id' => $payout->id]);
                    $created++;
                });
            }
        }

        return $created;
    }

    /**
     * Instant cash-out (#27): a driver sweeps their unpaid balance into a same-day payout, less a small fee.
     * Ops sees these flagged "Instant" at the top of Admin → Payouts.
     */
    public function instantCashOut(Driver $driver, ?string $phone = null): Payout
    {
        abort_unless(Setting::get('payments.instant_cashout'), 422, 'Instant cash-out is not available right now.');
        abort_if($driver->cashHeld() > 0, 422, 'Pay in the cash you are holding before cashing out.');

        return DB::transaction(function () use ($driver, $phone) {
            $morph = $driver->getMorphClass();
            $open = LedgerEntry::where('account_type', $morph)->where('account_id', $driver->id)->whereNull('payout_id')->lockForUpdate();
            $total = round((float) (clone $open)->sum('amount_zig'), 2);
            $min = (float) Setting::get('payments.instant_cashout_min_zig');
            abort_if($total < $min, 422, 'You need at least ZiG '.number_format($min, 2).' to cash out.');

            $fee = round($total * Setting::get('payments.instant_cashout_fee_pct') / 100, 2);
            $payout = Payout::create([
                'account_type' => $morph, 'account_id' => $driver->id,
                'amount_zig' => round($total - $fee, 2), 'fee_zig' => $fee,
                'period_start' => Carbon::parse((clone $open)->min('created_at') ?? now())->toDateString(),
                'period_end' => now()->toDateString(),
                'method' => $driver->payout_method ?? 'ecocash', 'is_instant' => true,
            ]);
            $open->update(['payout_id' => $payout->id]);
            if ($fee > 0) {
                $driver->ledger()->create(['type' => 'adjustment', 'amount_zig' => -$fee, 'description' => 'Instant cash-out fee', 'payout_id' => $payout->id]);
            }
            if ($phone) {
                $driver->update(['payout_details' => array_merge($driver->payout_details ?? [], ['phone' => $phone])]);
            }
            AuditLog::record('payout.instant_requested', $payout, ['gross' => $total, 'fee' => $fee]);

            return $payout;
        });
    }

    public function markPaid(Payout $payout, User $by, string $reference): Payout
    {
        abort_if($payout->status === 'paid', 422, 'Already paid.');
        $payout->update(['status' => 'paid', 'reference' => $reference, 'processed_by' => $by->id, 'paid_at' => now()]);
        $payout->account->ledger()->create(['type' => 'payout', 'amount_zig' => -$payout->amount_zig, 'description' => "Payout {$reference}", 'payout_id' => $payout->id]);
        AuditLog::record('payout.paid', $payout, ['reference' => $reference]);

        return $payout;
    }

    /** Is today a payout day under the configured schedule? */
    public function isDue(?Carbon $day = null): bool
    {
        $day ??= now();

        return match (Setting::get('payments.payout_schedule')) {
            'daily' => true,
            'fortnightly' => strtolower($day->englishDayOfWeek) === Setting::get('payments.payout_day') && $day->weekOfYear % 2 === 0,
            default => strtolower($day->englishDayOfWeek) === Setting::get('payments.payout_day'),
        };
    }
}

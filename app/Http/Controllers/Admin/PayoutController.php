<?php

namespace App\Http\Controllers\Admin;

use App\Models\Driver;
use App\Models\LedgerEntry;
use App\Models\Payout;
use App\Models\Vendor;
use App\Services\PayoutService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class PayoutController extends AdminController
{
    public function index(Request $request)
    {
        $status = $request->query('status', 'pending');
        $type = $request->query('type');

        $payouts = Payout::with('account')
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($type, fn ($q) => $q->where('account_type', $type))
            ->orderByDesc('is_instant')->latest()->paginate(40)->withQueryString()
            ->through(fn (Payout $p) => $p->toArray() + [
                'account_name' => $p->account instanceof Driver ? $p->account->user?->name : $p->account?->name,
                'payout_details' => $p->account?->payout_details,
            ]);

        return Inertia::render('admin/payouts', [
            'payouts' => $payouts,
            'filters' => ['status' => $status, 'type' => $type],
            'summary' => [
                'pending_zig' => (float) Payout::where('status', 'pending')->sum('amount_zig'),
                'paid_30d_zig' => (float) Payout::where('status', 'paid')->where('paid_at', '>=', now()->subDays(30))->sum('amount_zig'),
                'unbatched_vendors_zig' => (float) LedgerEntry::where('account_type', 'vendor')->whereNull('payout_id')->sum('amount_zig'),
                'unbatched_drivers_zig' => (float) LedgerEntry::where('account_type', 'driver')->whereNull('payout_id')->sum('amount_zig'),
                'driver_cash_held_zig' => (float) Driver::all()->sum(fn ($d) => $d->cashHeld()),
            ],
            'schedule' => ['frequency' => \App\Models\Setting::get('payments.payout_schedule'), 'day' => \App\Models\Setting::get('payments.payout_day'), 'min' => \App\Models\Setting::get('payments.min_payout_zig')],
        ]);
    }

    public function generate(PayoutService $payouts)
    {
        $n = $payouts->generate();

        return back()->with('success', $n ? "{$n} payouts created." : 'Nothing due. Balances are below the minimum payout.');
    }

    public function markPaid(Request $request, Payout $payout, PayoutService $payouts)
    {
        $payouts->markPaid($payout, $request->user(), $request->validate(['reference' => ['required', 'string', 'max:80']])['reference']);

        return back()->with('success', 'Payout marked as paid.');
    }
}

<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Company;
use App\Models\CompanyInvoice;
use App\Models\CompanyMember;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Corporate accounts: staff order on the company tab within a daily allowance and a monthly budget.
 * Zvino invoices the company monthly; refunds on company orders reduce the invoice, never the employee's wallet.
 */
class CompanyService
{
    /** Throws if this user may not charge $amount to their company today. */
    public function assertCanCharge(User $user, float $amount): CompanyMember
    {
        $m = Setting::get('payments.company') ? CompanyMember::forUser($user) : null;
        if (! $m) {
            throw ValidationException::withMessages(['payment_method' => 'You’re not on a company account.']);
        }
        $c = $m->company;
        if ($c->allowed_days && ! in_array(now()->dayOfWeekIso, array_map('intval', $c->allowed_days), true)) {
            throw ValidationException::withMessages(['payment_method' => "{$c->name} doesn’t cover orders today."]);
        }
        if (($allow = $m->allowance()) !== null && $m->spentToday() + $amount > $allow) {
            $left = max(0, $allow - $m->spentToday());
            throw ValidationException::withMessages(['payment_method' => 'This is over your daily allowance (ZiG '.number_format($left, 2).' left today). Use another payment method for the difference.']);
        }
        if ($c->monthly_budget_zig !== null && $c->spentThisMonth() + $amount > $c->monthly_budget_zig) {
            throw ValidationException::withMessages(['payment_method' => "{$c->name}’s monthly budget is used up. Please pay another way."]);
        }

        return $m;
    }

    /** What the app shows on checkout and account screens. */
    public function summary(User $user): ?array
    {
        $m = Setting::get('payments.company') ? CompanyMember::forUser($user) : null;
        if (! $m) {
            return null;
        }
        $allow = $m->allowance();

        return [
            'company' => $m->company->name,
            'role' => $m->role,
            'daily_allowance_zig' => $allow,
            'left_today_zig' => $allow !== null ? round(max(0, $allow - $m->spentToday()), 2) : null,
        ];
    }

    /** Monthly invoice per company for everything not yet invoiced up to $until. */
    public function invoiceAll(?Carbon $until = null): int
    {
        $until ??= now()->subMonthNoOverflow()->endOfMonth();
        $n = 0;
        Company::where('is_active', true)->get()->each(function (Company $c) use ($until, &$n) {
            DB::transaction(function () use ($c, $until, &$n) {
                $orders = $c->spendQuery()->whereNull('company_invoice_id')->where('created_at', '<=', $until)->lockForUpdate()->get();
                if ($orders->isEmpty()) {
                    return;
                }
                $invoice = CompanyInvoice::create([
                    'company_id' => $c->id,
                    'number' => 'ZVI-'.$until->format('Ym').'-'.str_pad((string) $c->id, 4, '0', STR_PAD_LEFT),
                    'period_start' => $orders->min('created_at')->toDateString(),
                    'period_end' => $until->toDateString(),
                    'orders_count' => $orders->count(),
                    'amount_zig' => round($orders->sum(fn ($o) => $o->total_zig - $o->refunded_zig), 2),
                    'due_on' => now()->addDays($c->payment_terms_days)->toDateString(),
                ]);
                \App\Models\Order::whereIn('id', $orders->pluck('id'))->update(['company_invoice_id' => $invoice->id]);
                AuditLog::record('company.invoiced', $invoice, ['amount' => $invoice->amount_zig]);
                $n++;
            });
        });

        return $n;
    }
}

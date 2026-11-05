<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Corporate account (#?): employees order on the company's tab within allowances; invoiced monthly. */
class Company extends Model
{
    protected $guarded = [];
    protected $casts = ['is_active' => 'boolean', 'allowed_days' => 'array', 'monthly_budget_zig' => 'float', 'daily_allowance_zig' => 'float', 'details' => 'array'];

    public function members(): HasMany { return $this->hasMany(CompanyMember::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function invoices(): HasMany { return $this->hasMany(CompanyInvoice::class); }

    /** Spend that counts against limits: company-paid orders that weren't cancelled/refunded. */
    public function spendQuery()
    {
        return $this->orders()->where('payment_method', 'company')->whereNotIn('status', ['cancelled', 'rejected', 'pending_payment']);
    }

    public function spentThisMonth(): float
    {
        return round((float) $this->spendQuery()->where('created_at', '>=', now()->startOfMonth())->sum('total_zig'), 2);
    }
}

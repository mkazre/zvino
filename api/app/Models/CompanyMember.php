<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CompanyMember extends Model
{
    protected $guarded = [];
    protected $casts = ['is_active' => 'boolean', 'daily_allowance_zig' => 'float'];

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    /** Active membership for a user (matched by account, or by phone for invited staff who just signed up). */
    public static function forUser(User $user): ?self
    {
        $m = static::with('company')->where('is_active', true)
            ->where(fn ($q) => $q->where('user_id', $user->id)->orWhere(fn ($q) => $q->whereNull('user_id')->where('phone', $user->phone)))
            ->get()->first(fn ($m) => $m->company?->is_active);
        if ($m && ! $m->user_id) {
            $m->update(['user_id' => $user->id]);
        }

        return $m;
    }

    public function allowance(): ?float
    {
        return $this->daily_allowance_zig ?? $this->company->daily_allowance_zig;
    }

    public function spentToday(): float
    {
        return round((float) $this->company->spendQuery()->where('user_id', $this->user_id)->where('created_at', '>=', now()->startOfDay())->sum('total_zig'), 2);
    }
}

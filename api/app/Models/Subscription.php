<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    protected $guarded = [];
    protected $casts = ['current_period_end' => 'datetime', 'auto_renew' => 'boolean'];

    public function plan(): BelongsTo { return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id'); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }

    public function isActive(): bool
    {
        return in_array($this->status, ['active', 'cancelled'], true) && $this->current_period_end?->isFuture();
    }
}

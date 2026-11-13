<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DispatchOffer extends Model
{
    protected $guarded = [];
    protected $casts = ['expires_at' => 'datetime', 'responded_at' => 'datetime', 'pay_zig' => 'float', 'pickup_km' => 'float', 'dropoff_km' => 'float', 'boost_pct' => 'float', 'broadcast' => 'boolean', 'round' => 'integer'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }

    public function isLive(): bool
    {
        return $this->status === 'offered' && $this->expires_at->isFuture();
    }
}

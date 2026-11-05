<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Driver extends Model
{
    protected $guarded = [];
    protected $casts = [
        'is_online' => 'boolean', 'lat' => 'float', 'lng' => 'float', 'rating' => 'float',
        'acceptance_rate' => 'float', 'payout_details' => 'array',
        'location_updated_at' => 'datetime', 'approved_at' => 'datetime',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function zone(): BelongsTo { return $this->belongsTo(Zone::class); }
    public function documents(): HasMany { return $this->hasMany(DriverDocument::class); }
    public function offers(): HasMany { return $this->hasMany(DispatchOffer::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function ledger(): MorphMany { return $this->morphMany(LedgerEntry::class, 'account'); }

    /** Orders assigned and not yet finished. */
    public function activeOrders(): HasMany
    {
        return $this->orders()->whereIn('status', ['accepted', 'preparing', 'ready', 'picked_up', 'arriving']);
    }

    public function scopeAvailable($q)
    {
        return $q->where('status', 'approved')->where('is_online', true)
            ->where('location_updated_at', '>=', now()->subMinutes(3));
    }

    public function balance(): float
    {
        return round((float) $this->ledger()->sum('amount_zig'), 2);
    }

    /** Cash collected on COD orders and not yet remitted (negative ledger balance from cash entries). */
    public function cashHeld(): float
    {
        return round(-1 * (float) $this->ledger()->whereIn('type', ['cash_collected'])->whereNull('payout_id')->sum('amount_zig'), 2);
    }
}

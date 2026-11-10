<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Vendor extends Model
{
    protected $guarded = [];
    protected $casts = [
        'is_featured' => 'boolean', 'rating' => 'float', 'commission_pct' => 'float',
        'delivery_fee_zig' => 'float', 'min_order_zig' => 'float', 'lat' => 'float', 'lng' => 'float',
        'tags' => 'array', 'delivery_radius_km' => 'float', 'offers_delivery' => 'boolean',
        'offers_pickup' => 'boolean', 'accepts_scheduled' => 'boolean', 'auto_accept' => 'boolean', 'is_shopper_store' => 'boolean',
        'is_busy' => 'boolean', 'power_out' => 'boolean', 'paused_until' => 'datetime', 'payout_details' => 'array', 'legal' => 'array',
    ];

    public function categories(): HasMany { return $this->hasMany(Category::class)->orderBy('sort_order'); }
    public function items(): HasMany { return $this->hasMany(Item::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function staff(): HasMany { return $this->hasMany(User::class); }
    public function hours(): HasMany { return $this->hasMany(VendorHour::class)->orderBy('weekday')->orderBy('opens_at'); }
    public function closures(): HasMany { return $this->hasMany(VendorClosure::class); }
    public function reviews(): HasMany { return $this->hasMany(Review::class); }
    public function modifierGroups(): HasMany { return $this->hasMany(ModifierGroup::class); }
    public function zone(): BelongsTo { return $this->belongsTo(Zone::class); }
    public function ledger(): MorphMany { return $this->morphMany(LedgerEntry::class, 'account'); }

    public function scopeActive($q) { return $q->where('status', 'active'); }

    public function balance(): float
    {
        return round((float) $this->ledger()->sum('amount_zig'), 2);
    }
}

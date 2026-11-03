<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Order extends Model
{
    protected $guarded = [];
    protected $casts = [
        'status_history' => 'array',
        'subtotal_zig' => 'float', 'delivery_fee_zig' => 'float', 'service_fee_zig' => 'float',
        'discount_zig' => 'float', 'vat_zig' => 'float', 'total_zig' => 'float',
        'zig_per_usd' => 'float', 'total_usd' => 'float', 'commission_zig' => 'float',
        'rider_lat' => 'float', 'rider_lng' => 'float',
        'tip_zig' => 'float', 'small_order_fee_zig' => 'float', 'refunded_zig' => 'float',
        'driver_pay_zig' => 'float', 'vendor_payout_zig' => 'float', 'distance_km' => 'float',
        'scheduled_for' => 'datetime', 'accepted_at' => 'datetime', 'ready_at' => 'datetime',
        'picked_up_at' => 'datetime', 'delivered_at' => 'datetime', 'cancelled_at' => 'datetime',
        'estimated_delivery_at' => 'datetime',
    ];

    /** Statuses in which the order is still in progress. */
    public const LIVE = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving'];

    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            $order->reference ??= 'ZV-'.strtoupper(Str::random(6));
            $order->status_history ??= [['status' => $order->status ?? 'pending_payment', 'at' => now()->toIso8601String()]];
        });
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function address(): BelongsTo { return $this->belongsTo(Address::class); }
    public function items(): HasMany { return $this->hasMany(OrderItem::class); }
    public function payments(): HasMany { return $this->hasMany(Payment::class); }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
    public function zone(): BelongsTo { return $this->belongsTo(Zone::class); }
    public function promoCode(): BelongsTo { return $this->belongsTo(PromoCode::class); }
    public function dispatchOffers(): HasMany { return $this->hasMany(DispatchOffer::class); }
    public function messages(): HasMany { return $this->hasMany(OrderMessage::class); }
    public function refunds(): HasMany { return $this->hasMany(Refund::class); }
    public function review(): HasOne { return $this->hasOne(Review::class); }

    public function scopeActive($q)
    {
        return $q->whereIn('status', self::LIVE);
    }
}

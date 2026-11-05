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
        'wallet_applied_zig' => 'float', 'cash_part_zig' => 'float', 'donation_zig' => 'float', 'no_cutlery' => 'boolean',
    ];

    /** Statuses in which the order is still in progress. */
    public const LIVE = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving'];

    protected static function booted(): void
    {
        static::creating(function (Order $order) {
            $order->reference ??= 'ZV-'.strtoupper(Str::random(6));
            $order->status ??= 'pending_payment';
            $order->payment_status ??= 'unpaid';
            $order->kitchen_stage ??= 'new';
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

    /** What the driver collects in cash: the whole balance on cash orders, or the cash share of a split payment. */
    public function cashDue(): float
    {
        return $this->payment_method === 'cash'
            ? round($this->total_zig - $this->wallet_applied_zig, 2)
            : round((float) $this->cash_part_zig, 2);
    }

    public function scopeActive($q)
    {
        return $q->whereIn('status', self::LIVE);
    }
}

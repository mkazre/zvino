<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
    ];

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

    public function scopeActive($q)
    {
        return $q->whereNotIn('status', ['delivered', 'cancelled', 'pending_payment']);
    }
}

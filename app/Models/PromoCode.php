<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PromoCode extends Model
{
    protected $guarded = [];
    protected $casts = [
        'starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_active' => 'boolean',
        'value' => 'float', 'min_order_zig' => 'float',
    ];

    public function isUsableFor(float $subtotal, ?int $vendorId): bool
    {
        return $this->is_active
            && (! $this->starts_at || $this->starts_at->isPast())
            && (! $this->ends_at || $this->ends_at->isFuture())
            && (! $this->max_uses || $this->used_count < $this->max_uses)
            && (! $this->vendor_id || $this->vendor_id === $vendorId)
            && $subtotal >= $this->min_order_zig;
    }

    public function discountFor(float $subtotal, float $deliveryFee): float
    {
        return round(match ($this->type) {
            'percent' => $subtotal * $this->value / 100,
            'fixed' => min($this->value, $subtotal),
            'free_delivery' => $deliveryFee,
        }, 2);
    }
}

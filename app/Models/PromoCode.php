<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class PromoCode extends Model
{
    protected $guarded = [];
    protected $casts = [
        'starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_active' => 'boolean', 'auto_apply' => 'boolean',
        'value' => 'float', 'min_order_zig' => 'float', 'days' => 'array',
    ];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function item(): BelongsTo { return $this->belongsTo(Item::class); }

    public function isUsableFor(float $subtotal, ?int $vendorId, ?Carbon $at = null): bool
    {
        return $this->is_active
            && (! $this->starts_at || $this->starts_at->isPast())
            && (! $this->ends_at || $this->ends_at->isFuture())
            && (! $this->max_uses || $this->used_count < $this->max_uses)
            && (! $this->vendor_id || $this->vendor_id === $vendorId)
            && $subtotal >= $this->min_order_zig
            && $this->inWindow($at);
    }

    /** Happy hour (#31): optional weekdays and a daily time window (may cross midnight). */
    public function inWindow(?Carbon $at = null): bool
    {
        $at ??= now();
        if ($this->days && ! in_array($at->dayOfWeekIso, array_map('intval', $this->days), true)) {
            return false;
        }
        if (! $this->start_time || ! $this->end_time) {
            return true;
        }
        $t = $at->format('H:i');

        return $this->start_time <= $this->end_time
            ? $t >= $this->start_time && $t < $this->end_time
            : $t >= $this->start_time || $t < $this->end_time;
    }

    /**
     * @param  array<int, array{item_id:int, quantity:int, unit:float}>  $lines  cart lines (needed for BOGO)
     */
    public function discountFor(float $subtotal, float $deliveryFee, array $lines = []): float
    {
        return round(match ($this->type) {
            'percent' => $subtotal * $this->value / 100,
            'fixed' => min($this->value, $subtotal),
            'free_delivery' => $deliveryFee,
            'bogo' => $this->bogoDiscount($lines),
            default => 0,
        }, 2);
    }

    /** Buy N get 1 free on the promo's item (or any item if none set): every (N+1)th unit is free, cheapest first. */
    private function bogoDiscount(array $lines): float
    {
        $units = [];
        foreach ($lines as $l) {
            if (! $this->item_id || (int) $l['item_id'] === (int) $this->item_id) {
                $units = array_merge($units, array_fill(0, (int) $l['quantity'], (float) $l['unit']));
            }
        }
        sort($units);
        $free = intdiv(count($units), max(1, (int) $this->buy_qty) + 1);

        return array_sum(array_slice($units, 0, $free));
    }

    /** Customer-facing headline, e.g. "Buy 1 get 1 free: Sadza & Stew" or "Happy hour 15:00–17:00: 20% off". */
    public function headline(): string
    {
        $what = $this->title ?: match ($this->type) {
            'percent' => rtrim(rtrim(number_format($this->value, 2), '0'), '.').'% off',
            'fixed' => 'ZiG '.number_format($this->value, 2).' off',
            'free_delivery' => 'Free delivery',
            'bogo' => 'Buy '.$this->buy_qty.' get 1 free'.($this->item ? ': '.$this->item->name : ''),
            default => 'Deal',
        };

        return $this->start_time && $this->end_time ? "Happy hour {$this->start_time}–{$this->end_time}: $what" : $what;
    }

    /** Deals that apply by themselves (no code needed) at a store. */
    public static function autoFor(Vendor $vendor)
    {
        return static::where('is_active', true)->where('auto_apply', true)
            ->where(fn ($q) => $q->whereNull('vendor_id')->orWhere('vendor_id', $vendor->id))->with('item')->get();
    }
}

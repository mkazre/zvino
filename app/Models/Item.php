<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Item extends Model
{
    protected $guarded = [];
    protected $casts = [
        'is_available' => 'boolean', 'is_special' => 'boolean', 'is_popular' => 'boolean', 'needs_power' => 'boolean',
        'variants' => 'array', 'modifiers' => 'array', 'dietary' => 'array',
        'price_zig' => 'float', 'special_price_zig' => 'float', 'unavailable_until' => 'datetime',
    ];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function category(): BelongsTo { return $this->belongsTo(Category::class); }
    public function modifierGroups(): BelongsToMany { return $this->belongsToMany(ModifierGroup::class)->withPivot('sort_order')->orderByPivot('sort_order'); }

    /** Orderable right now, taking stock timers and load-shedding into account. */
    public function isOrderable(): bool
    {
        return $this->is_available
            && ! $this->unavailable_until?->isFuture()
            && ! ($this->needs_power && $this->vendor?->power_out);
    }

    public function effectivePrice(): float
    {
        return $this->special_price_zig ?: $this->price_zig;
    }

    /** Unit price for a chosen variant and list of modifier option names. */
    public function priceFor(?string $variant, array $modifiers = []): float
    {
        $price = $this->effectivePrice();
        foreach ($this->variants ?? [] as $v) {
            if ($v['name'] === $variant) {
                $price += $v['price_delta_zig'] ?? 0;
            }
        }
        foreach ($this->modifiers ?? [] as $group) {
            foreach ($group['options'] ?? [] as $opt) {
                if (in_array($opt['name'], $modifiers, true)) {
                    $price += $opt['price_delta_zig'] ?? 0;
                }
            }
        }

        return round($price, 2);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Item extends Model
{
    protected $guarded = [];
    protected $casts = [
        'is_available' => 'boolean', 'is_special' => 'boolean',
        'variants' => 'array', 'modifiers' => 'array',
        'price_zig' => 'float', 'special_price_zig' => 'float',
    ];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function category(): BelongsTo { return $this->belongsTo(Category::class); }

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

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
        'variants' => 'array', 'modifiers' => 'array', 'dietary' => 'array', 'attributes' => 'array', 'cost_usd' => 'float',
        'price_zig' => 'float', 'special_price_zig' => 'float', 'step_kg' => 'float', 'unavailable_until' => 'datetime',
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

    public function unitFactor(): float
    {
        return $this->sold_by === 'kg' ? (float) $this->step_kg : 1.0;
    }

    /** "1.5 kg" for weighed items, null for ordinary ones. */
    public function weightLabel(int $quantity): ?string
    {
        return $this->sold_by === 'kg' ? rtrim(rtrim(number_format($quantity * $this->step_kg, 3, '.', ''), '0'), '.').' kg' : null;
    }

    /** Price-drop alerts (#15): tell watchers when the price falls below what they saw. */
    protected static function booted(): void
    {
        static::updated(function (Item $item) {
            if (! $item->wasChanged(['price_zig', 'special_price_zig'])) {
                return;
            }
            $now = $item->effectivePrice();
            ItemWatch::with('user')->where('item_id', $item->id)->where('price_zig', '>', $now)->get()->each(function (ItemWatch $w) use ($item, $now) {
                app(\App\Services\PushService::class)->toUser($w->user, 'price_drop', "Price drop: {$item->name} 🎉",
                    'Now ZiG '.number_format($now, 2).' (was ZiG '.number_format($w->price_zig, 2).') at '.$item->vendor?->name.'.', ['item_id' => $item->id, 'vendor_id' => $item->vendor_id]);
                $w->update(['price_zig' => $now, 'notified_at' => now()]);
            });
        });
    }

    /** Unit price for a chosen variant and list of modifier option names. */
    public function priceFor(?string $variant, array $modifiers = []): float
    {
        // Fresh market (#29): price_zig is per kg; one cart "unit" is one step (e.g. 0.5 kg).
        $price = $this->effectivePrice() * $this->unitFactor();
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
        foreach ($this->modifierGroups as $group) {
            foreach ($group->options as $opt) {
                if (in_array($opt->name, $modifiers, true)) {
                    $price += $opt->price_delta_zig;
                }
            }
        }

        return round($price, 2);
    }

    /** Enforce required add-on groups and min/max picks ("Choose 1 side", "Up to 3 extras"). */
    public function validateSelection(?string $variant, array $modifiers): void
    {
        if ($this->variants && $variant && ! collect($this->variants)->contains('name', $variant)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['variant' => "Pick a valid size for {$this->name}."]);
        }

        foreach ($this->modifierGroups as $group) {
            $picked = $group->options->filter(fn ($o) => in_array($o->name, $modifiers, true));
            if ($picked->contains(fn ($o) => ! $o->is_available)) {
                throw \Illuminate\Validation\ValidationException::withMessages(['modifiers' => "{$picked->first(fn ($o) => ! $o->is_available)->name} is sold out."]);
            }
            if ($picked->count() < $group->min_select) {
                throw \Illuminate\Validation\ValidationException::withMessages(['modifiers' => "Choose at least {$group->min_select} for “{$group->name}”."]);
            }
            if ($picked->count() > $group->max_select) {
                throw \Illuminate\Validation\ValidationException::withMessages(['modifiers' => "Choose up to {$group->max_select} for “{$group->name}”."]);
            }
        }
    }
}

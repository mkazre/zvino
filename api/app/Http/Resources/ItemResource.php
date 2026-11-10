<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'vendor_id' => $this->vendor_id,
            'category_id' => $this->category_id,
            'name' => $this->name,
            'description' => $this->description,
            // Pack size from imported products, e.g. "2 kg · 500 ml · 28 × 6 cm".
            'size' => self::size($this->resource->getAttribute('attributes')),
            'image' => $this->image_path,
            'price' => Money::both($this->price_zig),
            'special_price' => $this->special_price_zig ? Money::both($this->special_price_zig) : null,
            'sold_by' => $this->sold_by ?? 'unit',
            'step_kg' => (float) ($this->step_kg ?? 0.5),
            'is_available' => $this->isOrderable(),
            'unavailable_until' => $this->unavailable_until,
            'is_special' => $this->is_special,
            'requires_prescription' => (bool) $this->requires_prescription,
            'is_popular' => $this->is_popular,
            'needs_power' => $this->needs_power,
            'dietary' => $this->dietary ?? [],
            'calories' => $this->calories,
            'modifier_groups' => $this->whenLoaded('modifierGroups', fn () => $this->modifierGroups->map(fn ($g) => [
                'id' => $g->id,
                'name' => $g->name,
                'min' => $g->min_select,
                'max' => $g->max_select,
                'required' => $g->isRequired(),
                'options' => $g->options->where('is_available', true)->values()->map(fn ($o) => ['id' => $o->id, 'name' => $o->name, 'price_delta' => Money::both($o->price_delta_zig)]),
            ])),
            // Stored JSON can hold numbers as strings ("0"): always send numbers, or apps would join text instead of adding.
            'variants' => collect($this->variants ?? [])->map(fn ($v) => array_merge($v, ['price_delta_zig' => (float) ($v['price_delta_zig'] ?? 0), 'price_delta' => Money::both((float) ($v['price_delta_zig'] ?? 0))])),
            'modifiers' => collect($this->modifiers ?? [])->map(fn ($g) => $g + [
                'options' => collect($g['options'] ?? [])->map(fn ($o) => array_merge($o, ['price_delta_zig' => (float) ($o['price_delta_zig'] ?? 0), 'price_delta' => Money::both((float) ($o['price_delta_zig'] ?? 0))])),
            ]),
            'vendor' => $this->whenLoaded('vendor', fn () => $this->vendor->only('id', 'name', 'slug')),
        ];
    }

    public static function size(?array $a): ?string
    {
        if (! $a) {
            return null;
        }
        $fmt = fn ($n) => rtrim(rtrim(number_format((float) $n, 2, '.', ''), '0'), '.');
        $parts = array_filter([
            isset($a['weight_kg']) ? ($a['weight_kg'] < 1 ? $fmt($a['weight_kg'] * 1000).' g' : $fmt($a['weight_kg']).' kg') : null,
            isset($a['volume_ml']) ? ($a['volume_ml'] >= 1000 ? $fmt($a['volume_ml'] / 1000).' L' : $fmt($a['volume_ml']).' ml') : null,
            isset($a['width_cm'], $a['height_cm']) ? $fmt($a['width_cm']).' × '.$fmt($a['height_cm']).' cm' : null,
        ]);

        return $parts ? implode(' · ', $parts) : null;
    }
}

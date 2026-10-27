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
            'image' => $this->image_path,
            'price' => Money::both($this->price_zig),
            'special_price' => $this->special_price_zig ? Money::both($this->special_price_zig) : null,
            'is_available' => $this->is_available,
            'is_special' => $this->is_special,
            'variants' => collect($this->variants ?? [])->map(fn ($v) => $v + ['price_delta' => Money::both($v['price_delta_zig'] ?? 0)]),
            'modifiers' => collect($this->modifiers ?? [])->map(fn ($g) => $g + [
                'options' => collect($g['options'] ?? [])->map(fn ($o) => $o + ['price_delta' => Money::both($o['price_delta_zig'] ?? 0)]),
            ]),
            'vendor' => $this->whenLoaded('vendor', fn () => $this->vendor->only('id', 'name', 'slug')),
        ];
    }
}

<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class VendorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'cuisine' => $this->cuisine,
            'description' => $this->description,
            'logo' => $this->logo_path,
            'kind' => $this->kind ?? 'restaurant',
            'accepts_catering' => (bool) $this->accepts_catering,
            'cover' => $this->cover_path,
            'city' => $this->city,
            'address' => $this->address,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'rating' => $this->rating,
            'eta_minutes' => [$this->prep_minutes + 10, $this->prep_minutes + 25],
            'delivery_fee' => Money::both($this->delivery_fee_zig),
            'min_order' => Money::both($this->min_order_zig),
            'is_featured' => $this->is_featured,
            'has_offers' => (bool) ($this->has_offers ?? false),
            'categories' => $this->whenLoaded('categories', fn () => $this->categories->map(fn ($c) => [
                'id' => $c->id,
                'name' => $c->name,
                'items' => ItemResource::collection($c->relationLoaded('items') ? $c->items : collect()),
            ])),
        ];
    }
}

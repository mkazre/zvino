<?php

namespace App\Http\Resources;

use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $m = fn ($zig) => Money::both($zig, $this->zig_per_usd);

        return [
            'id' => $this->id,
            'reference' => $this->reference,
            'source' => $this->source,
            'fulfilment' => $this->fulfilment,
            'status' => $this->status,
            'kitchen_stage' => $this->kitchen_stage,
            'payment_method' => $this->payment_method,
            'payment_status' => $this->payment_status,
            'totals' => [
                'subtotal' => $m($this->subtotal_zig),
                'delivery' => $m($this->delivery_fee_zig),
                'service' => $m($this->service_fee_zig),
                'discount' => $m($this->discount_zig),
                'vat' => $m($this->vat_zig),
                'total' => $m($this->total_zig),
            ],
            'zig_per_usd' => $this->zig_per_usd,
            'notes' => $this->notes,
            'rider' => $this->rider_name ? ['name' => $this->rider_name, 'phone' => $this->rider_phone, 'lat' => $this->rider_lat, 'lng' => $this->rider_lng] : null,
            'status_history' => $this->status_history,
            'vendor' => $this->whenLoaded('vendor', fn () => $this->vendor->only('id', 'name', 'slug', 'logo_path', 'lat', 'lng')),
            'address' => $this->whenLoaded('address'),
            'customer' => $this->whenLoaded('user', fn () => $this->user?->only('id', 'name', 'phone')),
            'driver' => $this->whenLoaded('driver', fn () => $this->driver ? ['id' => $this->driver->id, 'name' => $this->driver->user?->name] : null),
            'scheduled_for' => $this->scheduled_for,
            'estimated_delivery_at' => $this->estimated_delivery_at,
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($i) => [
                'name' => $i->name,
                'quantity' => $i->quantity,
                'options' => $i->options,
                'notes' => $i->notes,
                'line_total' => $m($i->line_total_zig),
            ])),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}

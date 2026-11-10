<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierProduct extends Model
{
    protected $guarded = [];
    protected $casts = [
        'price_usd' => 'float', 'sale_price_usd' => 'float', 'markup_value' => 'float',
        'attributes' => 'array', 'stock' => 'array', 'active' => 'boolean', 'synced_at' => 'datetime',
    ];

    public function source(): BelongsTo { return $this->belongsTo(SupplierSource::class, 'supplier_source_id'); }
}

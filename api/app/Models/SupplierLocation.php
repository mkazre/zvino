<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplierLocation extends Model
{
    protected $guarded = [];
    protected $casts = ['active' => 'boolean', 'lat' => 'float', 'lng' => 'float'];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function source(): BelongsTo { return $this->belongsTo(SupplierSource::class, 'supplier_source_id'); }
}

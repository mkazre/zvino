<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    protected $guarded = [];
    protected $casts = ['options' => 'array', 'unit_price_zig' => 'float', 'line_total_zig' => 'float', 'replacement' => 'array', 'refund_zig' => 'float', 'shopped_at' => 'datetime'];

    public function item(): BelongsTo { return $this->belongsTo(Item::class); }

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}

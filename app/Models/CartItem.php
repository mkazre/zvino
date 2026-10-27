<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CartItem extends Model
{
    protected $guarded = [];
    protected $casts = ['options' => 'array', 'unit_price_zig' => 'float'];

    public function cart(): BelongsTo { return $this->belongsTo(Cart::class); }
    public function item(): BelongsTo { return $this->belongsTo(Item::class); }
}

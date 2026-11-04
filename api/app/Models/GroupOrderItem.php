<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GroupOrderItem extends Model
{
    protected $guarded = [];
    protected $casts = ['options' => 'array', 'unit_price_zig' => 'float'];

    public function item(): BelongsTo { return $this->belongsTo(Item::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}

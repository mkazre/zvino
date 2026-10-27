<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $guarded = [];
    protected $casts = ['raw' => 'array', 'amount_zig' => 'float'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}

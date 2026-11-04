<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Refund extends Model
{
    protected $guarded = [];
    protected $casts = ['items' => 'array', 'amount_zig' => 'float'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function requester(): BelongsTo { return $this->belongsTo(User::class, 'requested_by'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Payment extends Model
{
    protected $guarded = [];
    protected $casts = ['raw' => 'array', 'amount_zig' => 'float'];

    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function payable(): MorphTo { return $this->morphTo(); }

    /** Reference sent to Paynow: the order ref, or our own for top-ups / gift cards / Zvino+. */
    public function reference(): string
    {
        return $this->raw['reference'] ?? $this->order?->reference ?? 'ZVP-'.$this->id;
    }
}

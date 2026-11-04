<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class GiftCard extends Model
{
    protected $guarded = [];
    protected $casts = ['amount_zig' => 'float', 'redeemed_at' => 'datetime', 'expires_at' => 'datetime'];

    protected static function booted(): void
    {
        static::creating(fn (GiftCard $g) => $g->code ??= 'ZVG-'.strtoupper(Str::random(4).'-'.Str::random(4)));
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Payout extends Model
{
    protected $guarded = [];
    protected $casts = ['amount_zig' => 'float', 'period_start' => 'date', 'period_end' => 'date', 'paid_at' => 'datetime'];

    public function account(): MorphTo { return $this->morphTo(); }
    public function entries(): HasMany { return $this->hasMany(LedgerEntry::class); }
}

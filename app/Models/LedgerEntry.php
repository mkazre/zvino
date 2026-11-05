<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/** Positive = Zvino owes the account (store/driver); negative = account owes Zvino. */
class LedgerEntry extends Model
{
    protected $guarded = [];
    protected $casts = ['amount_zig' => 'float'];

    public function account(): MorphTo { return $this->morphTo(); }
}

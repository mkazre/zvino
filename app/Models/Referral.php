<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Referral extends Model
{
    protected $guarded = [];

    public function referrer(): BelongsTo { return $this->belongsTo(User::class, 'referrer_id'); }
    public function referee(): BelongsTo { return $this->belongsTo(User::class, 'referee_id'); }
}

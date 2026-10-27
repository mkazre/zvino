<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Address extends Model
{
    protected $guarded = [];
    protected $casts = ['is_default' => 'boolean', 'lat' => 'float', 'lng' => 'float'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}

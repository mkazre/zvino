<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriverDocument extends Model
{
    protected $guarded = [];
    protected $casts = ['expires_on' => 'date'];

    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
}

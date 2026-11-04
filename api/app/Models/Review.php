<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $guarded = [];
    protected $casts = ['tags' => 'array', 'is_hidden' => 'boolean'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function driver(): BelongsTo { return $this->belongsTo(Driver::class); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}

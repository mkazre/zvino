<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupportMessage extends Model
{
    protected $guarded = [];
    protected $casts = ['is_staff' => 'boolean'];

    public function sender(): BelongsTo { return $this->belongsTo(User::class, 'sender_id'); }
}

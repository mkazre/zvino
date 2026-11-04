<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Price-drop alert (#15): a customer watching an item at the price they last saw. */
class ItemWatch extends Model
{
    protected $guarded = [];
    protected $casts = ['price_zig' => 'float', 'notified_at' => 'datetime'];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function item(): BelongsTo { return $this->belongsTo(Item::class); }
}

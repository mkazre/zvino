<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Diaspora grocery hamper (#8): a curated basket from a grocery store, sent once or monthly. */
class Hamper extends Model
{
    protected $guarded = [];
    protected $casts = ['lines' => 'array', 'is_active' => 'boolean'];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }

    public function priceZig(): float
    {
        $items = Item::whereIn('id', collect($this->lines)->pluck('item_id'))->get()->keyBy('id');

        return round(collect($this->lines)->sum(fn ($l) => ($items[$l['item_id']] ?? null)?->priceFor(null) * $l['quantity']), 2);
    }
}

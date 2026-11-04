<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    protected $guarded = [];

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function items(): HasMany { return $this->hasMany(Item::class)->orderBy('sort_order'); }
}

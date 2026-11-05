<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ModifierOption extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['price_delta_zig' => 'float', 'is_available' => 'boolean'];

    public function group(): BelongsTo { return $this->belongsTo(ModifierGroup::class, 'modifier_group_id'); }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ModifierGroup extends Model
{
    protected $guarded = [];

    public function options(): HasMany { return $this->hasMany(ModifierOption::class)->orderBy('sort_order'); }
    public function items(): BelongsToMany { return $this->belongsToMany(Item::class); }

    public function isRequired(): bool { return $this->min_select > 0; }
}

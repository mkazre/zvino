<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HomeBlock extends Model
{
    public const TYPES = ['hero', 'categories', 'specials', 'vendors', 'banner', 'rewards', 'richtext', 'spacer'];

    /** Block types that only make sense when there are multiple vendors to discover. */
    public const MARKETPLACE_ONLY = ['vendors'];

    protected $guarded = [];
    protected $casts = ['payload' => 'array', 'is_visible' => 'boolean', 'broadcast' => 'boolean', 'published_at' => 'datetime'];
}

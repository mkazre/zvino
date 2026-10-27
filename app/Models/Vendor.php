<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vendor extends Model
{
    protected $guarded = [];
    protected $casts = [
        'is_featured' => 'boolean', 'rating' => 'float', 'commission_pct' => 'float',
        'delivery_fee_zig' => 'float', 'min_order_zig' => 'float', 'lat' => 'float', 'lng' => 'float',
    ];

    public function categories(): HasMany { return $this->hasMany(Category::class)->orderBy('sort_order'); }
    public function items(): HasMany { return $this->hasMany(Item::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function staff(): HasMany { return $this->hasMany(User::class); }

    public function scopeActive($q) { return $q->where('status', 'active'); }
}

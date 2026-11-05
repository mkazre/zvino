<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Cart extends Model
{
    protected $guarded = [];

    public function items(): HasMany { return $this->hasMany(CartItem::class); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function promoCode(): BelongsTo { return $this->belongsTo(PromoCode::class); }
}

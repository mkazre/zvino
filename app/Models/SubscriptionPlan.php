<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    protected $guarded = [];
    protected $casts = ['perks' => 'array', 'is_active' => 'boolean', 'price_zig' => 'float', 'min_order_for_free_delivery_zig' => 'float', 'service_fee_discount_pct' => 'float'];
}

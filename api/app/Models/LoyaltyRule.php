<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LoyaltyRule extends Model
{
    protected $guarded = [];
    protected $casts = ['config' => 'array', 'is_active' => 'boolean'];
}

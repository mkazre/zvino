<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Campaign extends Model
{
    protected $guarded = [];
    protected $casts = ['audience' => 'array', 'scheduled_at' => 'datetime'];
}

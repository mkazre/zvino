<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DriverLocation extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['recorded_at' => 'datetime', 'lat' => 'float', 'lng' => 'float'];
}

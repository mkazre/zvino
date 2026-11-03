<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VendorClosure extends Model
{
    public $timestamps = false;
    protected $guarded = [];
    protected $casts = ['date' => 'date'];
}

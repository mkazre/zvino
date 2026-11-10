<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupplierCategory extends Model
{
    protected $guarded = [];
    protected $casts = ['selected' => 'boolean', 'markup_value' => 'float'];
}

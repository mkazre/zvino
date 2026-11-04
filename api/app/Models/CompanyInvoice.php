<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CompanyInvoice extends Model
{
    protected $guarded = [];
    protected $casts = ['period_start' => 'date', 'period_end' => 'date', 'due_on' => 'date', 'paid_at' => 'datetime', 'amount_zig' => 'float'];

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
}

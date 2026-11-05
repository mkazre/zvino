<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class GroupOrder extends Model
{
    protected $guarded = [];
    protected $casts = ['deadline_at' => 'datetime', 'spend_limit_zig' => 'float'];

    protected static function booted(): void
    {
        static::creating(fn (GroupOrder $g) => $g->code ??= strtoupper(Str::random(6)));
    }

    public function host(): BelongsTo { return $this->belongsTo(User::class, 'host_id'); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function items(): HasMany { return $this->hasMany(GroupOrderItem::class); }
}

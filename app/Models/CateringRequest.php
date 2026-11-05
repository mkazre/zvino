<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Str;

/**
 * Funeral & gathering catering (#9): request → store quotes → deposit → balance → delivered.
 * Paid through Paynow like other payments; settled to the store's ledger on completion.
 */
class CateringRequest extends Model
{
    public const TYPES = ['funeral', 'wedding', 'gathering', 'church', 'corporate', 'other'];

    protected $guarded = [];
    protected $casts = [
        'event_at' => 'datetime', 'quoted_at' => 'datetime', 'completed_at' => 'datetime', 'lines' => 'array',
        'quote_zig' => 'float', 'paid_zig' => 'float', 'deposit_pct' => 'float', 'lat' => 'float', 'lng' => 'float',
    ];

    protected static function booted(): void
    {
        static::creating(fn (self $c) => $c->reference ??= 'ZVC-'.strtoupper(Str::random(6)));
    }

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function payments(): MorphMany { return $this->morphMany(Payment::class, 'payable'); }

    public function depositZig(): float
    {
        return round(($this->quote_zig ?? 0) * $this->deposit_pct / 100, 2);
    }

    /** What the customer should pay next: the deposit, then the balance. */
    public function amountDue(): float
    {
        if (! $this->quote_zig) {
            return 0;
        }

        return round($this->paid_zig < $this->depositZig() ? $this->depositZig() - $this->paid_zig : $this->quote_zig - $this->paid_zig, 2);
    }
}

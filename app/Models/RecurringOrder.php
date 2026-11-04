<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A repeating order: weekday lunch plans for school/office (#17) or the month-end shop on payday (#10).
 * The scheduler places each run as a scheduled order a couple of hours ahead.
 */
class RecurringOrder extends Model
{
    protected $guarded = [];
    protected $casts = [
        'weekdays' => 'array', 'lines' => 'array', 'is_active' => 'boolean',
        'next_run_at' => 'datetime', 'reminded_for' => 'datetime',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function address(): BelongsTo { return $this->belongsTo(Address::class); }

    /** Next delivery time strictly after $from. */
    public function computeNext(?Carbon $from = null): ?Carbon
    {
        $from = ($from ?? now())->copy();
        [$h, $m] = array_map('intval', explode(':', $this->time));

        if ($this->kind === 'monthly') {
            $day = max(1, min(28, (int) $this->day_of_month));
            $at = $from->copy()->setDate($from->year, $from->month, $day)->setTime($h, $m);

            return $at->gt($from) ? $at : $at->addMonthNoOverflow();
        }

        $days = array_map('intval', $this->weekdays ?: [1, 2, 3, 4, 5]);
        for ($i = 0; $i <= 14; $i++) {
            $at = $from->copy()->startOfDay()->addDays($i)->setTime($h, $m);
            if ($at->gt($from) && in_array($at->dayOfWeekIso, $days, true)) {
                return $at;
            }
        }

        return null;
    }
}

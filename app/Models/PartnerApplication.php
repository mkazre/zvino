<?php

namespace App\Models;

use App\Support\Applications;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Str;

class PartnerApplication extends Model
{
    public const TYPES = ['restaurant', 'driver', 'corporate'];
    public const STATUSES = ['draft', 'in_review', 'needs_info', 'approved', 'rejected'];
    /** Waiting on staff (counts towards the sidebar badge). */
    public const OPEN = ['draft', 'in_review'];

    protected $guarded = [];
    protected $casts = ['details' => 'array', 'history' => 'array', 'reviewed_at' => 'datetime', 'approved_at' => 'datetime'];

    public function documents(): HasMany { return $this->hasMany(ApplicationDocument::class); }
    public function reviewer(): BelongsTo { return $this->belongsTo(User::class, 'reviewed_by'); }
    public function approvable(): MorphTo { return $this->morphTo(); }

    public static function newReference(string $type): string
    {
        $prefix = ['restaurant' => 'ZR', 'driver' => 'ZD', 'corporate' => 'ZC'][$type] ?? 'ZA';
        do {
            $ref = $prefix.'-'.strtoupper(Str::random(6));
            $ref = strtr($ref, ['0' => '7', 'O' => 'P', 'I' => 'K', '1' => '3', 'L' => 'M']); // easy to read out on the phone
        } while (static::where('reference', $ref)->exists());

        return $ref;
    }

    public function log(string $action, ?User $by = null, ?string $message = null): void
    {
        $this->history = [...($this->history ?? []), ['at' => now()->toIso8601String(), 'by' => $by?->name, 'action' => $action, 'message' => $message]];
    }

    public function detail(string $key, mixed $default = null): mixed
    {
        return $this->details[$key] ?? $default;
    }

    public function typeLabel(): string
    {
        return Applications::schema($this->type)['label'] ?? ucfirst($this->type);
    }

    /** Permission needed to review this kind of application. */
    public static function permissionFor(string $type): string
    {
        return 'applications.review';
    }
}

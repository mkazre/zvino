<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Published, versioned content the apps download at launch (no store release needed):
 *   onboarding → {slides: [...]}, launch → {image, background, gradient, tagline, duration_ms}
 */
class AppContent extends Model
{
    protected $guarded = [];
    protected $casts = ['payload' => 'array', 'is_enabled' => 'boolean', 'published_at' => 'datetime'];

    public static function for(string $app, string $key): self
    {
        return static::firstOrNew(['app' => $app, 'key' => $key]);
    }

    public function publish(array $payload, ?User $by): self
    {
        $this->fill(['payload' => $payload, 'version' => $this->version + 1, 'published_at' => now(), 'published_by' => $by?->id])->save();

        return $this;
    }
}

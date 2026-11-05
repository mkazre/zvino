<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;

/**
 * Key/value settings. Keys are "group.field" as defined in config/zvino_settings.php;
 * unset keys fall back to the definition's default.
 */
class Setting extends Model
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = ['value' => 'array'];

    /** Legacy flat keys used before the registry existed. */
    private const ALIASES = ['platform_mode' => 'general.platform_mode', 'single_vendor_id' => 'general.single_vendor_id'];

    public static function get(string $key, mixed $default = null): mixed
    {
        $key = self::ALIASES[$key] ?? $key;
        $all = self::all_();

        return array_key_exists($key, $all) ? $all[$key] : ($default ?? self::definition($key)['default'] ?? null);
    }

    public static function put(string $key, mixed $value): void
    {
        $key = self::ALIASES[$key] ?? $key;
        static::updateOrCreate(['key' => $key], ['value' => ['v' => self::cast($key, $value)]]);
        Cache::forget('settings.all');
    }

    /** All stored values, cached as one array (one query per request at most). */
    private static function all_(): array
    {
        return Cache::rememberForever('settings.all', fn () => static::query()->get()->mapWithKeys(fn ($s) => [$s->key => $s->value['v'] ?? null])->all());
    }

    public static function definition(string $key): ?array
    {
        [$group, $field] = array_pad(explode('.', $key, 2), 2, null);

        return config("zvino_settings.$group.fields.$field");
    }

    /** Values for a whole group, with defaults filled in. */
    public static function group(string $group): array
    {
        return collect(config("zvino_settings.$group.fields", []))
            ->map(fn ($def, $field) => self::get("$group.$field"))
            ->all();
    }

    public static function cast(string $key, mixed $value): mixed
    {
        $type = self::definition($key)['type'] ?? 'string';

        return match ($type) {
            'bool' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'int' => $value === null || $value === '' ? null : (int) $value,
            'decimal', 'money', 'percent' => $value === null || $value === '' ? null : (float) $value,
            'list' => is_array($value) ? array_values($value) : array_values(array_filter(array_map('trim', explode(',', (string) $value)), 'strlen')),
            'json' => is_array($value) ? $value : (json_decode((string) $value, true) ?? []),
            default => $value,
        };
    }

    public static function platformMode(): string
    {
        return static::get('general.platform_mode');
    }

    public static function singleVendorId(): ?int
    {
        return static::get('general.single_vendor_id');
    }

    /** Settings safe to expose to apps and the public website (no secrets). */
    public static function publicConfig(): array
    {
        $out = [];
        foreach (config('zvino_settings') as $group => $def) {
            foreach ($def['fields'] as $field => $f) {
                if (empty($f['secret'])) {
                    Arr::set($out, "$group.$field", self::get("$group.$field"));
                }
            }
        }

        return $out;
    }
}

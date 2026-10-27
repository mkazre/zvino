<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    protected $primaryKey = 'key';
    public $incrementing = false;
    protected $keyType = 'string';
    protected $guarded = [];
    protected $casts = ['value' => 'array'];

    public static function get(string $key, mixed $default = null): mixed
    {
        return Cache::rememberForever("setting.$key", fn () => static::find($key)?->value['v'] ?? $default);
    }

    public static function put(string $key, mixed $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => ['v' => $value]]);
        Cache::forget("setting.$key");
    }

    public static function platformMode(): string
    {
        return static::get('platform_mode', 'marketplace');
    }

    /** In single mode, the one restaurant the whole app serves. */
    public static function singleVendorId(): ?int
    {
        return static::get('single_vendor_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierSource extends Model
{
    protected $guarded = [];
    protected $casts = [
        'enabled' => 'boolean', 'hide_out_of_stock' => 'boolean', 'weekly_sync' => 'boolean',
        'markup_value' => 'float', 'last_synced_at' => 'datetime', 'sync_status' => 'array',
    ];

    public function categories(): HasMany { return $this->hasMany(SupplierCategory::class)->orderBy('sort'); }
    public function products(): HasMany { return $this->hasMany(SupplierProduct::class); }
    public function locations(): HasMany { return $this->hasMany(SupplierLocation::class)->orderBy('city')->orderBy('branch'); }

    public function storeName(string $branch): string
    {
        return trim(str_replace('{branch}', $branch, $this->store_name_pattern ?: 'Zvino Market {branch}'));
    }
}

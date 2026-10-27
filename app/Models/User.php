<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const STAFF_ROLES = ['super_admin', 'vendor_manager', 'cashier', 'kitchen'];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'phone',
        'role',
        'vendor_id',
        'preferred_currency',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function vendor(): BelongsTo { return $this->belongsTo(Vendor::class); }
    public function addresses(): HasMany { return $this->hasMany(Address::class); }
    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function cart(): HasOne { return $this->hasOne(Cart::class); }
    public function loyalty(): HasOne { return $this->hasOne(LoyaltyAccount::class); }
    public function deviceTokens(): HasMany { return $this->hasMany(DeviceToken::class); }
    public function appNotifications(): HasMany { return $this->hasMany(AppNotification::class); }
    public function walletTransactions(): HasMany { return $this->hasMany(WalletTransaction::class); }

    public function isStaff(): bool { return in_array($this->role, self::STAFF_ROLES, true); }
    public function isSuperAdmin(): bool { return $this->role === 'super_admin'; }

    /** Vendor-bound staff only see their vendor's data; super admins see everything (null). */
    public function scopedVendorId(): ?int
    {
        return $this->isSuperAdmin() ? null : $this->vendor_id;
    }

    public function walletBalance(): float
    {
        $credits = $this->walletTransactions()->where('type', 'credit')->sum('amount_zig');
        $debits = $this->walletTransactions()->where('type', 'debit')->sum('amount_zig');

        return round($credits - $debits, 2);
    }
}

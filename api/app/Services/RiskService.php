<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/** Fraud shield (Zvino original #48): cheap checks at checkout and refund time. */
class RiskService
{
    public function assertCanPlace(User $user, string $method, float $total): void
    {
        if (! Setting::get('fraud.enabled')) {
            return;
        }

        $recent = Order::where('user_id', $user->id)->where('created_at', '>=', now()->subHour())->where('status', '!=', 'cancelled')->count();
        if ($recent >= Setting::get('fraud.max_orders_per_hour')) {
            AuditLog::record('fraud.velocity_block', $user, ['orders_last_hour' => $recent]);
            throw ValidationException::withMessages(['cart' => 'You’ve placed a lot of orders in the last hour. Please try again shortly or contact support.']);
        }

        if ($method === 'cash' && ! $this->hasDelivered($user) && $total > Setting::get('fraud.new_account_cod_limit_zig')) {
            throw ValidationException::withMessages(['payment_method' => 'For your first order, cash on delivery is limited to ZiG '.Setting::get('fraud.new_account_cod_limit_zig').'. Please pay by EcoCash, InnBucks or card.']);
        }

        if ($this->openRefunds($user) >= Setting::get('fraud.max_open_refund_requests')) {
            throw ValidationException::withMessages(['cart' => 'You have refund requests being reviewed. Our team will be in touch shortly.']);
        }
    }

    /** True when a refund should skip auto-approval and go to a human. */
    public function needsManualRefundReview(User $user): bool
    {
        if (! Setting::get('fraud.enabled')) {
            return false;
        }
        $spend = (float) $user->orders()->where('status', 'delivered')->sum('total_zig');
        $refunded = (float) $user->orders()->sum('refunded_zig');

        return $this->openRefunds($user) >= Setting::get('fraud.max_open_refund_requests')
            || ($spend > 0 && $refunded / $spend * 100 >= Setting::get('fraud.refund_rate_alert_pct'));
    }

    private function hasDelivered(User $user): bool
    {
        return $user->orders()->where('status', 'delivered')->exists();
    }

    private function openRefunds(User $user): int
    {
        return Refund::whereHas('order', fn ($q) => $q->where('user_id', $user->id))->where('status', 'requested')->count();
    }
}

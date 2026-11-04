<?php

namespace App\Services;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyTransaction;
use App\Models\Order;
use App\Models\Reward;
use App\Models\User;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class LoyaltyService
{
    public function __construct(private PushService $push) {}

    public function account(User $user): LoyaltyAccount
    {
        $account = LoyaltyAccount::firstOrCreate(['user_id' => $user->id]);

        // Freshly created rows don't carry DB defaults (points = 0) until reloaded.
        return $account->wasRecentlyCreated ? $account->refresh() : $account;
    }

    public function tierFor(int $lifetime): array
    {
        $tiers = config('zvino.loyalty.tiers');
        $current = 'Bronze';
        $next = null;
        foreach ($tiers as $name => $threshold) {
            if ($lifetime >= $threshold) {
                $current = $name;
            } elseif (! $next) {
                $next = ['name' => $name, 'points_needed' => $threshold - $lifetime, 'threshold' => $threshold];
            }
        }

        return ['tier' => $current, 'next' => $next];
    }

    public function earnForOrder(Order $order): void
    {
        if (! $order->user_id || LoyaltyTransaction::where('order_id', $order->id)->where('points', '>', 0)->exists()) {
            return;
        }

        $points = (int) floor($order->total_zig * config('zvino.loyalty.points_per_zig'));
        if ($points <= 0) {
            return;
        }

        $account = $this->account($order->user);
        $account->increment('points', $points);
        $account->increment('lifetime_points', $points);
        $account->update(['tier' => $this->tierFor($account->lifetime_points)['tier']]);

        LoyaltyTransaction::create(['user_id' => $order->user_id, 'order_id' => $order->id, 'points' => $points, 'reason' => 'Order '.$order->reference]);

        $this->push->toUser($order->user, 'points', "You earned $points points", "Thanks for ordering from {$order->vendor->name}!");
    }

    public function redeem(User $user, Reward $reward): LoyaltyAccount
    {
        return DB::transaction(function () use ($user, $reward) {
            $account = LoyaltyAccount::where('user_id', $user->id)->lockForUpdate()->firstOrCreate(['user_id' => $user->id]);

            if (! $reward->is_active || $account->points < $reward->points_cost) {
                throw ValidationException::withMessages(['reward' => 'Not enough points for this reward.']);
            }

            $account->decrement('points', $reward->points_cost);
            LoyaltyTransaction::create(['user_id' => $user->id, 'reward_id' => $reward->id, 'points' => -$reward->points_cost, 'reason' => 'Redeemed '.$reward->name]);

            if ($reward->type === 'wallet_credit') {
                WalletTransaction::create(['user_id' => $user->id, 'type' => 'credit', 'amount_zig' => $reward->config['amount_zig'] ?? 0, 'reason' => 'Reward: '.$reward->name]);
            }
            // TODO: free_item / free_delivery / discount rewards → issue a single-use promo code.

            return $account->fresh();
        });
    }
}

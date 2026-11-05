<?php

namespace App\Services;

use App\Models\GiftCard;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Referral;
use App\Models\Setting;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\Payments\PaynowGateway;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/** Referrals, gift cards, Zvino+ subscriptions and wallet top-ups. */
class GrowthService
{
    public function __construct(private PaynowGateway $paynow, private PushService $push) {}

    // ── Referrals ────────────────────────────────────────────────────

    public function referralCode(User $user): string
    {
        if (! $user->referral_code) {
            do {
                $code = strtoupper(Str::slug(Str::before($user->name ?: 'ZVINO', ' ')).Str::random(3));
                $code = substr(preg_replace('/[^A-Z0-9]/', '', $code), 0, 10);
            } while (User::where('referral_code', $code)->exists());
            $user->update(['referral_code' => $code]);
        }

        return $user->referral_code;
    }

    public function applyReferral(User $referee, string $code): Referral
    {
        abort_unless(Setting::get('loyalty.referral_enabled'), 422, 'Referrals are not active.');
        $referrer = User::where('referral_code', strtoupper($code))->first();

        if (! $referrer || $referrer->is($referee)) {
            throw ValidationException::withMessages(['code' => 'That referral code isn’t valid.']);
        }
        if ($referee->orders()->where('status', 'delivered')->exists() || Referral::where('referee_id', $referee->id)->exists()) {
            throw ValidationException::withMessages(['code' => 'Referral codes are for new customers only.']);
        }

        $referee->update(['referred_by' => $referrer->id]);

        return Referral::create(['referrer_id' => $referrer->id, 'referee_id' => $referee->id]);
    }

    public function onOrderDelivered(Order $order): void
    {
        $referral = $order->user_id ? Referral::where('referee_id', $order->user_id)->where('status', 'pending')->first() : null;
        if (! $referral || $order->subtotal_zig < Setting::get('loyalty.referral_min_order_zig')) {
            return;
        }

        DB::transaction(function () use ($referral, $order) {
            $referrerReward = (float) Setting::get('loyalty.referrer_reward_zig');
            $refereeReward = (float) Setting::get('loyalty.referee_reward_zig');
            $referral->referrer->walletTransactions()->create(['type' => 'credit', 'amount_zig' => $referrerReward, 'reason' => 'Referral reward']);
            $order->user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => $refereeReward, 'reason' => 'Welcome reward']);
            $referral->update(['status' => 'rewarded', 'reward_zig' => $referrerReward]);
            $this->push->toUser($referral->referrer, 'referral', 'You earned ZiG '.$referrerReward, 'A friend you invited just placed their first order.');
        });
    }

    // ── Wallet top-up, gift cards, subscriptions (all paid via Paynow) ─

    public function topUp(User $user, float $amount, string $method, ?string $phone): Payment
    {
        if ($amount < Setting::get('payments.wallet_topup_min_zig')) {
            throw ValidationException::withMessages(['amount' => 'Minimum top-up is ZiG '.Setting::get('payments.wallet_topup_min_zig').'.']);
        }

        return $this->charge($user, $amount, $method, $phone);
    }

    public function buyGiftCard(User $buyer, float $amount, array $recipient, string $method, ?string $phone): GiftCard
    {
        abort_unless(Setting::get('loyalty.gift_cards_enabled'), 422, 'Gift cards are not available.');
        $card = GiftCard::create([
            'amount_zig' => $amount, 'purchased_by' => $buyer->id,
            'recipient_name' => $recipient['name'] ?? null, 'recipient_phone' => $recipient['phone'] ?? null,
            'message' => $recipient['message'] ?? null, 'expires_at' => now()->addYear(),
        ]);

        if ($method === 'wallet') {
            $this->debitWallet($buyer, $amount, 'Gift card '.$card->code);
            $card->update(['status' => 'active']);
        } else {
            $this->charge($buyer, $amount, $method, $phone, $card);
        }

        return $card->fresh();
    }

    public function redeemGiftCard(User $user, string $code): GiftCard
    {
        return DB::transaction(function () use ($user, $code) {
            $card = GiftCard::where('code', strtoupper(trim($code)))->lockForUpdate()->first();
            if (! $card || $card->status !== 'active' || $card->expires_at?->isPast()) {
                throw ValidationException::withMessages(['code' => 'This gift card is invalid, used or expired.']);
            }
            $card->update(['status' => 'redeemed', 'redeemed_by' => $user->id, 'redeemed_at' => now()]);
            $user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => $card->amount_zig, 'reason' => 'Gift card '.$card->code]);

            return $card;
        });
    }

    public function subscribe(User $user, SubscriptionPlan $plan, string $method, ?string $phone): Subscription
    {
        abort_unless(Setting::get('loyalty.subscription_enabled') && $plan->is_active, 422, 'Zvino+ is not available.');
        $sub = Subscription::create(['user_id' => $user->id, 'subscription_plan_id' => $plan->id]);

        if ($method === 'wallet') {
            $this->debitWallet($user, $plan->price_zig, 'Zvino+ '.$plan->name);
            $this->activate($sub);
        } else {
            $this->charge($user, $plan->price_zig, $method, $phone, $sub);
        }

        return $sub->fresh('plan');
    }

    /** Called when a non-order payment is confirmed (webhook / poll / fake mode). */
    public function onPaymentPaid(Payment $payment): void
    {
        $payable = $payment->payable;
        match (true) {
            $payable instanceof GiftCard => $payable->update(['status' => 'active']),
            $payable instanceof Subscription => $this->activate($payable),
            $payable instanceof \App\Models\CateringRequest => app(CateringService::class)->onPaid($payment),
            $payable instanceof \App\Models\Driver => self::settleRemittance($payable, $payment),
            ($payment->raw['purpose'] ?? 'topup') === 'topup' => User::find($payment->raw['user_id'] ?? null)?->walletTransactions()->create([
                'type' => 'credit', 'amount_zig' => $payment->amount_zig, 'reason' => 'Wallet top-up',
            ]),
            default => \Illuminate\Support\Facades\Log::warning("Paid payment {$payment->id} has no handler", $payment->raw ?? []),
        };
    }

    /** Driver paid in COD cash they were holding: clear it from what they owe. */
    public static function settleRemittance(\App\Models\Driver $driver, Payment $payment): void
    {
        $driver->ledger()->create(['type' => 'cash_collected', 'amount_zig' => $payment->amount_zig, 'description' => 'Cash remitted via '.$payment->method]);
        $driver->ledger()->where('type', 'cash_collected')->whereNull('payout_id')->update(['payout_id' => 0]); // settled
    }

    private function activate(Subscription $sub): void
    {
        $months = $sub->plan->interval === 'year' ? 12 : 1;
        $start = $sub->current_period_end?->isFuture() ? $sub->current_period_end : now();
        $sub->update(['status' => 'active', 'current_period_end' => $start->copy()->addMonths($months)]);
    }

    private function charge(User $user, float $amount, string $method, ?string $phone, $payable = null): Payment
    {
        $payment = Payment::create([
            'provider' => 'paynow', 'method' => $method, 'phone' => $phone ?? $user->phone,
            'amount_zig' => $amount, 'payable_type' => $payable?->getMorphClass(), 'payable_id' => $payable?->getKey(),
            'raw' => ['user_id' => $user->id, 'reference' => 'ZVW-'.strtoupper(Str::random(8))],
        ]);
        $this->paynow->initiate($payment);

        if ($this->paynow->fake()) {
            $payment->update(['status' => 'paid']);
            $this->onPaymentPaid($payment->fresh());
        }

        return $payment->fresh();
    }

    private function debitWallet(User $user, float $amount, string $reason): void
    {
        if ($user->walletBalance() < $amount) {
            throw ValidationException::withMessages(['payment_method' => 'Insufficient wallet balance.']);
        }
        $user->walletTransactions()->create(['type' => 'debit', 'amount_zig' => $amount, 'reason' => $reason]);
    }
}

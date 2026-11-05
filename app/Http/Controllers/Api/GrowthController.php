<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GiftCard;
use App\Models\Setting;
use App\Models\SubscriptionPlan;
use App\Services\GrowthService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Customer: wallet, gift cards, Zvino+ and referrals. */
class GrowthController extends Controller
{
    public function __construct(private GrowthService $growth) {}

    public function wallet(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'balance' => Money::both($user->walletBalance()),
            'transactions' => $user->walletTransactions()->latest()->limit(50)->get(['id', 'type', 'amount_zig', 'reason', 'created_at']),
            'topup_min_zig' => Setting::get('payments.wallet_topup_min_zig'),
        ]);
    }

    public function topUp(Request $request)
    {
        $data = $request->validate(['amount_zig' => ['required', 'numeric'], 'method' => ['required', 'in:ecocash,onemoney,innbucks,card'], 'phone' => ['nullable', 'string']]);
        $payment = $this->growth->topUp($request->user(), $data['amount_zig'], $data['method'], $data['phone'] ?? null);

        return response()->json($payment->only('id', 'status', 'method', 'redirect_url'), 201);
    }

    public function giftCardOptions()
    {
        return response()->json(['enabled' => Setting::get('loyalty.gift_cards_enabled'), 'amounts' => Setting::get('loyalty.gift_card_amounts')]);
    }

    /** Also powers "Gift a meal to any phone number". */
    public function buyGiftCard(Request $request)
    {
        $data = $request->validate([
            'amount_zig' => ['required', 'numeric', Rule::in(Setting::get('loyalty.gift_card_amounts'))],
            'recipient_name' => ['nullable', 'string', 'max:80'],
            'recipient_phone' => ['nullable', 'string', 'max:20'],
            'message' => ['nullable', 'string', 'max:200'],
            'method' => ['required', 'in:ecocash,onemoney,innbucks,card,wallet'],
            'phone' => ['nullable', 'string'],
        ]);
        $card = $this->growth->buyGiftCard($request->user(), $data['amount_zig'], ['name' => $data['recipient_name'] ?? null, 'phone' => $data['recipient_phone'] ?? null, 'message' => $data['message'] ?? null], $data['method'], $data['phone'] ?? null);

        // TODO (SMS provider): text the code to recipient_phone once SMS is configured.
        return response()->json($card->only('id', 'code', 'amount_zig', 'status', 'expires_at'), 201);
    }

    public function myGiftCards(Request $request)
    {
        return response()->json(GiftCard::where('purchased_by', $request->user()->id)->latest()->get());
    }

    public function redeemGiftCard(Request $request)
    {
        $card = $this->growth->redeemGiftCard($request->user(), $request->validate(['code' => ['required', 'string']])['code']);

        return response()->json(['credited' => Money::both($card->amount_zig), 'balance' => Money::both($request->user()->walletBalance())]);
    }

    public function plans(Request $request)
    {
        return response()->json([
            'enabled' => Setting::get('loyalty.subscription_enabled'),
            'plans' => SubscriptionPlan::where('is_active', true)->get(),
            'current' => $request->user()?->activeSubscription(),
        ]);
    }

    public function subscribe(Request $request)
    {
        $data = $request->validate(['plan_id' => ['required', 'exists:subscription_plans,id'], 'method' => ['required', 'in:ecocash,onemoney,innbucks,card,wallet'], 'phone' => ['nullable', 'string']]);
        $sub = $this->growth->subscribe($request->user(), SubscriptionPlan::findOrFail($data['plan_id']), $data['method'], $data['phone'] ?? null);

        return response()->json($sub, 201);
    }

    public function cancelSubscription(Request $request)
    {
        $sub = $request->user()->activeSubscription();
        abort_unless($sub, 404);
        $sub->update(['status' => 'cancelled', 'auto_renew' => false]);

        return response()->json($sub);
    }

    public function referral(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'enabled' => Setting::get('loyalty.referral_enabled'),
            'code' => $this->growth->referralCode($user),
            'you_get' => Money::both((float) Setting::get('loyalty.referrer_reward_zig')),
            'friend_gets' => Money::both((float) Setting::get('loyalty.referee_reward_zig')),
            'min_order' => Money::both((float) Setting::get('loyalty.referral_min_order_zig')),
            'invited' => \App\Models\Referral::where('referrer_id', $user->id)->count(),
            'rewarded' => \App\Models\Referral::where('referrer_id', $user->id)->where('status', 'rewarded')->count(),
        ]);
    }

    public function applyReferral(Request $request)
    {
        $this->growth->applyReferral($request->user(), $request->validate(['code' => ['required', 'string', 'max:20']])['code']);

        return response()->json(['ok' => true, 'message' => 'Code applied. Your reward arrives after your first order.']);
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Models\LoyaltyAccount;
use App\Models\LoyaltyRule;
use App\Models\PromoCode;
use App\Models\Reward;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class RewardsPromosController extends AdminController
{
    public function index()
    {
        return Inertia::render('admin/rewards-promos', [
            'rules' => LoyaltyRule::orderBy('id')->get(),
            'rewards' => Reward::orderBy('points_cost')->get(),
            'promos' => PromoCode::with('vendor:id,name')->latest()->get(),
            'tiers' => config('zvino.loyalty.tiers'),
            'pointsPerZig' => config('zvino.loyalty.points_per_zig'),
            'members' => LoyaltyAccount::selectRaw('tier, COUNT(*) as c')->groupBy('tier')->pluck('c', 'tier'),
        ]);
    }

    public function saveReward(Request $request, ?Reward $reward = null)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'points_cost' => ['required', 'integer', 'min:1'],
            'type' => ['required', 'in:wallet_credit,free_item,free_delivery,discount'],
            'config' => ['nullable', 'array'],
            'is_active' => ['boolean'],
        ]);
        $reward?->exists ? $reward->update($data) : Reward::create($data);

        return back()->with('success', 'Reward saved.');
    }

    public function savePromo(Request $request, ?PromoCode $promo = null)
    {
        $data = $request->validate([
            'code' => ['required', 'alpha_dash', 'max:40', Rule::unique('promo_codes', 'code')->ignore($promo?->id)],
            'type' => ['required', 'in:percent,fixed,free_delivery'],
            'value' => ['required_unless:type,free_delivery', 'nullable', 'numeric', 'min:0'],
            'min_order_zig' => ['nullable', 'numeric', 'min:0'],
            'max_uses' => ['nullable', 'integer', 'min:1'],
            'vendor_id' => ['nullable', 'exists:vendors,id'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'is_active' => ['boolean'],
        ]);
        $data['code'] = strtoupper($data['code']);
        $data['value'] ??= 0;
        $data['min_order_zig'] ??= 0;

        $promo?->exists ? $promo->update($data) : PromoCode::create($data);

        return back()->with('success', 'Promo code saved.');
    }

    public function togglePromo(PromoCode $promo)
    {
        $promo->update(['is_active' => ! $promo->is_active]);

        return back();
    }

    public function toggleReward(Reward $reward)
    {
        $reward->update(['is_active' => ! $reward->is_active]);

        return back();
    }
}

<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Http\Resources\VendorResource;
use App\Models\GiftCard;
use App\Models\Order;
use App\Models\Referral;
use App\Models\Reward;
use App\Models\Setting;
use App\Models\SubscriptionPlan;
use App\Models\Vendor;
use App\Services\GrowthService;
use App\Services\LoyaltyService;
use App\Services\OrderService;
use App\Support\Money;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AccountController extends Controller
{
    public function index(Request $request, LoyaltyService $loyalty, GrowthService $growth)
    {
        $user = $request->user();
        $account = $loyalty->account($user);

        return Inertia::render('site/account', [
            'seo' => ['title' => 'My account | Zvino'],
            'tab' => $request->query('tab', 'orders'),
            'welcome' => $request->boolean('welcome'),
            'profile' => $user->only('id', 'name', 'email', 'phone', 'locale', 'marketing_opt_in'),
            'orders' => OrderResource::collection($user->orders()->with('vendor', 'items', 'review')->where('status', '!=', 'pending_payment')->latest()->limit(30)->get()),
            'addresses' => $user->addresses()->orderByDesc('is_default')->get(),
            'wallet' => ['balance' => Money::both($user->walletBalance()), 'transactions' => $user->walletTransactions()->latest()->limit(20)->get(['id', 'type', 'amount_zig', 'reason', 'created_at'])],
            'loyalty' => ['points' => $account->points, 'lifetime' => $account->lifetime_points] + $loyalty->tierFor($account->lifetime_points),
            'rewards' => Reward::where('is_active', true)->orderBy('points_cost')->get(['id', 'name', 'description', 'points_cost', 'type']),
            'favorites' => VendorResource::collection($user->favorites()->where('status', 'active')->get())->resolve(),
            'referral' => [
                'code' => $growth->referralCode($user),
                'you_get' => Setting::get('loyalty.referrer_reward_zig'),
                'friend_gets' => Setting::get('loyalty.referee_reward_zig'),
                'invited' => Referral::where('referrer_id', $user->id)->count(),
            ],
            'giftCards' => GiftCard::where('purchased_by', $user->id)->latest()->get(['id', 'code', 'amount_zig', 'status', 'recipient_name', 'recipient_phone', 'created_at']),
            'plus' => $user->activeSubscription()?->load('plan'),
            'cities' => Setting::get('general.cities'),
        ]);
    }

    public function order(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);
        $order->load('vendor', 'items', 'address', 'driver.user', 'review');

        return Inertia::render('site/order', [
            'seo' => ['title' => "Order {$order->reference} | Zvino"],
            'order' => array_merge((new OrderResource($order))->resolve(), [
                'address' => $order->address?->only('line1', 'landmark', 'suburb', 'city', 'lat', 'lng'),
                'driver' => $order->driver ? ['name' => $order->driver->user->name, 'phone' => $order->driver->user->phone, 'vehicle' => $order->driver->vehicle_type, 'plate' => $order->driver->vehicle_plate, 'rating' => $order->driver->rating, 'lat' => $order->driver->lat, 'lng' => $order->driver->lng] : null,
                'store' => $order->vendor->only('name', 'slug', 'phone', 'lat', 'lng', 'logo_path', 'address'),
                'delivery_pin' => $order->delivery_pin,
                'estimated_delivery_at' => $order->estimated_delivery_at,
                'scheduled_for' => $order->scheduled_for,
                'can_cancel' => in_array($order->status, ['pending_payment', 'scheduled', 'placed'], true),
                'review' => $order->review?->only('vendor_rating', 'driver_rating', 'comment'),
                'tip_zig' => $order->tip_zig,
                'dropoff' => $order->dropoff,
            ]),
            'mapsKey' => Setting::get('integrations.google_maps_browser_key'),
            'support' => ['phone' => Setting::get('general.support_phone'), 'whatsapp' => Setting::get('general.support_whatsapp')],
        ]);
    }

    /** Lightweight poll for the tracking page (every 10 s). */
    public function orderStatus(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);
        $order->load('driver.user');

        return response()->json([
            'status' => $order->status, 'payment_status' => $order->payment_status, 'status_history' => $order->status_history, 'estimated_delivery_at' => $order->estimated_delivery_at,
            'driver' => $order->driver ? ['name' => $order->driver->user->name, 'phone' => $order->driver->user->phone, 'vehicle' => $order->driver->vehicle_type, 'plate' => $order->driver->vehicle_plate, 'rating' => $order->driver->rating, 'lat' => $order->driver->lat, 'lng' => $order->driver->lng] : null,
        ]);
    }

    public function cancel(Request $request, Order $order, OrderService $orders)
    {
        abort_unless($order->user_id === $request->user()->id, 404);
        $orders->cancel($order, 'customer', $request->validate(['reason' => ['required', 'string', 'max:200']])['reason']);

        return back()->with('success', 'Order cancelled. Any payment has been returned to your Zvino wallet.');
    }

    public function review(Request $request, Order $order)
    {
        // Reuse the API rules so reviews behave identically everywhere.
        app(\App\Http\Controllers\Api\EngagementController::class)->review($request, $order);

        return back()->with('success', 'Thanks for your review!');
    }

    public function reorder(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        return redirect()->route('site.store', $order->vendor->slug)->with('reorder', $order->items->map(fn ($i) => ['item_id' => $i->item_id, 'quantity' => $i->quantity, 'variant' => $i->options['variant'] ?? null, 'modifiers' => $i->options['modifiers'] ?? []]));
    }

    public function updateProfile(Request $request)
    {
        $request->user()->update($request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'nullable', 'email', 'unique:users,email,'.$request->user()->id],
            'locale' => ['sometimes', 'in:en,sn,nd'],
            'marketing_opt_in' => ['sometimes', 'boolean'],
        ]));

        return back()->with('success', 'Profile saved.');
    }

    public function storeAddress(Request $request)
    {
        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:40'], 'line1' => ['required', 'string', 'max:200'], 'landmark' => ['nullable', 'string', 'max:200'],
            'suburb' => ['nullable', 'string', 'max:100'], 'city' => ['required', 'string'], 'lat' => ['nullable', 'numeric'], 'lng' => ['nullable', 'numeric'],
            'instructions' => ['nullable', 'string', 'max:300'], 'is_default' => ['boolean'],
        ]);
        $user = $request->user();
        if (! isset($data['lat']) && ($geo = $this->geocode("{$data['line1']}, ".($data['suburb'] ?? '').", {$data['city']}"))) {
            $data += $geo;
        }
        if (($data['is_default'] ?? false) || ! $user->addresses()->exists()) {
            $user->addresses()->update(['is_default' => false]);
            $data['is_default'] = true;
        }
        $address = $user->addresses()->create($data + ['label' => $data['label'] ?? 'Home']);

        return back()->with('success', 'Address saved.')->with('address_id', $address->id);
    }

    public function destroyAddress(Request $request, int $id)
    {
        $request->user()->addresses()->whereKey($id)->delete();

        return back()->with('success', 'Address removed.');
    }

    public function toggleFavorite(Request $request, Vendor $vendor)
    {
        $result = $request->user()->favorites()->toggle($vendor->id);

        return back()->with('success', empty($result['attached']) ? 'Removed from favourites.' : 'Saved to favourites ♥');
    }

    /** Start a group order and land on the shareable group page. */
    public function startGroup(Request $request, Vendor $vendor)
    {
        abort_unless(Setting::get('orders.allow_group_orders'), 422, 'Group orders are not available.');
        $group = \App\Models\GroupOrder::create(['host_id' => $request->user()->id, 'vendor_id' => $vendor->id, 'deadline_at' => now()->addHour()]);

        return redirect()->route('site.group', $group->code)->with('success', 'Group order started. Share the link with friends.');
    }

    public function redeemReward(Request $request, LoyaltyService $loyalty)
    {
        $loyalty->redeem($request->user(), Reward::findOrFail($request->validate(['reward_id' => ['required', 'exists:rewards,id']])['reward_id']));

        return back()->with('success', 'Reward redeemed!');
    }

    public function buyGiftCard(Request $request, GrowthService $growth)
    {
        $data = $request->validate([
            'amount_zig' => ['required', 'numeric', \Illuminate\Validation\Rule::in(Setting::get('loyalty.gift_card_amounts'))],
            'recipient_name' => ['nullable', 'string', 'max:80'], 'recipient_phone' => ['nullable', 'string', 'max:20'], 'message' => ['nullable', 'string', 'max:200'],
            'method' => ['required', 'in:ecocash,onemoney,innbucks,card,wallet'], 'phone' => ['nullable', 'string'],
        ]);
        $card = $growth->buyGiftCard($request->user(), $data['amount_zig'], ['name' => $data['recipient_name'] ?? null, 'phone' => $data['recipient_phone'] ?? null, 'message' => $data['message'] ?? null], $data['method'], $data['phone'] ?? null);

        return redirect('/account?tab=gifts')->with('success', $card->status === 'active' ? "Gift card {$card->code} is ready to share." : 'Approve the payment on your phone to activate the gift card.');
    }

    public function redeemGiftCard(Request $request, GrowthService $growth)
    {
        $card = $growth->redeemGiftCard($request->user(), $request->validate(['code' => ['required', 'string']])['code']);

        return back()->with('success', 'ZiG '.number_format($card->amount_zig, 2).' added to your wallet.');
    }

    public function subscribe(Request $request, GrowthService $growth)
    {
        $data = $request->validate(['plan_id' => ['required', 'exists:subscription_plans,id'], 'method' => ['required', 'in:ecocash,onemoney,innbucks,card,wallet'], 'phone' => ['nullable', 'string']]);
        $growth->subscribe($request->user(), SubscriptionPlan::findOrFail($data['plan_id']), $data['method'], $data['phone'] ?? null);

        return redirect('/account?tab=plus')->with('success', 'Welcome to Zvino+! 🎉');
    }

    public function applyReferral(Request $request, GrowthService $growth)
    {
        $growth->applyReferral($request->user(), $request->validate(['code' => ['required', 'string', 'max:20']])['code']);

        return back()->with('success', 'Referral applied. Your reward arrives after your first order.');
    }

    /** Server-side geocode with the Google key (Settings → Integrations); silently skipped if unset. */
    private function geocode(string $query): ?array
    {
        $key = Setting::get('integrations.google_maps_key');
        if (! $key) {
            return null;
        }
        try {
            $r = \Illuminate\Support\Facades\Http::timeout(6)->get('https://maps.googleapis.com/maps/api/geocode/json', ['address' => $query.', Zimbabwe', 'key' => $key])->json('results.0.geometry.location');

            return $r ? ['lat' => $r['lat'], 'lng' => $r['lng']] : null;
        } catch (\Throwable) {
            return null;
        }
    }
}

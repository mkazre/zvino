<?php

namespace App\Http\Controllers\Api\Merchant;

use App\Http\Controllers\Controller;
use App\Http\Resources\ItemResource;
use App\Http\Resources\OrderResource;
use App\Models\AuditLog;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Review;
use App\Models\Vendor;
use App\Services\OrderService;
use App\Services\StoreAvailability;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Endpoints for the Zvino Merchant app (prefix /api/merchant).
 * Store manager mode uses everything; Kitchen mode uses orders + stage; POS mode uses /admin POS routes' API twins.
 */
class MerchantController extends Controller
{
    public function __construct(private OrderService $orders, private StoreAvailability $availability) {}

    private function store(Request $request): Vendor
    {
        $user = $request->user();
        abort_unless(in_array($user->role, \App\Models\User::STORE_ROLES, true) && $user->vendor_id, 403, 'Merchant app is for store staff.');

        return $user->vendor;
    }

    private function managerOnly(Request $request): Vendor
    {
        $vendor = $this->store($request);
        abort_unless($request->user()->role === 'vendor_manager', 403, 'Only the store manager can change this.');

        return $vendor;
    }

    private function own(Request $request, Order $order): void
    {
        abort_unless($order->vendor_id === $this->store($request)->id, 404);
    }

    // ── Store ────────────────────────────────────────────────────────

    public function me(Request $request)
    {
        $v = $this->store($request);
        $today = Order::where('vendor_id', $v->id)->where('created_at', '>=', now()->startOfDay())->whereNotIn('status', ['pending_payment', 'cancelled', 'rejected']);

        return response()->json([
            'role' => $request->user()->role,
            'store' => $v->only('id', 'name', 'slug', 'logo_path', 'is_busy', 'busy_extra_minutes', 'power_out', 'power_out_extra_minutes', 'auto_accept', 'paused_until', 'prep_minutes', 'offers_delivery', 'offers_pickup', 'rating', 'rating_count'),
            'availability' => $this->availability->status($v),
            'today' => [
                'orders' => (clone $today)->count(),
                'sales' => Money::both((float) (clone $today)->sum('subtotal_zig')),
                'avg_prep_minutes' => (int) round((float) Order::where('vendor_id', $v->id)->whereNotNull('ready_at')->where('created_at', '>=', now()->subDays(7))
                    ->get()->avg(fn ($o) => $o->accepted_at ? $o->accepted_at->diffInMinutes($o->ready_at) : null)),
            ],
            'incoming' => Order::where('vendor_id', $v->id)->where('status', 'placed')->count(),
        ]);
    }

    public function updateStore(Request $request)
    {
        $v = $this->managerOnly($request);
        $data = $request->validate([
            'is_busy' => ['boolean'],
            'busy_extra_minutes' => ['integer', 'between:5,60'],
            'power_out' => ['boolean'],
            'power_out_extra_minutes' => ['integer', 'between:0,60'],
            'auto_accept' => ['boolean'],
            'pause_minutes' => ['nullable', 'integer', 'between:0,1440'], // 0 = resume
            'prep_minutes' => ['integer', 'between:5,120'],
            'offers_delivery' => ['boolean'],
            'offers_pickup' => ['boolean'],
            'accepts_catering' => ['boolean'],
        ]);

        if (array_key_exists('pause_minutes', $data)) {
            $data['paused_until'] = $data['pause_minutes'] ? now()->addMinutes($data['pause_minutes']) : null;
            unset($data['pause_minutes']);
        }
        $v->update($data);
        AuditLog::record('store.updated', $v, $data);

        return $this->me($request);
    }

    public function hours(Request $request)
    {
        $v = $this->store($request);

        return response()->json(['hours' => $v->hours, 'closures' => $v->closures()->where('date', '>=', today())->orderBy('date')->get()]);
    }

    public function saveHours(Request $request)
    {
        $v = $this->managerOnly($request);
        $data = $request->validate([
            'hours' => ['present', 'array'],
            'hours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'hours.*.opens_at' => ['required', 'date_format:H:i'],
            'hours.*.closes_at' => ['required', 'date_format:H:i'],
            'closures' => ['array'],
            'closures.*.date' => ['required', 'date', 'after_or_equal:today'],
            'closures.*.reason' => ['nullable', 'string', 'max:100'],
        ]);

        DB::transaction(function () use ($v, $data) {
            $v->hours()->delete();
            foreach ($data['hours'] as $h) {
                $v->hours()->create(['weekday' => $h['weekday'], 'opens_at' => $h['opens_at'].':00', 'closes_at' => $h['closes_at'].':00']);
            }
            if (isset($data['closures'])) {
                $v->closures()->where('date', '>=', today())->delete();
                foreach ($data['closures'] as $c) {
                    $v->closures()->create($c);
                }
            }
        });

        return $this->hours($request);
    }

    // ── Orders ───────────────────────────────────────────────────────

    public function orders(Request $request)
    {
        $v = $this->store($request);
        $tab = $request->query('tab', 'active');

        $q = Order::where('vendor_id', $v->id)->with('items', 'user', 'driver.user')
            ->when($tab === 'incoming', fn ($q) => $q->where('status', 'placed'))
            ->when($tab === 'active', fn ($q) => $q->whereIn('status', ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving']))
            ->when($tab === 'scheduled', fn ($q) => $q->where('status', 'scheduled'))
            ->when($tab === 'done', fn ($q) => $q->whereIn('status', ['delivered', 'cancelled', 'rejected'])->where('created_at', '>=', now()->subDays(2)))
            ->orderBy($tab === 'done' ? 'updated_at' : 'created_at', $tab === 'done' ? 'desc' : 'asc');

        return OrderResource::collection($q->limit(100)->get());
    }

    public function accept(Request $request, Order $order)
    {
        $this->own($request, $order);
        $data = $request->validate(['prep_minutes' => ['required', 'integer', 'between:5,120']]);

        return new OrderResource($this->orders->accept($order, $data['prep_minutes'])->load('items'));
    }

    public function reject(Request $request, Order $order)
    {
        $this->own($request, $order);
        $data = $request->validate(['reason' => ['required', 'string', 'in:too_busy,item_unavailable,closing_soon,power_outage,other'], 'note' => ['nullable', 'string', 'max:200']]);

        return new OrderResource($this->orders->reject($order, str_replace('_', ' ', $data['reason']).(! empty($data['note']) ? ": {$data['note']}" : '')));
    }

    /** Kitchen mode: new → cooking → ready. */
    public function advance(Request $request, Order $order)
    {
        $this->own($request, $order);

        return new OrderResource($this->orders->advanceKitchen($order)->load('items'));
    }

    /** Pickup / dine-in handed over at the counter. */
    public function handOver(Request $request, Order $order)
    {
        $this->own($request, $order);
        abort_if($order->fulfilment === 'delivery', 422, 'Delivery orders are completed by the driver.');
        if ($order->status !== 'ready') {
            $order = $this->orders->advanceKitchen($order);
            $order = $order->status === 'ready' ? $order : $this->orders->advanceKitchen($order);
        }

        return new OrderResource($this->orders->setStatus($order->fresh(), 'delivered'));
    }

    /** Ask for more time (updates the customer's ETA). */
    public function delay(Request $request, Order $order)
    {
        $this->own($request, $order);
        $data = $request->validate(['minutes' => ['required', 'integer', 'between:5,45']]);
        $order->update([
            'prep_minutes' => ($order->prep_minutes ?? 0) + $data['minutes'],
            'estimated_delivery_at' => ($order->estimated_delivery_at ?? now())->addMinutes($data['minutes']),
        ]);
        \App\Events\OrderUpdated::dispatch($order);

        return new OrderResource($order);
    }

    // ── Menu ─────────────────────────────────────────────────────────

    public function menu(Request $request)
    {
        $v = $this->store($request);

        return response()->json([
            'power_out' => $v->power_out,
            'categories' => $v->categories()->with('items')->get()->map(fn ($c) => [
                'id' => $c->id, 'name' => $c->name,
                'items' => ItemResource::collection($c->items),
            ]),
        ]);
    }

    /** Quick stock control: off now / off until tomorrow / back on. */
    public function setAvailability(Request $request, Item $item)
    {
        abort_unless($item->vendor_id === $this->store($request)->id, 404);
        $data = $request->validate(['state' => ['required', 'in:on,off,off_today'], 'needs_power' => ['boolean']]);

        $item->update(match ($data['state']) {
            'on' => ['is_available' => true, 'unavailable_until' => null],
            'off' => ['is_available' => false, 'unavailable_until' => null],
            'off_today' => ['is_available' => true, 'unavailable_until' => now()->addDay()->startOfDay()->addHours(6)],
        } + (isset($data['needs_power']) ? ['needs_power' => $data['needs_power']] : []));

        return new ItemResource($item->fresh());
    }

    /** POS mode in the merchant app: counter sale into the same orders table (source = pos). */
    public function posSale(Request $request, \App\Services\Payments\PaynowGateway $paynow)
    {
        $vendor = $this->store($request);
        abort_unless(in_array($request->user()->role, ['vendor_manager', 'cashier'], true), 403, 'POS is for managers and cashiers.');
        $data = $request->validate([
            'method' => ['required', 'in:cash,card,ecocash,onemoney,innbucks,qr'],
            'phone' => ['required_if:method,ecocash,onemoney,innbucks', 'nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', \Illuminate\Validation\Rule::exists('items', 'id')->where('vendor_id', $vendor->id)],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.variant' => ['nullable', 'string'],
            'lines.*.modifiers' => ['nullable', 'array'],
        ]);

        abort_if($data['method'] === 'qr' && ! \App\Models\Setting::get('payments.counter_qr'), 422, 'Counter QR payments are switched off.');
        [$order, $payment] = $this->orders->placePos($request->user(), $vendor, $data['lines'], $data['method'], $data['phone'] ?? null);
        if ($payment && $paynow->fake() && $data['method'] !== 'qr') {
            $this->orders->markPaid($payment);
        }

        return response()->json([
            'reference' => $order->reference, 'total' => Money::both($order->total_zig), 'payment_status' => $order->fresh()->payment_status,
            'payment_id' => $payment?->id,
            'qr_url' => $data['method'] === 'qr' ? $payment?->fresh()->redirect_url : null,
        ], 201);
    }

    // ── Money & feedback ─────────────────────────────────────────────

    public function earnings(Request $request)
    {
        $v = $this->store($request);
        $from = match ($request->query('period', 'week')) { 'today' => now()->startOfDay(), 'month' => now()->startOfMonth(), default => now()->startOfWeek() };
        $entries = $v->ledger()->where('created_at', '>=', $from)->get();

        return response()->json([
            'sales' => Money::both($entries->where('type', 'earning')->sum('amount_zig')),
            'commission' => Money::both(-$entries->where('type', 'commission')->sum('amount_zig')),
            'refunds' => Money::both(-$entries->where('type', 'refund')->sum('amount_zig')),
            'net' => Money::both($entries->sum('amount_zig')),
            'balance' => Money::both($v->balance()),
            'payouts' => \App\Models\Payout::where('account_type', $v->getMorphClass())->where('account_id', $v->id)->latest()->limit(12)->get(),
            'available_now' => Money::both(max(0, (float) $v->ledger()->whereNull('payout_id')->sum('amount_zig'))),
            'instant_payout' => \App\Models\Setting::get('payments.merchant_instant_payout') ? ['fee_pct' => (float) \App\Models\Setting::get('payments.instant_cashout_fee_pct'), 'min' => Money::both((float) \App\Models\Setting::get('payments.instant_cashout_min_zig'))] : null,
        ]);
    }

    /** Same-day payout (#33): sweep the store's unpaid balance into a payout ops sends today. */
    public function payoutNow(Request $request, \App\Services\PayoutService $payouts)
    {
        $payout = $payouts->instantCashOut($this->managerOnly($request));

        return response()->json(['payout_id' => $payout->id, 'amount' => Money::both($payout->amount_zig), 'fee' => Money::both($payout->fee_zig), 'message' => 'Payout requested. It will be sent today.'], 201);
    }

    /** Store staff view the prescription photo before accepting a pharmacy order. */
    public function prescription(Request $request, Order $order)
    {
        $this->own($request, $order);
        abort_unless($order->prescription_path && \Illuminate\Support\Facades\Storage::disk('local')->exists($order->prescription_path), 404);

        return \Illuminate\Support\Facades\Storage::disk('local')->response($order->prescription_path);
    }

    /** Counter QR payments: the till polls until the customer has paid on their phone. */
    public function paymentStatus(Request $request, \App\Models\Payment $payment, \App\Services\Payments\PaynowGateway $paynow)
    {
        abort_unless($payment->order && $payment->order->vendor_id === $this->store($request)->id, 404);
        if ($payment->status === 'pending' && ! $paynow->fake() && ($status = $paynow->poll($payment))) {
            $status === 'paid' ? $this->orders->markPaid($payment) : ($status !== 'pending' ? $this->orders->markFailed($payment, $status) : null);
        }

        return response()->json($payment->fresh()->only('id', 'status', 'method', 'amount_zig'));
    }

    // ── Catering (#9) ────────────────────────────────────────────────

    public function catering(Request $request, \App\Services\CateringService $svc)
    {
        $v = $this->store($request);

        return response()->json([
            'accepts_catering' => (bool) $v->accepts_catering,
            'requests' => \App\Models\CateringRequest::with('user', 'vendor')->where('vendor_id', $v->id)->whereNotIn('status', ['cancelled', 'declined'])
                ->where('event_at', '>=', now()->subDays(7))->orderBy('event_at')->get()->map(fn ($c) => $svc->present($c)),
        ]);
    }

    public function cateringAction(Request $request, \App\Models\CateringRequest $catering, \App\Services\CateringService $svc)
    {
        abort_unless($catering->vendor_id === $this->managerOnly($request)->id, 404);
        $data = $request->validate([
            'action' => ['required', 'in:quote,complete,decline'],
            'quote_zig' => ['required_if:action,quote', 'nullable', 'numeric', 'min:1'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $c = match ($data['action']) {
            'quote' => $svc->quote($catering, (float) $data['quote_zig'], $data['note'] ?? null),
            'complete' => $svc->complete($catering),
            'decline' => $svc->close($catering, 'store', $data['note'] ?? 'The store can’t cater this event.'),
        };

        return response()->json($svc->present($c->load('user', 'vendor')));
    }

    // ── Self-serve promotions (#33) ──────────────────────────────────

    public function promos(Request $request)
    {
        $v = $this->store($request);
        $promos = \App\Models\PromoCode::where('vendor_id', $v->id)->latest()->get();
        $redemptions = Order::where('vendor_id', $v->id)->whereIn('promo_code_id', $promos->pluck('id'))->where('status', 'delivered')
            ->selectRaw('promo_code_id, COUNT(*) as orders, SUM(subtotal_zig) as sales, SUM(discount_zig) as cost')->groupBy('promo_code_id')->get()->keyBy('promo_code_id');

        return response()->json([
            'enabled' => (bool) \App\Models\Setting::get('payments.merchant_promos'),
            'max_pct' => (float) \App\Models\Setting::get('payments.merchant_promo_max_pct'),
            'promos' => $promos->map(fn ($p) => $p->only('id', 'code', 'title', 'type', 'value', 'min_order_zig', 'max_uses', 'used_count', 'starts_at', 'ends_at', 'is_active', 'item_id', 'buy_qty', 'days', 'start_time', 'end_time', 'auto_apply') + [
                'headline' => $p->headline(),
                'orders' => (int) ($redemptions[$p->id]->orders ?? 0),
                'sales' => Money::both((float) ($redemptions[$p->id]->sales ?? 0)),
                'cost' => Money::both((float) ($redemptions[$p->id]->cost ?? 0)),
            ]),
        ]);
    }

    public function savePromo(Request $request, ?\App\Models\PromoCode $promo = null)
    {
        $v = $this->managerOnly($request);
        abort_unless(\App\Models\Setting::get('payments.merchant_promos'), 403, 'Store promotions are turned off by Zvino.');
        abort_if($promo && $promo->vendor_id !== $v->id, 404);

        $data = $request->validate([
            'code' => [$promo ? 'sometimes' : 'required', 'string', 'alpha_num', 'min:3', 'max:20', \Illuminate\Validation\Rule::unique('promo_codes', 'code')->ignore($promo?->id)],
            'title' => ['nullable', 'string', 'max:80'],
            'type' => [$promo ? 'sometimes' : 'required', 'in:percent,fixed,free_delivery,bogo'],
            'item_id' => ['nullable', 'required_if:type,bogo', 'integer', 'exists:items,id'],
            'buy_qty' => ['nullable', 'integer', 'between:1,5'],
            'days' => ['nullable', 'array'],
            'days.*' => ['integer', 'between:1,7'],
            'start_time' => ['nullable', 'date_format:H:i', 'required_with:end_time'],
            'end_time' => ['nullable', 'date_format:H:i', 'required_with:start_time'],
            'auto_apply' => ['sometimes', 'boolean'],
            'value' => ['nullable', 'numeric', 'min:0'],
            'min_order_zig' => ['nullable', 'numeric', 'min:0'],
            'max_uses' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $type = $data['type'] ?? $promo?->type;
        if ($type === 'percent' && ($data['value'] ?? $promo?->value ?? 0) > \App\Models\Setting::get('payments.merchant_promo_max_pct')) {
            throw \Illuminate\Validation\ValidationException::withMessages(['value' => 'The largest discount allowed is '.\App\Models\Setting::get('payments.merchant_promo_max_pct').'%.']);
        }
        if (isset($data['code'])) {
            $data['code'] = strtoupper($data['code']);
        }
        abort_if(! empty($data['item_id']) && ! $v->items()->whereKey($data['item_id'])->exists(), 422, 'Choose an item from your own menu.');

        $promo = $promo
            ? tap($promo)->update($data)
            : \App\Models\PromoCode::create($data + ['vendor_id' => $v->id, 'created_by' => $request->user()->id, 'value' => $data['value'] ?? 0]);
        AuditLog::record('promo.store_saved', $promo, $data);

        return response()->json($promo, $promo->wasRecentlyCreated ? 201 : 200);
    }

    public function reviews(Request $request)
    {
        $v = $this->store($request);

        return response()->json(Review::where('vendor_id', $v->id)->where('is_hidden', false)->with('user:id,name')->latest()->paginate(20));
    }

    public function reply(Request $request, Review $review)
    {
        abort_unless($review->vendor_id === $this->managerOnly($request)->id, 404);
        $review->update($request->validate(['vendor_reply' => ['required', 'string', 'max:500']]));

        return response()->json($review);
    }

    /** Menu insights: best sellers and slow movers over 30 days. */
    public function insights(Request $request)
    {
        $v = $this->store($request);
        $rows = OrderItem::query()
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->where('orders.vendor_id', $v->id)->where('orders.status', 'delivered')
            ->where('orders.created_at', '>=', now()->subDays(30))
            ->selectRaw('order_items.item_id, order_items.name, SUM(order_items.quantity) as qty, SUM(order_items.line_total_zig) as revenue')
            ->groupBy('order_items.item_id', 'order_items.name')->orderByDesc('qty')->get();

        $byHour = Order::where('vendor_id', $v->id)->where('status', 'delivered')->where('created_at', '>=', now()->subDays(30))
            ->get(['created_at'])->groupBy(fn ($o) => (int) $o->created_at->format('G'))->map->count()->sortKeys();

        return response()->json([
            'best_sellers' => $rows->take(10)->values(),
            'slow_movers' => $v->items()->whereNotIn('id', $rows->pluck('item_id'))->get(['id', 'name']),
            'orders_by_hour' => $byHour,
            'rating' => ['average' => $v->rating, 'count' => $v->rating_count],
        ]);
    }
}

<?php

namespace App\Http\Controllers\Api\Driver;

use App\Events\DriverLocationUpdated;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DispatchOffer;
use App\Models\Driver;
use App\Models\DriverLocation;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Services\DispatchService;
use App\Services\OrderService;
use App\Services\Payments\PaynowGateway;
use App\Services\PushService;
use App\Support\Geo;
use App\Support\Money;
use App\Support\RoutePlanner;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Endpoints for the Zvino Driver app (prefix /api/driver). */
class DriverController extends Controller
{
    public function __construct(private DispatchService $dispatch, private OrderService $orders) {}

    private function driver(Request $request): Driver
    {
        $driver = $request->user()->driver;
        abort_unless($driver, 403, 'Apply to drive with Zvino first.');

        return $driver;
    }

    private function approved(Request $request): Driver
    {
        $driver = $this->driver($request);
        abort_unless($driver->status === 'approved', 403, 'Your driver account is '.$driver->status.'.');

        return $driver;
    }

    // ── Onboarding ───────────────────────────────────────────────────

    public function apply(Request $request)
    {
        abort_unless(Setting::get('drivers.applications_open'), 422, 'Driver applications are closed right now.');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'vehicle_type' => ['required', Rule::in(Setting::get('drivers.vehicle_types'))],
            'vehicle_make' => ['nullable', 'string', 'max:60'],
            'vehicle_plate' => ['nullable', 'string', 'max:20'],
            'national_id' => ['required', 'string', 'max:30'],
            'licence_number' => ['required_unless:vehicle_type,bicycle,on_foot', 'nullable', 'string', 'max:30'],
            'zone_id' => ['nullable', 'exists:zones,id'],
        ]);

        $user = $request->user();
        abort_if($user->isStaff(), 422, 'Staff accounts cannot drive.');
        $user->update(['name' => $data['name'], 'role' => 'driver']);
        $driver = Driver::updateOrCreate(['user_id' => $user->id], collect($data)->except('name')->all() + ['status' => 'applied']);
        app(\App\Services\StaffNotifier::class)->notify('driver_applied', 'New driver application', "{$user->name} · ".str_replace('_', ' ', $data['vehicle_type']), "/admin/drivers/{$driver->id}", null, ['drivers.manage']);

        return response()->json($this->present($driver->fresh()), 201);
    }

    public function uploadDocument(Request $request)
    {
        $driver = $this->driver($request);
        $data = $request->validate([
            'type' => ['required', 'in:national_id,licence,vehicle_registration,insurance,police_clearance,selfie'],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:8192'],
            'expires_on' => ['nullable', 'date'],
        ]);

        $path = $request->file('file')->store("drivers/{$driver->id}", 'local'); // private disk
        $driver->documents()->where('type', $data['type'])->delete();
        $doc = $driver->documents()->create(['type' => $data['type'], 'path' => $path, 'expires_on' => $data['expires_on'] ?? null]);

        return response()->json($doc, 201);
    }

    public function me(Request $request)
    {
        return response()->json($this->present($this->driver($request)));
    }

    // ── Shift ────────────────────────────────────────────────────────

    public function online(Request $request)
    {
        $driver = $this->approved($request);
        $data = $request->validate(['is_online' => ['required', 'boolean'], 'lat' => ['required_if:is_online,true', 'numeric'], 'lng' => ['required_if:is_online,true', 'numeric']]);

        if (! $data['is_online'] && $driver->activeOrders()->exists()) {
            throw ValidationException::withMessages(['is_online' => 'Finish your active delivery before going offline.']);
        }
        if ($data['is_online'] && $driver->cashHeld() > Setting::get('delivery.driver_cash_limit_zig')) {
            throw ValidationException::withMessages(['is_online' => 'You are holding too much cash. Remit it via EcoCash to go online.']);
        }

        $driver->update(['is_online' => $data['is_online']] + (isset($data['lat']) ? ['lat' => $data['lat'], 'lng' => $data['lng'], 'location_updated_at' => now()] : []));

        if ($driver->is_online) {
            $this->dispatch->sweep(); // there may be orders waiting
        }

        return response()->json($this->present($driver->fresh()));
    }

    public function location(Request $request)
    {
        $driver = $this->approved($request);
        $data = $request->validate(['lat' => ['required', 'numeric', 'between:-90,90'], 'lng' => ['required', 'numeric', 'between:-180,180'], 'heading' => ['nullable', 'numeric']]);

        $driver->update($data + ['location_updated_at' => now()]);

        $active = $driver->activeOrders()->get();
        foreach ($active as $order) {
            DriverLocation::create(['driver_id' => $driver->id, 'order_id' => $order->id, 'lat' => $data['lat'], 'lng' => $data['lng'], 'recorded_at' => now()]);

            // Auto-mark "arriving" within 400 m of the customer.
            if ($order->status === 'picked_up' && $order->address?->lat
                && Geo::km($data['lat'], $data['lng'], $order->address->lat, $order->address->lng) <= 0.4) {
                $this->orders->setStatus($order, 'arriving');
            } elseif (\App\Support\DeliveryEta::refresh($order)) {
                \App\Events\OrderUpdated::dispatch($order); // live ETA from where the driver is now
            }
        }
        if ($active->isNotEmpty()) {
            DriverLocationUpdated::dispatch($driver, $active->pluck('id')->all());
        }

        return response()->json(['ok' => true, 'next_in' => Setting::get('delivery.location_interval_seconds')]);
    }

    // ── Offers ───────────────────────────────────────────────────────

    public function offers(Request $request)
    {
        $driver = $this->approved($request);
        $this->dispatch->sweep(); // lazy expiry: no worker needed on shared hosting

        $offers = $driver->offers()->where('status', 'offered')->where('expires_at', '>', now())
            ->with('order.vendor', 'order.address')->get();

        return response()->json($offers->map(fn (DispatchOffer $o) => [
            'id' => $o->id,
            'expires_at' => $o->expires_at,
            'seconds_left' => now()->diffInSeconds($o->expires_at, false),
            'pay' => Money::both($o->pay_zig + $o->order->tip_zig),
            'tip' => Money::both($o->order->tip_zig),
            'pickup_km' => $o->pickup_km,
            'dropoff_km' => $o->order->distance_km,
            'payment_method' => $o->order->payment_method,
            'collect_cash' => $o->order->cashDue() > 0 ? Money::both($o->order->cashDue()) : null,
            'store' => $o->order->vendor->only('name', 'address', 'lat', 'lng'),
            'dropoff_area' => $o->order->address?->suburb ?? $o->order->address?->city,
            'items_count' => $o->order->items()->sum('quantity'),
            'safety' => $this->safety($o->order),
            'shopping' => $o->order->vendor->is_shopper_store ? ['items' => (int) $o->order->items()->sum('quantity'), 'expected_till_usd' => \App\Services\ShopperService::expectedTillUsd($o->order)] : null,
            // Stacked onto the run the driver already has: how much further it takes them.
            'batch' => ($n = $driver->activeOrders()->count()) > 0 ? ['with' => $n, 'extra_km' => $extra = $this->dispatch->extraKm($driver, $o->order), 'extra_min' => (int) ceil(\App\Support\DeliveryEta::rideMinutes($extra))] : null,
            // Popup details: order size, the whole trip, and what it works out to per km.
            'order_value' => Money::both((float) $o->order->subtotal_zig),
            'trip_km' => $trip = round((float) $o->pickup_km + (float) $o->dropoff_km, 1),
            'trip_minutes' => (int) ceil(\App\Support\DeliveryEta::rideMinutes($trip) + ($o->order->vendor->is_shopper_store ? 4 + 1.2 * (int) $o->order->items()->sum('quantity') : 3)),
            'per_km' => $trip > 0 ? Money::both(($o->pay_zig + $o->order->tip_zig) / $trip) : null,
            'boost_pct' => $o->boost_pct,
            'broadcast' => $o->broadcast,
            'round' => $o->round,
            // How many drivers can see this job right now (first to accept gets it).
            'competing' => $o->broadcast ? DispatchOffer::where('order_id', $o->order_id)->where('status', 'offered')->where('expires_at', '>', now())->count() : 1,
            'food_ready' => in_array($o->order->status, ['ready'], true),
        ]));
    }

    public function accept(Request $request, DispatchOffer $offer)
    {
        abort_unless($offer->driver_id === $this->approved($request)->id, 404);
        $order = $this->dispatch->accept($offer);

        return response()->json($this->job($order->fresh()));
    }

    public function decline(Request $request, DispatchOffer $offer)
    {
        abort_unless($offer->driver_id === $this->approved($request)->id, 404);
        $this->dispatch->decline($offer);

        return response()->noContent();
    }

    // ── Jobs ─────────────────────────────────────────────────────────

    public function jobs(Request $request)
    {
        $driver = $this->approved($request);

        $orders = $driver->activeOrders()->with('vendor', 'address', 'user', 'items')->get();
        // Number each job by its place in the planned route (shortest drop-off order).
        $numbers = collect(RoutePlanner::forDriver($driver, $orders)['stops'])->where('type', 'dropoff')->values()->mapWithKeys(fn ($s, $n) => [$s['order_id'] => $n + 1]);

        return response()->json($orders->sortBy(fn ($o) => $numbers[$o->id] ?? 99)->values()->map(fn ($o) => $this->job($o) + ['stop' => $numbers[$o->id] ?? null, 'stops_total' => $orders->count()]));
    }

    /** The planned run: store pickups, then drop-offs in the most efficient order, with a Maps link. */
    public function route(Request $request)
    {
        return response()->json(RoutePlanner::forDriver($this->approved($request)));
    }

    public function pickup(Request $request, Order $order)
    {
        $this->ownJob($request, $order);
        abort_if($order->vendor->is_shopper_store && ! $order->shopping_finished_at, 422, 'Finish shopping (and add the till slip) first.');
        if (in_array($order->status, ['accepted', 'preparing'], true)) {
            $order = $this->orders->setStatus($order, 'ready');
        }
        $this->orders->setStatus($order->fresh(), 'picked_up');

        return response()->json($this->job($order->fresh()));
    }

    public function deliver(Request $request, Order $order)
    {
        $this->ownJob($request, $order);
        $data = $request->validate([
            'pin' => ['nullable', 'digits:4'],
            'photo' => ['nullable', 'image', 'max:8192'],
            'cash_received_zig' => ['nullable', 'numeric', 'min:0'],
            'change_to_wallet_zig' => ['nullable', 'numeric', 'min:0'],
        ]);

        if (Setting::get('delivery.require_delivery_pin') && $order->dropoff === 'hand_to_me' && ($data['pin'] ?? null) !== $order->delivery_pin) {
            throw ValidationException::withMessages(['pin' => 'Ask the customer for the 4-digit PIN in their app.']);
        }
        if ($order->dropoff === 'leave_at_door' && Setting::get('delivery.require_proof_photo') && ! $request->hasFile('photo')) {
            throw ValidationException::withMessages(['photo' => 'Take a photo of where you left the order.']);
        }
        if ($request->hasFile('photo')) {
            $order->update(['proof_photo_path' => '/storage/'.$request->file('photo')->store("proof/{$order->id}", 'public')]);
        }

        // Zimbabwe: no small USD notes → credit the customer's change to their wallet.
        if (($data['change_to_wallet_zig'] ?? 0) > 0 && $order->cashDue() > 0 && $order->user) {
            $order->user->walletTransactions()->create(['order_id' => $order->id, 'type' => 'credit', 'amount_zig' => $data['change_to_wallet_zig'], 'reason' => 'Change from cash payment']);
            $this->driver($request)->ledger()->create(['order_id' => $order->id, 'type' => 'adjustment', 'amount_zig' => -$data['change_to_wallet_zig'], 'description' => "Change kept, credited to customer {$order->reference}"]);
        }

        if ($order->status === 'picked_up') {
            $order = $this->orders->setStatus($order, 'arriving');
        }
        $this->orders->setStatus($order->fresh(), 'delivered');

        return response()->json(['ok' => true, 'earned' => Money::both($order->driver_pay_zig + $order->tip_zig)]);
    }

    // ── Money ────────────────────────────────────────────────────────

    public function earnings(Request $request)
    {
        $driver = $this->driver($request);
        $period = $request->query('period', 'week');
        $from = match ($period) { 'today' => now()->startOfDay(), 'month' => now()->startOfMonth(), default => now()->startOfWeek() };

        $entries = $driver->ledger()->where('created_at', '>=', $from)->latest()->get();
        $earned = $entries->whereIn('type', ['earning', 'tip'])->sum('amount_zig');

        return response()->json([
            'period' => $period,
            'earned' => Money::both($earned),
            'tips' => Money::both($entries->where('type', 'tip')->sum('amount_zig')),
            'trips' => $entries->where('type', 'earning')->count(),
            'balance' => Money::both($driver->balance()),
            'cash_held' => Money::both($driver->cashHeld()),
            'cash_limit' => Money::both((float) Setting::get('delivery.driver_cash_limit_zig')),
            'available_to_cash_out' => Money::both(max(0, (float) $driver->ledger()->whereNull('payout_id')->sum('amount_zig'))),
            'instant_cashout' => Setting::get('payments.instant_cashout') ? [
                'fee_pct' => (float) Setting::get('payments.instant_cashout_fee_pct'),
                'min' => Money::both((float) Setting::get('payments.instant_cashout_min_zig')),
            ] : null,
            'tier' => $driver->tier ?? 'bronze',
            'goals' => [
                'daily' => $driver->daily_goal_zig ? ['target' => (float) $driver->daily_goal_zig, 'earned' => round((float) $driver->ledger()->whereIn('type', ['earning', 'tip'])->where('created_at', '>=', now()->startOfDay())->sum('amount_zig'), 2)] : null,
                'weekly' => $driver->weekly_goal_zig ? ['target' => (float) $driver->weekly_goal_zig, 'earned' => round((float) $driver->ledger()->whereIn('type', ['earning', 'tip'])->where('created_at', '>=', now()->startOfWeek())->sum('amount_zig'), 2)] : null,
            ],
            'entries' => $entries->take(50)->values()->map(fn ($e) => $e->only('id', 'type', 'amount_zig', 'description', 'created_at')),
            'daily' => $entries->whereIn('type', ['earning', 'tip'])->groupBy(fn ($e) => $e->created_at->toDateString())->map->sum('amount_zig'),
        ]);
    }

    public function cashOut(Request $request, \App\Services\PayoutService $payouts)
    {
        $driver = $this->approved($request);
        $data = $request->validate(['phone' => ['nullable', 'string', 'max:20']]);
        $payout = $payouts->instantCashOut($driver, $data['phone'] ?? null);

        return response()->json([
            'payout_id' => $payout->id,
            'amount' => Money::both($payout->amount_zig),
            'fee' => Money::both($payout->fee_zig),
            'message' => 'Cash-out requested. You’ll receive it today via '.ucfirst($payout->method).'.',
        ], 201);
    }

    public function preferences(Request $request)
    {
        $driver = $this->driver($request);
        $driver->update($request->validate([
            'avoid_night_zones' => ['sometimes', 'boolean'],
            'daily_goal_zig' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100000'],
            'weekly_goal_zig' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:500000'],
        ]));

        return response()->json($this->present($driver->fresh()));
    }

    /**
     * Demand heatmap (#24): where orders are coming from now, blended with the same hour on the
     * last four same weekdays, bucketed into ~1 km cells around the stores.
     */
    public function heatmap(Request $request)
    {
        $driver = $this->approved($request);
        abort_unless(Setting::get('drivers.heatmap_enabled'), 404);

        $cells = [];
        $add = function ($orders, float $weight) use (&$cells) {
            foreach ($orders as $o) {
                if (! $o->vendor?->lat) {
                    continue;
                }
                $key = round($o->vendor->lat, 2).','.round($o->vendor->lng, 2);
                $cells[$key] ??= ['lat' => round($o->vendor->lat, 2), 'lng' => round($o->vendor->lng, 2), 'score' => 0, 'now' => 0, 'stores' => []];
                $cells[$key]['score'] += $weight;
                $cells[$key]['now'] += $weight === 1.0 ? 1 : 0;
                $cells[$key]['stores'][$o->vendor->name] = true;
            }
        };

        $add(Order::with('vendor:id,name,lat,lng')->where('fulfilment', 'delivery')->where('created_at', '>=', now()->subHour())->get(['id', 'vendor_id']), 1.0);
        for ($w = 1; $w <= 4; $w++) {
            $at = now()->subWeeks($w);
            $add(Order::with('vendor:id,name,lat,lng')->where('fulfilment', 'delivery')->whereBetween('created_at', [$at->copy()->subMinutes(30), $at->copy()->addMinutes(60)])->get(['id', 'vendor_id']), 0.25);
        }

        $max = max(1, ...array_column($cells, 'score') ?: [1]);
        $out = collect($cells)->map(fn ($c) => [
            'lat' => $c['lat'], 'lng' => $c['lng'],
            'intensity' => round($c['score'] / $max, 2),
            'orders_last_hour' => $c['now'],
            'label' => implode(', ', array_slice(array_keys($c['stores']), 0, 2)),
            'km' => $driver->lat ? round(Geo::km($driver->lat, $driver->lng, $c['lat'], $c['lng']), 1) : null,
        ])->sortByDesc('intensity')->values()->take(12);

        return response()->json(['cells' => $out, 'updated_at' => now()]);
    }

    public function tier(Request $request, \App\Services\DriverTierService $tiers)
    {
        return response()->json($tiers->progress($this->driver($request)));
    }

    /** Pay cash collected on COD orders back to Zvino via EcoCash. */
    public function remitCash(Request $request, PaynowGateway $paynow)
    {
        $driver = $this->driver($request);
        $held = $driver->cashHeld();
        abort_if($held <= 0, 422, 'You are not holding any cash.');
        $data = $request->validate(['phone' => ['required', 'string'], 'method' => ['required', 'in:ecocash,onemoney,innbucks']]);

        $payment = \App\Models\Payment::create([
            'provider' => 'paynow', 'method' => $data['method'], 'phone' => $data['phone'], 'amount_zig' => $held,
            'payable_type' => $driver->getMorphClass(), 'payable_id' => $driver->id,
            'raw' => ['user_id' => $request->user()->id, 'reference' => 'ZVR-'.$driver->id.'-'.now()->timestamp, 'purpose' => 'cash_remittance'],
        ]);
        $paynow->initiate($payment);

        if ($paynow->fake()) {
            $payment->update(['status' => 'paid']);
            \App\Services\GrowthService::settleRemittance($driver, $payment->fresh());
        }

        return response()->json(['payment_id' => $payment->id, 'status' => $payment->fresh()->status, 'amount' => Money::both($held)]);
    }

    // ── Safety ───────────────────────────────────────────────────────

    public function sos(Request $request, PushService $push)
    {
        $driver = $this->approved($request);
        $data = $request->validate(['lat' => ['required', 'numeric'], 'lng' => ['required', 'numeric'], 'note' => ['nullable', 'string', 'max:300']]);

        AuditLog::record('driver.sos', $driver, $data);
        User::whereIn('role', ['super_admin', 'admin', 'support'])->get()->each(fn ($admin) => $push->toUser($admin, 'sos',
            "🚨 SOS: {$request->user()->name}", "https://maps.google.com/?q={$data['lat']},{$data['lng']} ".($data['note'] ?? ''),
            ['driver_id' => $driver->id, 'lat' => $data['lat'], 'lng' => $data['lng']]));

        return response()->json(['ok' => true, 'emergency' => ['police' => '995', 'ambulance' => '994', 'support' => Setting::get('general.support_phone')]]);
    }

    // ── Helpers ──────────────────────────────────────────────────────

    private function ownJob(Request $request, Order $order): void
    {
        abort_unless($order->driver_id === $this->approved($request)->id, 404);
    }

    private function job(Order $o): array
    {
        $o->loadMissing('vendor', 'address', 'user', 'items');

        return [
            'id' => $o->id,
            'reference' => $o->reference,
            'status' => $o->status,
            'store' => $o->vendor->only('name', 'phone', 'address', 'lat', 'lng'),
            'ready_at' => $o->estimated_delivery_at?->subMinutes($o->distance_km ? Geo::rideMinutes($o->distance_km) : 15),
            'customer' => ['name' => $o->user?->name, 'phone' => $o->user?->phone],
            'dropoff' => $o->address ? $o->address->only('line1', 'landmark', 'suburb', 'city', 'lat', 'lng', 'instructions', 'gate_photo_path', 'voice_note_path') : null,
            'dropoff_type' => $o->dropoff,
            'requires_pin' => Setting::get('delivery.require_delivery_pin') && $o->dropoff === 'hand_to_me',
            'collect_cash' => $o->cashDue() > 0 ? Money::both($o->cashDue()) : null,
            'items' => $o->items->map(fn ($i) => ['name' => $i->name, 'quantity' => $i->quantity]),
            // Zvino-run store: the driver shops the order first.
            'shopping' => $o->vendor->is_shopper_store ? ['started' => (bool) $o->shopping_started_at, 'finished' => (bool) $o->shopping_finished_at, 'items' => $o->items->sum('quantity'), 'lines' => $o->items->count(), 'expected_till_usd' => \App\Services\ShopperService::expectedTillUsd($o)] : null,
            'pay' => Money::both($o->driver_pay_zig + $o->tip_zig),
            'notes' => $o->notes,
            'safety' => $this->safety($o),
        ];
    }

    /** Night safety zone warning for a drop-off, shown on the offer and the job screen. */
    private function safety(Order $o): ?array
    {
        $zone = \App\Models\SafetyZone::activeAt($o->address?->lat, $o->address?->lng);

        return $zone ? ['zone' => $zone->name, 'note' => $zone->note, 'until' => substr($zone->night_to, 0, 5)] : null;
    }

    private function present(Driver $d): array
    {
        return $d->only('id', 'status', 'vehicle_type', 'vehicle_make', 'vehicle_plate', 'is_online', 'rating', 'rating_count', 'completed_deliveries', 'acceptance_rate', 'zone_id') + [
            'name' => $d->user->name,
            'documents' => $d->documents()->get(['id', 'type', 'status', 'note', 'expires_on']),
            'required_documents' => Setting::get('drivers.required_documents'),
            'balance' => Money::both($d->balance()),
            'cash_held' => Money::both($d->cashHeld()),
            'today' => Money::both((float) $d->ledger()->whereIn('type', ['earning', 'tip'])->where('created_at', '>=', now()->startOfDay())->sum('amount_zig')),
            'location_interval_seconds' => Setting::get('delivery.location_interval_seconds'),
            'tier' => $d->tier ?? 'bronze',
            'preferences' => ['avoid_night_zones' => (bool) $d->avoid_night_zones, 'daily_goal_zig' => $d->daily_goal_zig ? (float) $d->daily_goal_zig : null, 'weekly_goal_zig' => $d->weekly_goal_zig ? (float) $d->weekly_goal_zig : null],
            'night_zones_enabled' => (bool) Setting::get('drivers.night_zones_enabled'),
        ];
    }
}

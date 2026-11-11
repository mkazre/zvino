<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\OrderResource;
use App\Models\AuditLog;
use App\Models\Driver;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends AdminController
{
    public const STATUSES = ['scheduled', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered', 'cancelled', 'rejected'];

    public function __construct(private OrderService $orders) {}

    private function query(Request $request)
    {
        $tab = $request->query('status', 'all');
        $search = $request->query('q');

        return $this->scoped(Order::query(), $request)->where('status', '!=', 'pending_payment')
            ->when($tab === 'active', fn ($q) => $q->active())
            ->when(in_array($tab, self::STATUSES, true), fn ($q) => $q->where('status', $tab))
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', $s))
            ->when($request->query('payment'), fn ($q, $s) => $q->where('payment_method', $s))
            ->when($request->query('vendor_id'), fn ($q, $v) => $q->where('vendor_id', $v))
            ->when($request->query('from'), fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
            ->when($request->query('to'), fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
            ->when($search, fn ($q) => $q->where(fn ($w) => $w->where('reference', 'like', "%$search%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%$search%")->orWhere('phone', 'like', "%$search%"))));
    }

    public function index(Request $request)
    {
        $base = fn () => $this->scoped(Order::query(), $request)->where('status', '!=', 'pending_payment');
        $counts = $base()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');

        return Inertia::render('admin/orders', [
            'orders' => OrderResource::collection($this->query($request)->with('vendor', 'user', 'driver.user')->latest()->paginate(30)->withQueryString()),
            'counts' => $counts->put('all', $counts->sum())->put('active', $base()->active()->count()),
            'filters' => $request->only('status', 'q', 'source', 'payment', 'vendor_id', 'from', 'to') + ['status' => 'all'],
            'vendors' => $this->vendorOptions($request),
            'today' => [
                'orders' => $base()->whereDate('created_at', today())->count(),
                'gmv' => (float) $base()->whereDate('created_at', today())->where('payment_status', 'paid')->sum('total_zig'),
            ],
        ]);
    }

    public function prescription(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        abort_unless($order->prescription_path && \Illuminate\Support\Facades\Storage::disk('local')->exists($order->prescription_path), 404);

        return \Illuminate\Support\Facades\Storage::disk('local')->response($order->prescription_path);
    }

    public function tillSlip(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        abort_unless($order->till_slip_path && \Illuminate\Support\Facades\Storage::disk('local')->exists($order->till_slip_path), 404);

        return \Illuminate\Support\Facades\Storage::disk('local')->response($order->till_slip_path);
    }

    public function show(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        $order->load('vendor', 'user', 'address', 'items', 'driver.user', 'payments', 'refunds', 'review', 'messages.sender:id,name', 'dispatchOffers.driver.user:id,name');

        return Inertia::render('admin/order-show', [
            'order' => array_merge((new OrderResource($order))->resolve(), [
                'address' => $order->address,
                'driver' => $order->driver ? ['id' => $order->driver->id, 'name' => $order->driver->user->name, 'phone' => $order->driver->user->phone, 'vehicle' => $order->driver->vehicle_type, 'plate' => $order->driver->vehicle_plate] : null,
                'payments' => $order->payments,
                'refunds' => $order->refunds,
                'review' => $order->review,
                'messages' => $order->messages,
                'offers' => $order->dispatchOffers->map(fn ($o) => ['driver' => $o->driver->user->name, 'status' => $o->status, 'pay_zig' => $o->pay_zig, 'created_at' => $o->created_at]),
                'delivery_pin' => $order->delivery_pin,
                'proof_photo' => $order->proof_photo_path,
                'scheduled_for' => $order->scheduled_for,
                'estimated_delivery_at' => $order->estimated_delivery_at,
                'distance_km' => $order->distance_km,
                'tip_zig' => $order->tip_zig,
                'wallet_applied_zig' => $order->wallet_applied_zig,
                'cash_part_zig' => $order->cash_part_zig,
                'donation_zig' => $order->donation_zig,
                'has_prescription' => (bool) $order->prescription_path,
                'refunded_zig' => $order->refunded_zig,
                'commission_zig' => $order->commission_zig,
                'driver_pay_zig' => $order->driver_pay_zig,
                'cancel_reason' => $order->cancel_reason ?? $order->reject_reason,
                'cancelled_by' => $order->cancelled_by,
                'dropoff' => $order->dropoff,
                // Zvino-run store: what the shopper found, the till and the difference.
                'shopping' => $order->vendor->is_shopper_store ? [
                    'pref' => $order->substitution_pref ?? 'best',
                    'started_at' => $order->shopping_started_at, 'finished_at' => $order->shopping_finished_at,
                    'till_total_usd' => $order->till_total_usd, 'expected_usd' => \App\Services\ShopperService::expectedTillUsd($order),
                    'paid_with' => $order->till_paid_with, 'has_slip' => (bool) $order->till_slip_path, 'refund_zig' => $order->shopping_refund_zig,
                    'lines' => $order->items->map(fn ($l) => ['name' => $l->name, 'quantity' => $l->quantity, 'status' => $l->shop_status, 'found_qty' => $l->found_qty, 'replacement' => $l->replacement, 'refund_zig' => $l->refund_zig, 'substitute' => $l->substitute]),
                    'buffer_zig' => $order->substitution_buffer_zig,
                ] : null,
            ]),
            'next' => collect(OrderService::TRANSITIONS[$order->status] ?? [])->reject(fn ($s) => in_array($s, ['rejected'], true))->values(),
            'nearbyDrivers' => $order->fulfilment === 'delivery' && ! $order->driver_id
                ? Driver::available()->with('user:id,name')->get()->map(fn ($d) => ['id' => $d->id, 'name' => $d->user->name, 'km' => $order->vendor->lat ? \App\Support\Geo::km($d->lat, $d->lng, $order->vendor->lat, $order->vendor->lng) : null, 'active' => $d->activeOrders()->count()])->sortBy('km')->values()->take(8)
                : [],
            'audit' => AuditLog::where('subject_type', 'order')->where('subject_id', $order->id)->with('user:id,name')->latest('created_at')->get(),
        ]);
    }

    public function updateStatus(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        $data = $request->validate(['status' => ['required', 'in:'.implode(',', self::STATUSES)], 'prep_minutes' => ['nullable', 'integer', 'between:5,120']]);

        if ($data['status'] === 'accepted') {
            $this->orders->accept($order, $data['prep_minutes'] ?? $order->vendor->prep_minutes);
        } else {
            $this->orders->setStatus($order, $data['status']);
        }
        AuditLog::record('order.status', $order, ['to' => $data['status']]);

        return back()->with('success', "{$order->reference} → ".str_replace('_', ' ', $data['status']));
    }

    public function cancel(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:200']])['reason'];
        $this->orders->cancel($order, 'admin', $reason);
        AuditLog::record('order.cancelled', $order, ['reason' => $reason]);

        return back()->with('success', "{$order->reference} cancelled and refunded.");
    }

    public function note(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        AuditLog::record('order.note', $order, ['note' => $request->validate(['note' => ['required', 'string', 'max:1000']])['note']]);

        return back()->with('success', 'Note added.');
    }

    public function export(Request $request): StreamedResponse
    {
        AuditLog::record('orders.exported', null, $request->query());

        return response()->streamDownload(function () use ($request) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Reference', 'Date', 'Customer', 'Phone', 'Store', 'Source', 'Fulfilment', 'Status', 'Payment', 'Payment status', 'Total ZiG', 'Total USD', 'Tip', 'Refunded']);
            $this->query($request)->with('user:id,name,phone', 'vendor:id,name')->latest()->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $o) {
                    fputcsv($out, [$o->reference, $o->created_at->toDateTimeString(), $o->user?->name, $o->user?->phone, $o->vendor?->name, $o->source, $o->fulfilment, $o->status, $o->payment_method, $o->payment_status, $o->total_zig, $o->total_usd, $o->tip_zig, $o->refunded_zig]);
                }
            });
            fclose($out);
        }, 'zvino-orders-'.now()->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv']);
    }
}

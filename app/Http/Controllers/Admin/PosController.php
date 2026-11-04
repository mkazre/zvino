<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Models\Setting;
use App\Models\Vendor;
use App\Services\OrderService;
use App\Services\Payments\PaynowGateway;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class PosController extends AdminController
{
    public function index(Request $request)
    {
        $vendor = $this->currentVendor($request);
        $today = Order::where('source', 'pos')->where('vendor_id', $vendor?->id)->whereDate('created_at', today())->where('payment_status', 'paid');

        return Inertia::render('admin/pos', [
            'vendor' => $vendor?->only('id', 'name', 'power_out'),
            'vendors' => $this->vendorOptions($request),
            'categories' => Category::where('vendor_id', $vendor?->id)->orderBy('sort_order')->get(['id', 'name']),
            'items' => ItemResource::collection(Item::where('vendor_id', $vendor?->id)->with('modifierGroups.options', 'vendor')->orderBy('sort_order')->get()->filter->isOrderable()->values()),
            'zigPerUsd' => ExchangeRate::current(),
            'vatPct' => (float) Setting::get('currency.vat_pct'),
            'businessName' => Setting::get('general.business_name'),
            'vatNumber' => Setting::get('general.vat_number'),
            'shift' => [
                'sales' => (clone $today)->count(),
                'total_zig' => (float) (clone $today)->sum('total_zig'),
                'by_method' => (clone $today)->selectRaw('payment_method, COUNT(*) as c, SUM(total_zig) as t')->groupBy('payment_method')->get(),
            ],
            'recent' => $this->scoped(Order::where('source', 'pos'), $request)->with('items:id,order_id,name,quantity')->latest()->limit(8)
                ->get(['id', 'reference', 'total_zig', 'payment_method', 'payment_status', 'created_at']),
        ]);
    }

    public function paymentStatus(Request $request, \App\Models\Payment $payment, OrderService $orders, PaynowGateway $paynow)
    {
        abort_unless($payment->order, 404);
        $this->authorizeVendor($request, $payment->order->vendor_id);
        if ($payment->status === 'pending' && ! $paynow->fake() && ($status = $paynow->poll($payment))) {
            $status === 'paid' ? $orders->markPaid($payment) : ($status !== 'pending' ? $orders->markFailed($payment, $status) : null);
        }

        return response()->json($payment->fresh()->only('id', 'status'));
    }

    public function store(Request $request, OrderService $orders, PaynowGateway $paynow)
    {
        $data = $request->validate([
            'vendor_id' => ['required', 'exists:vendors,id'],
            'method' => ['required', Rule::in([...OrderService::METHODS, 'qr'])],
            'phone' => ['required_if:method,ecocash,onemoney,innbucks', 'nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')->where('vendor_id', $request->input('vendor_id'))],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.variant' => ['nullable', 'string'],
            'lines.*.modifiers' => ['nullable', 'array'],
            // Multi-currency till: what the customer handed over.
            'tendered' => ['nullable', 'numeric', 'min:0'],
            'tendered_currency' => ['nullable', 'in:ZIG,USD'],
        ]);
        $this->authorizeVendor($request, (int) $data['vendor_id']);
        abort_if($data['method'] === 'wallet', 422, 'Wallet payments are app-only.');
        abort_if($data['method'] === 'qr' && ! \App\Models\Setting::get('payments.counter_qr'), 422, 'Counter QR payments are switched off.');

        [$order, $payment] = $orders->placePos($request->user(), Vendor::findOrFail($data['vendor_id']), $data['lines'], $data['method'], $data['phone'] ?? null);

        if ($data['method'] === 'cash' && isset($data['tendered'])) {
            $rate = $order->zig_per_usd;
            $tenderedZig = ($data['tendered_currency'] ?? 'ZIG') === 'USD' ? $data['tendered'] * $rate : $data['tendered'];
            $order->payments()->latest()->first()?->update(['raw' => [
                'tendered' => $data['tendered'], 'currency' => $data['tendered_currency'] ?? 'ZIG',
                'change_zig' => round(max(0, $tenderedZig - $order->total_zig), 2),
            ]]);
        }
        // Counter QR (#35): the till shows a code, the customer pays on their own phone, the till polls.
        if ($data['method'] === 'qr') {
            return response()->json(['reference' => $order->reference, 'payment_id' => $payment->id, 'qr_url' => $payment->fresh()->redirect_url, 'total_zig' => $order->total_zig], 201);
        }
        if ($payment && $paynow->fake()) {
            $orders->markPaid($payment);
        }

        return back()->with('success', "Sale {$order->reference} recorded: ZiG ".number_format($order->total_zig, 2))->with('receipt', $order->id);
    }
}

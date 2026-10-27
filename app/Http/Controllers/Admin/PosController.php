<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class PosController extends AdminController
{
    public function index(Request $request)
    {
        $vendor = $this->currentVendor($request);

        return Inertia::render('admin/pos', [
            'vendor' => $vendor?->only('id', 'name'),
            'vendors' => $this->vendorOptions($request),
            'categories' => Category::where('vendor_id', $vendor?->id)->orderBy('sort_order')->get(['id', 'name']),
            'items' => ItemResource::collection(Item::where('vendor_id', $vendor?->id)->where('is_available', true)->orderBy('sort_order')->get()),
            'zigPerUsd' => ExchangeRate::current(),
            'vatPct' => (float) config('zvino.vat_pct'),
            'recent' => $this->scoped(Order::where('source', 'pos'), $request)->latest()->limit(5)->get(['id', 'reference', 'total_zig', 'payment_method', 'payment_status', 'created_at']),
        ]);
    }

    public function store(Request $request, OrderService $orders)
    {
        $data = $request->validate([
            'vendor_id' => ['required', 'exists:vendors,id'],
            'method' => ['required', Rule::in(OrderService::METHODS)],
            'phone' => ['required_if:method,ecocash,onemoney,innbucks', 'nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')->where('vendor_id', $request->input('vendor_id'))],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.variant' => ['nullable', 'string'],
            'lines.*.modifiers' => ['nullable', 'array'],
        ]);
        $this->authorizeVendor($request, (int) $data['vendor_id']);
        abort_if($data['method'] === 'wallet', 422, 'Wallet payments are app-only.');

        [$order, $payment] = $orders->placePos($request->user(), \App\Models\Vendor::findOrFail($data['vendor_id']), $data['lines'], $data['method'], $data['phone'] ?? null);

        if ($payment && app(\App\Services\Payments\PaynowGateway::class)->fake()) {
            $orders->markPaid($payment);
        }

        return back()->with('success', "Sale {$order->reference} recorded — ZiG ".number_format($order->total_zig, 2));
    }
}

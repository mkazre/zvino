<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use App\Services\GrowthService;
use App\Services\OrderService;
use App\Services\Payments\PaynowGateway;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    public function __construct(private PaynowGateway $paynow, private OrderService $orders) {}

    /** Retry / switch method on an unpaid order. */
    public function initiate(Request $request)
    {
        $data = $request->validate([
            'order_id' => ['required', 'exists:orders,id'],
            'method' => ['required', 'in:ecocash,onemoney,innbucks,card'],
            'phone' => ['required_unless:method,card', 'nullable', 'string'],
        ]);
        $order = Order::findOrFail($data['order_id']);
        abort_unless($order->user_id === $request->user()->id && $order->payment_status !== 'paid', 404);

        $payment = $this->paynow->initiate(Payment::create([
            'order_id' => $order->id, 'provider' => 'paynow', 'method' => $data['method'],
            'phone' => $data['phone'] ?? null, 'amount_zig' => $order->total_zig,
        ]));
        $order->update(['payment_method' => $data['method'], 'payment_status' => 'pending']);

        if ($this->paynow->fake()) {
            $this->orders->markPaid($payment);
        }

        return response()->json($payment->fresh()->only('id', 'status', 'method', 'redirect_url'));
    }

    /** App polls this while the customer approves the USSD prompt. */
    public function status(Request $request, Payment $payment)
    {
        $owner = $payment->order?->user_id ?? ($payment->raw['user_id'] ?? null);
        abort_unless($owner === $request->user()->id, 404);

        if ($payment->status === 'pending' && ($status = $this->paynow->poll($payment))) {
            $this->apply($payment, $status);
        }

        return response()->json($payment->fresh()->only('id', 'status', 'method'));
    }

    public function webhook(Request $request, string $provider)
    {
        abort_unless($provider === 'paynow', 404);
        $payload = array_change_key_case($request->all(), CASE_LOWER);

        $status = $this->paynow->verify($payload);
        if (! $status) {
            Log::warning('Paynow webhook hash mismatch', $payload);

            return response('invalid hash', 400);
        }

        $ref = $payload['reference'] ?? null;
        // Split-bill shares and counter QR payments carry their own reference; otherwise match the order.
        $payment = Payment::where('provider', 'paynow')->where('raw->reference', $ref)->latest()->first()
            ?? Payment::where('provider', 'paynow')->whereNull('raw->reference')->whereHas('order', fn ($o) => $o->where('reference', $ref))->latest()->first();

        if ($payment) {
            $payment->update([
                'provider_reference' => $payload['paynowreference'] ?? $payment->provider_reference,
                'raw' => array_merge($payment->raw ?? [], ['webhook' => $payload]),
            ]);
            $this->apply($payment, $status);
        }

        return response('ok');
    }

    private function apply(Payment $payment, string $status): void
    {
        if (! $payment->order_id) {
            if ($status === 'paid' && $payment->status !== 'paid') {
                $payment->update(['status' => 'paid']);
                app(GrowthService::class)->onPaymentPaid($payment);
            } elseif (in_array($status, ['failed', 'cancelled'], true)) {
                $payment->update(['status' => $status]);
            }

            return;
        }

        match ($status) {
            'paid' => $this->orders->markPaid($payment),
            'failed', 'cancelled' => $this->orders->markFailed($payment, $status),
            default => null,
        };
    }
}

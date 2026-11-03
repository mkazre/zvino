<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Refund;
use App\Services\RefundService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class RefundController extends AdminController
{
    public function __construct(private RefundService $refunds) {}

    public function index(Request $request)
    {
        $status = $request->query('status', 'requested');

        return Inertia::render('admin/refunds', [
            'refunds' => Refund::with('order:id,reference,total_zig,refunded_zig,vendor_id,user_id,payment_method,zig_per_usd', 'order.vendor:id,name', 'order.user:id,name,phone', 'requester:id,name')
                ->when($status !== 'all', fn ($q) => $q->where('status', $status))
                ->latest()->paginate(30)->withQueryString(),
            'counts' => Refund::selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status'),
            'status' => $status,
            'totals' => [
                'pending_zig' => (float) Refund::where('status', 'requested')->sum('amount_zig'),
                'paid_30d_zig' => (float) Refund::where('status', 'paid')->where('updated_at', '>=', now()->subDays(30))->sum('amount_zig'),
            ],
        ]);
    }

    public function approve(Request $request, Refund $refund)
    {
        $data = $request->validate(['amount_zig' => ['nullable', 'numeric', 'min:0.01'], 'destination' => ['nullable', 'in:wallet,original']]);
        if (isset($data['destination'])) {
            $refund->update(['destination' => $data['destination']]);
        }
        $this->refunds->approve($refund, $request->user(), $data['amount_zig'] ?? null);

        return back()->with('success', 'Refund approved.');
    }

    public function reject(Request $request, Refund $refund)
    {
        $this->refunds->reject($refund, $request->user(), $request->validate(['note' => ['required', 'string', 'max:500']])['note']);

        return back()->with('success', 'Refund rejected.');
    }

    /** For refunds to the original method: ops confirms the reversal went through. */
    public function markPaid(Request $request, Refund $refund)
    {
        abort_unless($refund->status === 'approved', 422);
        $refund->update(['status' => 'paid', 'note' => trim(($refund->note ?? '')."\nRef: ".$request->validate(['reference' => ['required', 'string', 'max:80']])['reference'])]);
        AuditLog::record('refund.paid', $refund);

        return back()->with('success', 'Marked as paid.');
    }

    /** Support issues a goodwill / partial refund directly from an order. */
    public function issue(Request $request, Order $order)
    {
        $data = $request->validate([
            'amount_zig' => ['required', 'numeric', 'min:0.01', 'max:'.($order->total_zig - $order->refunded_zig)],
            'reason' => ['required', 'string', 'max:200'],
            'destination' => ['required', 'in:wallet,original'],
        ]);
        $refund = $order->refunds()->create($data + ['requested_by' => $request->user()->id]);
        $this->refunds->approve($refund, $request->user());

        return back()->with('success', 'Refund of ZiG '.number_format($data['amount_zig'], 2).' issued.');
    }
}

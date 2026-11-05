<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends AdminController
{
    private function range(Request $request): array
    {
        $from = $request->query('from') ? Carbon::parse($request->query('from'))->startOfDay() : now()->subDays(29)->startOfDay();
        $to = $request->query('to') ? Carbon::parse($request->query('to'))->endOfDay() : now()->endOfDay();

        return [$from, $to];
    }

    public function index(Request $request)
    {
        [$from, $to] = $this->range($request);
        $delivered = fn () => $this->scoped(Order::query(), $request)->where('status', 'delivered')->whereBetween('created_at', [$from, $to]);

        $days = $delivered()->selectRaw('DATE(created_at) as day, COUNT(*) as orders, SUM(total_zig) as gmv, SUM(commission_zig) as commission, SUM(delivery_fee_zig + service_fee_zig + small_order_fee_zig) as fees, SUM(total_usd) as gmv_usd')
            ->groupBy('day')->orderBy('day')->get()->keyBy('day');
        $series = collect();
        for ($d = $from->copy(); $d->lte($to); $d->addDay()) {
            $row = $days[$d->toDateString()] ?? null;
            $series->push(['day' => $d->toDateString(), 'orders' => (int) ($row->orders ?? 0), 'gmv' => (float) ($row->gmv ?? 0), 'revenue' => (float) (($row->commission ?? 0) + ($row->fees ?? 0))]);
        }

        $all = $this->scoped(Order::query(), $request)->whereBetween('created_at', [$from, $to])->where('status', '!=', 'pending_payment');
        $gmv = (float) $delivered()->sum('total_zig');
        $count = $delivered()->count();

        return Inertia::render('admin/reports', [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'gmv' => $gmv,
                'gmv_usd' => (float) $delivered()->sum('total_usd'),
                'orders' => $count,
                'aov' => $count ? round($gmv / $count, 2) : 0,
                'commission' => (float) $delivered()->sum('commission_zig'),
                'fees' => (float) $delivered()->sum('delivery_fee_zig') + (float) $delivered()->sum('service_fee_zig') + (float) $delivered()->sum('small_order_fee_zig'),
                'discounts' => (float) $delivered()->sum('discount_zig'),
                'tips' => (float) $delivered()->sum('tip_zig'),
                'refunds' => (float) (clone $all)->sum('refunded_zig'),
                'driver_pay' => (float) $delivered()->sum('driver_pay_zig'),
                'cancel_rate' => (clone $all)->count() ? round((clone $all)->whereIn('status', ['cancelled', 'rejected'])->count() / (clone $all)->count() * 100, 1) : 0,
                'avg_delivery_minutes' => (int) round((float) $delivered()->whereNotNull('delivered_at')->get(['created_at', 'delivered_at'])->avg(fn ($o) => $o->created_at->diffInMinutes($o->delivered_at))),
            ],
            'series' => $series,
            'byPayment' => $delivered()->selectRaw('payment_method, COUNT(*) as orders, SUM(total_zig) as gmv')->groupBy('payment_method')->orderByDesc('gmv')->get(),
            'bySource' => $delivered()->selectRaw('source, COUNT(*) as orders, SUM(total_zig) as gmv')->groupBy('source')->get(),
            'byStore' => $delivered()->selectRaw('vendor_id, COUNT(*) as orders, SUM(total_zig) as gmv, SUM(commission_zig) as commission')->groupBy('vendor_id')->orderByDesc('gmv')->limit(10)->with('vendor:id,name')->get(),
            'byZone' => $delivered()->selectRaw('zone_id, COUNT(*) as orders, SUM(total_zig) as gmv')->groupBy('zone_id')->with('zone:id,name')->get(),
            'byHour' => $delivered()->get(['created_at'])->groupBy(fn ($o) => (int) $o->created_at->format('G'))->map->count()->sortKeys(),
            'topItems' => OrderItem::join('orders', 'orders.id', '=', 'order_items.order_id')
                ->where('orders.status', 'delivered')->whereBetween('orders.created_at', [$from, $to])
                ->when($request->user()->scopedVendorId(), fn ($q, $v) => $q->where('orders.vendor_id', $v))
                ->selectRaw('order_items.name, SUM(order_items.quantity) as qty, SUM(order_items.line_total_zig) as revenue')
                ->groupBy('order_items.name')->orderByDesc('qty')->limit(10)->get(),
        ]);
    }

    /** CSV exports: orders, stores, payments (finance-ready). */
    public function export(Request $request, string $report): StreamedResponse
    {
        [$from, $to] = $this->range($request);
        abort_unless(in_array($report, ['orders', 'stores'], true), 404);
        AuditLog::record("report.$report.exported", null, ['from' => $from->toDateString(), 'to' => $to->toDateString()]);

        return response()->streamDownload(function () use ($report, $from, $to, $request) {
            $out = fopen('php://output', 'w');
            if ($report === 'orders') {
                fputcsv($out, ['Reference', 'Date', 'Store', 'Source', 'Fulfilment', 'Status', 'Payment', 'Payment status', 'Subtotal', 'Delivery', 'Service', 'Small order', 'Discount', 'Tip', 'VAT', 'Total ZiG', 'Rate', 'Total USD', 'Commission', 'Driver pay', 'Refunded']);
                $this->scoped(Order::query(), $request)->with('vendor:id,name')->whereBetween('created_at', [$from, $to])->where('status', '!=', 'pending_payment')
                    ->chunk(500, function ($rows) use ($out) {
                        foreach ($rows as $o) {
                            fputcsv($out, [$o->reference, $o->created_at->toDateTimeString(), $o->vendor?->name, $o->source, $o->fulfilment, $o->status, $o->payment_method, $o->payment_status, $o->subtotal_zig, $o->delivery_fee_zig, $o->service_fee_zig, $o->small_order_fee_zig, $o->discount_zig, $o->tip_zig, $o->vat_zig, $o->total_zig, $o->zig_per_usd, $o->total_usd, $o->commission_zig, $o->driver_pay_zig, $o->refunded_zig]);
                        }
                    });
            } else {
                fputcsv($out, ['Store', 'Orders', 'GMV ZiG', 'Commission ZiG', 'Store payout ZiG']);
                $this->scoped(Order::query(), $request)->where('status', 'delivered')->whereBetween('created_at', [$from, $to])
                    ->selectRaw('vendor_id, COUNT(*) as orders, SUM(total_zig) as gmv, SUM(commission_zig) as commission, SUM(vendor_payout_zig) as payout')
                    ->groupBy('vendor_id')->with('vendor:id,name')->get()
                    ->each(fn ($r) => fputcsv($out, [$r->vendor?->name, $r->orders, $r->gmv, $r->commission, $r->payout]));
            }
            fclose($out);
        }, "zvino-{$report}-{$from->toDateString()}-to-{$to->toDateString()}.csv", ['Content-Type' => 'text/csv']);
    }
}

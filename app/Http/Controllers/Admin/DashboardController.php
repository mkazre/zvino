<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DashboardController extends AdminController
{
    public function __invoke(Request $request)
    {
        // Cashiers and kitchen staff land straight on their tool.
        return match ($request->user()->role) {
            'cashier' => redirect()->route('admin.pos'),
            'kitchen' => redirect()->route('admin.kitchen'),
            default => $this->dashboard($request),
        };
    }

    private function dashboard(Request $request)
    {
        $paid = fn () => $this->scoped(Order::query(), $request)->where('payment_status', 'paid');
        $today = now()->startOfDay();

        $revenueToday = (float) $paid()->where('created_at', '>=', $today)->sum('total_zig');
        $revenueYesterday = (float) $paid()->whereBetween('created_at', [$today->copy()->subDay(), $today])->sum('total_zig');
        $ordersToday = $this->scoped(Order::query(), $request)->where('created_at', '>=', $today)->where('status', '!=', 'pending_payment')->count();

        $daily = $paid()->where('created_at', '>=', now()->subDays(13)->startOfDay())
            ->selectRaw('DATE(created_at) as day, SUM(total_zig) as revenue, COUNT(*) as orders')
            ->groupBy('day')->orderBy('day')->get()->keyBy('day');

        $series = collect(range(13, 0))->map(function ($ago) use ($daily) {
            $d = now()->subDays($ago)->toDateString();

            return ['day' => $d, 'revenue' => (float) ($daily[$d]->revenue ?? 0), 'orders' => (int) ($daily[$d]->orders ?? 0)];
        });

        $topVendors = $this->scoped(Order::query(), $request)->where('payment_status', 'paid')
            ->where('created_at', '>=', now()->subDays(30))
            ->select('vendor_id', DB::raw('SUM(total_zig) as revenue'), DB::raw('COUNT(*) as orders'))
            ->groupBy('vendor_id')->orderByDesc('revenue')->limit(5)->with('vendor:id,name,rating')->get()
            ->map(fn ($r) => ['name' => $r->vendor?->name, 'rating' => $r->vendor?->rating, 'revenue' => (float) $r->revenue, 'orders' => $r->orders]);

        return Inertia::render('admin/dashboard', [
            'kpis' => [
                'revenue_today' => $revenueToday,
                'revenue_change_pct' => $revenueYesterday > 0 ? round(($revenueToday - $revenueYesterday) / $revenueYesterday * 100, 1) : null,
                'orders_today' => $ordersToday,
                'active_orders' => $this->scoped(Order::active(), $request)->count(),
                'avg_order' => $ordersToday ? round($revenueToday / max(1, $paid()->where('created_at', '>=', $today)->count()), 2) : 0,
                'customers' => User::where('role', 'customer')->count(),
                'active_vendors' => Vendor::active()->count(),
            ],
            'series' => $series,
            'liveOrders' => OrderResource::collection($this->scoped(Order::active(), $request)->with('vendor', 'user')->latest()->limit(8)->get()),
            'topVendors' => $topVendors,
            'platformMode' => Setting::platformMode(),
            'singleVendorId' => Setting::singleVendorId(),
            'vendors' => Vendor::active()->orderBy('name')->get(['id', 'name']),
        ]);
    }
}

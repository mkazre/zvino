<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\OrderResource;
use App\Models\Driver;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\StoreAvailability;
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
        $range = (int) $request->query('range', 14);
        $range = in_array($range, [7, 14, 30, 90], true) ? $range : 14;
        $q = fn () => $this->scoped(Order::query(), $request);
        $delivered = fn () => $q()->where('status', 'delivered');
        $today = now()->startOfDay();
        $yesterday = $today->copy()->subDay();
        $sameTimeYesterday = now()->subDay();

        $gmvToday = (float) $delivered()->where('created_at', '>=', $today)->sum('total_zig') + (float) $q()->active()->where('created_at', '>=', $today)->where('payment_status', 'paid')->sum('total_zig');
        $gmvYesterday = (float) $q()->whereIn('status', ['delivered', ...Order::LIVE])->whereBetween('created_at', [$yesterday, $sameTimeYesterday])->sum('total_zig');
        $ordersToday = $q()->where('created_at', '>=', $today)->whereNotIn('status', ['pending_payment'])->count();
        $ordersYesterday = $q()->whereBetween('created_at', [$yesterday, $sameTimeYesterday])->whereNotIn('status', ['pending_payment'])->count();
        $pct = fn ($a, $b) => $b > 0 ? round(($a - $b) / $b * 100, 1) : null;

        $daily = $q()->whereIn('status', ['delivered'])->where('created_at', '>=', now()->subDays($range - 1)->startOfDay())
            ->selectRaw('DATE(created_at) as day, SUM(total_zig) as gmv, COUNT(*) as orders, SUM(commission_zig + service_fee_zig + delivery_fee_zig - driver_pay_zig) as net')
            ->groupBy('day')->orderBy('day')->get()->keyBy('day');
        $series = collect(range($range - 1, 0))->map(function ($ago) use ($daily) {
            $d = now()->subDays($ago)->toDateString();

            return ['day' => $d, 'gmv' => (float) ($daily[$d]->gmv ?? 0), 'orders' => (int) ($daily[$d]->orders ?? 0), 'net' => (float) ($daily[$d]->net ?? 0)];
        });

        $live = $q()->active()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');

        $topVendors = $delivered()->where('created_at', '>=', now()->subDays(30))
            ->select('vendor_id', DB::raw('SUM(total_zig) as gmv'), DB::raw('COUNT(*) as orders'))
            ->groupBy('vendor_id')->orderByDesc('gmv')->limit(6)->with('vendor:id,name,rating,logo_path')->get()
            ->map(fn ($r) => ['id' => $r->vendor_id, 'name' => $r->vendor?->name, 'logo' => $r->vendor?->logo_path, 'rating' => $r->vendor?->rating, 'gmv' => (float) $r->gmv, 'orders' => $r->orders]);

        $payments = $delivered()->where('created_at', '>=', now()->subDays(30))->selectRaw('payment_method, COUNT(*) as c, SUM(total_zig) as gmv')->groupBy('payment_method')->orderByDesc('gmv')->get();

        $availability = app(StoreAvailability::class);
        $stores = $this->scoped(Vendor::active(), $request, 'id')->with('hours')->get()->map(fn ($v) => $availability->status($v));

        $isPlatform = $request->user()->isPlatformStaff();

        return Inertia::render('admin/dashboard', [
            'range' => $range,
            'kpis' => [
                'gmv_today' => $gmvToday,
                'gmv_change' => $pct($gmvToday, $gmvYesterday),
                'orders_today' => $ordersToday,
                'orders_change' => $pct($ordersToday, $ordersYesterday),
                'aov_30d' => round((float) $delivered()->where('created_at', '>=', now()->subDays(30))->avg('total_zig'), 2),
                'avg_delivery_min' => (int) round((float) $delivered()->whereNotNull('delivered_at')->where('created_at', '>=', now()->subDays(7))->get(['created_at', 'delivered_at'])->avg(fn ($o) => $o->created_at->diffInMinutes($o->delivered_at))),
                'customers' => User::where('role', 'customer')->count(),
                'new_customers_7d' => User::where('role', 'customer')->where('created_at', '>=', now()->subDays(7))->count(),
                'cancel_rate_7d' => ($all = $q()->where('created_at', '>=', now()->subDays(7))->where('status', '!=', 'pending_payment')->count()) ? round($q()->where('created_at', '>=', now()->subDays(7))->whereIn('status', ['cancelled', 'rejected'])->count() / $all * 100, 1) : 0,
            ],
            'series' => $series,
            'live' => [
                'placed' => (int) ($live['placed'] ?? 0),
                'preparing' => (int) (($live['accepted'] ?? 0) + ($live['preparing'] ?? 0)),
                'ready' => (int) ($live['ready'] ?? 0),
                'on_the_way' => (int) (($live['picked_up'] ?? 0) + ($live['arriving'] ?? 0)),
                'scheduled' => $q()->where('status', 'scheduled')->count(),
            ],
            'fleet' => $isPlatform ? [
                'online' => Driver::where('is_online', true)->count(),
                'busy' => Driver::where('is_online', true)->whereHas('orders', fn ($o) => $o->whereIn('status', ['accepted', 'preparing', 'ready', 'picked_up', 'arriving']))->count(),
                'unassigned' => $q()->where('fulfilment', 'delivery')->whereNull('driver_id')->whereIn('status', ['accepted', 'preparing', 'ready'])->count(),
                'applications' => Driver::where('status', 'applied')->count(),
            ] : null,
            'stores' => [
                'open' => $stores->where('is_open', true)->count(),
                'closed' => $stores->where('is_open', false)->count(),
                'busy' => $stores->where('is_busy', true)->count(),
                'power_out' => $stores->where('power_out', true)->count(),
            ],
            'alerts' => array_values(array_filter([
                $isPlatform && ($n = Refund::where('status', 'requested')->count()) ? ['tone' => 'warning', 'text' => "$n refund request".($n > 1 ? 's' : '').' waiting', 'href' => '/admin/refunds'] : null,
                $isPlatform && ($n = $q()->where('fulfilment', 'delivery')->whereNull('driver_id')->whereIn('status', ['accepted', 'preparing', 'ready'])->where('accepted_at', '<', now()->subMinutes(5))->count()) ? ['tone' => 'danger', 'text' => "$n order".($n > 1 ? 's' : '').' waiting more than 5 min for a driver', 'href' => '/admin/dispatch'] : null,
                ($n = $q()->where('status', 'placed')->where('created_at', '<', now()->subMinutes(4))->count()) ? ['tone' => 'danger', 'text' => "$n order".($n > 1 ? 's' : '').' not yet confirmed by the store', 'href' => '/admin/orders?status=placed'] : null,
                $isPlatform && ($n = Driver::where('status', 'applied')->count()) ? ['tone' => 'info', 'text' => "$n driver application".($n > 1 ? 's' : '').' to review', 'href' => '/admin/drivers?status=applied'] : null,
                ($stores->where('power_out', true)->count()) ? ['tone' => 'warning', 'text' => $stores->where('power_out', true)->count().' store(s) in load-shedding mode', 'href' => '/admin/vendors'] : null,
            ])),
            'liveOrders' => OrderResource::collection($q()->active()->with('vendor', 'user', 'driver.user')->latest()->limit(8)->get()),
            'topVendors' => $topVendors,
            'payments' => $payments,
            'platformMode' => Setting::platformMode(),
            'singleVendorId' => Setting::singleVendorId(),
            'vendors' => $isPlatform ? Vendor::active()->orderBy('name')->get(['id', 'name']) : [],
        ]);
    }
}

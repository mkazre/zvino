<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\OrderResource;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class OrderController extends AdminController
{
    public const STATUSES = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'];

    public function __construct(private OrderService $orders) {}

    public function index(Request $request)
    {
        $tab = $request->query('status', 'all');
        $search = $request->query('q');

        $base = fn () => $this->scoped(Order::query(), $request)->where('status', '!=', 'pending_payment');

        $orders = $base()->with('vendor', 'user', 'items')
            ->when($tab === 'active', fn ($q) => $q->active())
            ->when(in_array($tab, self::STATUSES, true), fn ($q) => $q->where('status', $tab))
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', $s))
            ->when($search, fn ($q) => $q->where(fn ($w) => $w->where('reference', 'like', "%$search%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%$search%")->orWhere('phone', 'like', "%$search%"))))
            ->latest()->paginate(25)->withQueryString();

        $counts = $base()->selectRaw('status, COUNT(*) as c')->groupBy('status')->pluck('c', 'status');

        return Inertia::render('admin/orders', [
            'orders' => OrderResource::collection($orders),
            'counts' => $counts->put('all', $counts->sum())->put('active', $base()->active()->count()),
            'filters' => ['status' => $tab, 'q' => $search, 'source' => $request->query('source')],
            'statuses' => self::STATUSES,
        ]);
    }

    public function updateStatus(Request $request, Order $order)
    {
        $this->authorizeVendor($request, $order->vendor_id);
        $data = $request->validate([
            'status' => ['required', 'in:'.implode(',', self::STATUSES)],
            'rider_name' => ['nullable', 'string', 'max:100'],
            'rider_phone' => ['nullable', 'string', 'max:30'],
        ]);

        if (! empty($data['rider_name'])) {
            $order->update(['rider_name' => $data['rider_name'], 'rider_phone' => $data['rider_phone'] ?? null]);
        }
        $this->orders->setStatus($order, $data['status']);

        return back()->with('success', "Order {$order->reference} → ".str_replace('_', ' ', $data['status']));
    }
}

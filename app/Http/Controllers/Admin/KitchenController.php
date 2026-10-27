<?php

namespace App\Http\Controllers\Admin;

use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class KitchenController extends AdminController
{
    public function index(Request $request)
    {
        $vendor = $this->currentVendor($request);

        $tickets = Order::with('items', 'user:id,name')
            ->where('vendor_id', $vendor?->id)
            ->whereIn('status', ['placed', 'accepted', 'preparing', 'ready'])
            ->oldest()->get()
            ->map(fn (Order $o) => [
                'id' => $o->id,
                'reference' => $o->reference,
                'stage' => $o->kitchen_stage,
                'status' => $o->status,
                'source' => $o->source,
                'fulfilment' => $o->fulfilment,
                'customer' => $o->user?->name,
                'notes' => $o->notes,
                'placed_at' => $o->created_at,
                'items' => $o->items->map(fn ($i) => ['name' => $i->name, 'quantity' => $i->quantity, 'options' => $i->options, 'notes' => $i->notes]),
            ]);

        return Inertia::render('admin/kitchen', [
            'vendor' => $vendor?->only('id', 'name'),
            'vendors' => $this->vendorOptions($request),
            'tickets' => $tickets,
            'pusherKey' => config('broadcasting.connections.pusher.key'),
        ]);
    }

    /** PATCH /admin/api/orders/{id}/stage: new → cooking → ready. */
    public function advance(Request $request, Order $order, OrderService $orders)
    {
        $this->authorizeVendor($request, $order->vendor_id);

        if ($order->kitchen_stage === 'ready') {
            // Bump off the board: pickup/dine-in complete; delivery waits for rider.
            $orders->setStatus($order, $order->fulfilment === 'delivery' ? 'picked_up' : 'delivered');
        } else {
            $orders->advanceKitchen($order);
        }

        return back();
    }
}

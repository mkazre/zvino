<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Vendor;
use App\Services\OrderService;
use App\Services\StoreAvailability;
use Illuminate\Http\Request;
use Inertia\Inertia;

class KitchenController extends AdminController
{
    public function index(Request $request, StoreAvailability $availability)
    {
        $vendor = $this->currentVendor($request);

        // item_id → station, from the item's category.
        $stations = \App\Models\Item::where('vendor_id', $vendor?->id)->with('category:id,station')->get()->mapWithKeys(fn ($i) => [$i->id => $i->category?->station]);

        $tickets = Order::with('items', 'user:id,name', 'driver.user:id,name')
            ->where('vendor_id', $vendor?->id)
            ->whereIn('status', ['placed', 'accepted', 'preparing', 'ready'])
            ->oldest()->get()
            ->map(fn (Order $o) => [
                'id' => $o->id,
                'reference' => $o->reference,
                'stage' => $o->status === 'placed' ? 'new' : $o->kitchen_stage,
                'status' => $o->status,
                'source' => $o->source,
                'fulfilment' => $o->fulfilment,
                'customer' => $o->user?->name,
                'driver' => $o->driver?->user?->name,
                'notes' => $o->notes,
                'placed_at' => $o->created_at,
                'accepted_at' => $o->accepted_at,
                'prep_minutes' => $o->prep_minutes ?? $vendor->prep_minutes,
                'scheduled_for' => $o->scheduled_for,
                'items' => $o->items->map(fn ($i) => ['name' => $i->name, 'quantity' => $i->quantity, 'options' => $i->options, 'notes' => $i->notes, 'station' => $stations[$i->item_id] ?? null]),
            ]);

        // Learned prep time: how long this kitchen actually takes (last 14 days).
        $learned = Order::where('vendor_id', $vendor?->id)->whereNotNull('accepted_at')->whereNotNull('ready_at')->where('created_at', '>=', now()->subDays(14))
            ->get(['accepted_at', 'ready_at'])->avg(fn ($o) => $o->accepted_at->diffInMinutes($o->ready_at));

        return Inertia::render('admin/kitchen', [
            'vendor' => $vendor ? $vendor->only('id', 'name', 'is_busy', 'busy_extra_minutes', 'power_out', 'prep_minutes') + ['effective_prep' => $availability->prepMinutes($vendor)] : null,
            'vendors' => $this->vendorOptions($request),
            'tickets' => $tickets,
            'stations' => $stations->filter()->unique()->values(),
            'learnedPrep' => $learned ? (int) round($learned) : null,
        ]);
    }

    /** PATCH /admin/api/orders/{id}/stage: new → cooking → ready → handed over (pickup/dine-in). */
    public function advance(Request $request, Order $order, OrderService $orders)
    {
        $this->authorizeVendor($request, $order->vendor_id);

        if ($order->kitchen_stage === 'ready' && $order->status === 'ready') {
            abort_if($order->fulfilment === 'delivery', 422, 'Delivery orders leave the board when the driver picks them up.');
            $orders->setStatus($order, 'delivered');
        } else {
            $orders->advanceKitchen($order);
        }

        return back();
    }

    /** Rush mode: kitchen is swamped, so add prep time and push ETAs out for new app orders. */
    public function rush(Request $request, Vendor $vendor)
    {
        $this->authorizeVendor($request, $vendor->id);
        $data = $request->validate(['is_busy' => ['required', 'boolean'], 'busy_extra_minutes' => ['nullable', 'integer', 'between:5,60']]);
        $vendor->update(array_filter($data, fn ($v) => $v !== null));
        AuditLog::record($data['is_busy'] ? 'kitchen.rush_on' : 'kitchen.rush_off', $vendor);

        return back()->with('success', $data['is_busy'] ? 'Rush mode on: customers see longer prep times.' : 'Rush mode off.');
    }
}

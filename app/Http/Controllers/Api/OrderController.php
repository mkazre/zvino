<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\OrderResource;
use App\Models\Item;
use App\Models\Order;
use App\Services\CartService;
use App\Services\OrderService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function __construct(private OrderService $orders) {}

    public function index(Request $request)
    {
        $orders = $request->user()->orders()->with('vendor', 'items')
            ->where('status', '!=', 'pending_payment')
            ->latest()->paginate(20);

        return OrderResource::collection($orders);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'fulfilment' => ['required', 'in:delivery,pickup'],
            'address_id' => ['required_if:fulfilment,delivery', 'nullable', Rule::exists('addresses', 'id')->where('user_id', $request->user()->id)],
            'payment_method' => ['required', Rule::in(OrderService::METHODS)],
            'phone' => ['required_if:payment_method,ecocash,onemoney,innbucks', 'nullable', 'string'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        [$order, $payment] = $this->orders->placeFromCart($request->user(), $data);

        return response()->json([
            'order' => new OrderResource($order),
            'payment' => $payment->only('id', 'status', 'method', 'redirect_url'),
            'next' => match (true) {
                $payment->status === 'paid' || $data['payment_method'] === 'cash' => 'track',
                (bool) $payment->redirect_url => 'redirect',
                default => 'await_phone_approval',
            },
        ], 201);
    }

    public function show(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        return new OrderResource($order->load('vendor', 'items', 'address'));
    }

    /** Polling fallback for OrderTracking; live updates arrive on private-order.{id}. */
    public function track(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);

        return response()->json([
            'id' => $order->id,
            'reference' => $order->reference,
            'status' => $order->status,
            'payment_status' => $order->payment_status,
            'status_history' => $order->status_history,
            'rider' => $order->rider_name ? $order->only('rider_name', 'rider_phone', 'rider_lat', 'rider_lng') : null,
            'vendor' => $order->vendor->only('name', 'lat', 'lng'),
            'destination' => $order->address?->only('line1', 'lat', 'lng'),
            'channel' => 'private-order.'.$order->id,
        ]);
    }

    public function reorder(Request $request, Order $order)
    {
        abort_unless($order->user_id === $request->user()->id, 404);
        $carts = app(CartService::class);
        $items = Item::whereIn('id', $order->items->pluck('item_id'))->where('is_available', true)->get()->keyBy('id');

        foreach ($order->items as $line) {
            if ($item = $items->get($line->item_id)) {
                $carts->add($request->user(), $item, $line->quantity, $line->options['variant'] ?? null, $line->options['modifiers'] ?? [], $line->notes, true);
            }
        }

        return response()->json($carts->present($carts->for($request->user())));
    }
}

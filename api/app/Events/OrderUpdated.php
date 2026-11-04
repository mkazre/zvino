<?php

namespace App\Events;

use App\Models\Order;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Broadcast synchronously (ShouldBroadcastNow) so no long-running queue worker
 * is required on shared hosting. Pusher handles the WebSocket side.
 */
class OrderUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public Order $order) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('order.'.$this->order->id),
            new PrivateChannel('vendor.'.$this->order->vendor_id.'.orders'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'order.updated';
    }

    public function broadcastWith(): array
    {
        return $this->order->only(
            'id', 'reference', 'status', 'kitchen_stage', 'payment_status',
            'rider_name', 'rider_lat', 'rider_lng', 'status_history', 'updated_at'
        );
    }
}

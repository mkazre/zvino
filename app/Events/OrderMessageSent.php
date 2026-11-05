<?php

namespace App\Events;

use App\Models\OrderMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

class OrderMessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public OrderMessage $message) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('order.'.$this->message->order_id)];
    }

    public function broadcastAs(): string
    {
        return 'message.sent';
    }

    public function broadcastWith(): array
    {
        return $this->message->only('id', 'sender_id', 'sender_role', 'channel', 'body', 'created_at');
    }
}

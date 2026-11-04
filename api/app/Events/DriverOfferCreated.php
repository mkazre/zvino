<?php

namespace App\Events;

use App\Models\DispatchOffer;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/** Rings the driver app instantly (Pusher); push notification is the backup. */
class DriverOfferCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public DispatchOffer $offer) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('driver.'.$this->offer->driver_id)];
    }

    public function broadcastAs(): string
    {
        return 'offer.created';
    }

    public function broadcastWith(): array
    {
        return ['offer_id' => $this->offer->id, 'order_id' => $this->offer->order_id, 'expires_at' => $this->offer->expires_at->toIso8601String()];
    }
}

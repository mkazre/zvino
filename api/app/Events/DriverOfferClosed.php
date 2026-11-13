<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/** Closes the offer popup on a driver's phone: another driver took the job, or it was withdrawn. */
class DriverOfferClosed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $driverId, public int $offerId, public string $reason) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('driver.'.$this->driverId)];
    }

    public function broadcastAs(): string
    {
        return 'offer.closed';
    }

    public function broadcastWith(): array
    {
        return ['offer_id' => $this->offerId, 'reason' => $this->reason];
    }
}

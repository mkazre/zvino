<?php

namespace App\Events;

use App\Models\Driver;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/** Moves the rider pin on the customer's tracking map. */
class DriverLocationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public Driver $driver, public array $orderIds) {}

    public function broadcastOn(): array
    {
        return array_map(fn ($id) => new PrivateChannel('order.'.$id), $this->orderIds);
    }

    public function broadcastAs(): string
    {
        return 'driver.location';
    }

    public function broadcastWith(): array
    {
        return ['lat' => $this->driver->lat, 'lng' => $this->driver->lng, 'heading' => $this->driver->heading, 'at' => now()->toIso8601String()];
    }
}

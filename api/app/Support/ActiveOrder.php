<?php

namespace App\Support;

use App\Models\Order;
use App\Models\User;

/** The customer's order that's on its way right now (for the floating "track your order" button). */
class ActiveOrder
{
    public const STATUSES = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving'];

    private const LABELS = [
        'placed' => 'Waiting for the store', 'accepted' => 'Order confirmed', 'preparing' => 'Being prepared',
        'ready' => 'Ready', 'picked_up' => 'On the way', 'arriving' => 'Almost there',
    ];

    public static function for(?User $user, bool $absoluteUrls = false): ?array
    {
        if (! $user || $user->isStaff()) {
            return null;
        }
        $orders = Order::where('user_id', $user->id)->whereIn('status', self::STATUSES)
            ->where('created_at', '>=', now()->subDay()) // never show a stuck order forever
            ->with('vendor:id,name,logo_path')->latest()->limit(5)->get(['id', 'reference', 'status', 'fulfilment', 'vendor_id', 'estimated_delivery_at', 'created_at']);
        $o = $orders->first();
        if (! $o) {
            return null;
        }
        $logo = $o->vendor?->logo_path;
        if ($logo && $absoluteUrls && ! str_starts_with($logo, 'http')) {
            $logo = rtrim(config('app.url'), '/').$logo;
        }
        $label = self::LABELS[$o->status] ?? 'In progress';
        if ($o->fulfilment === 'pickup' && $o->status === 'ready') {
            $label = 'Ready to collect';
        }

        return [
            'id' => $o->id,
            'reference' => $o->reference,
            'status' => $o->status,
            'label' => $label,
            'store' => $o->vendor?->name,
            'logo' => $logo,
            'eta' => $o->estimated_delivery_at?->toIso8601String(),
            'live' => $o->fulfilment === 'delivery' && in_array($o->status, ['picked_up', 'arriving'], true),
            'more' => $orders->count() - 1, // other live orders
        ];
    }
}

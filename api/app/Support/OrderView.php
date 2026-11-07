<?php

namespace App\Support;

use App\Models\Order;
use App\Models\Setting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\URL;

/**
 * The customer's view of an order (website order page and the app's order screen):
 * the stage timeline, the illustrated banner for the current stage, the receipt and the details.
 * One place, so the website and the apps always say the same thing.
 */
class OrderView
{
    /** Stage → banner image (public/images/tracking) and wording. */
    private const BANNERS = [
        'pending_payment' => ['waiting-for-payment', 'Waiting for payment', 'Approve the payment prompt on your phone to send your order.'],
        'scheduled' => ['scheduled', 'Scheduled', null],
        'placed' => ['order-received', 'Order received', 'Waiting for {store} to confirm.'],
        'accepted' => ['confirmed', 'Order confirmed', '{store} is getting started.'],
        'preparing' => ['preparing', 'Being prepared', 'Your food is being cooked fresh at {store}.'],
        'ready' => ['ready-delivery', 'Ready', 'Packed and waiting for your driver.'],
        'ready_pickup' => ['ready-to-collect', 'Ready to collect', 'Collect from {store}{store_address}.'],
        'picked_up' => ['on-the-way', 'On the way', '{driver} is on the way to {address}.'],
        'arriving' => ['almost-there', 'Almost there', '{driver} is just around the corner.'],
        'delivered' => ['delivered', 'Delivered', '{address}'],
        'collected' => ['delivered', 'Collected', 'Enjoy your meal!'],
        'cancelled' => ['cancelled', 'Order cancelled', 'Any payment has been returned to your Zvino wallet.'],
        'rejected' => ['restaurant-rejected', 'Restaurant couldn’t take your order', 'You’ve been fully refunded to your Zvino wallet.'],
    ];

    public static function forCustomer(Order $order, bool $web = true): array
    {
        $order->loadMissing('vendor', 'items', 'address', 'driver.user', 'review', 'user');
        $pickup = $order->fulfilment === 'pickup';
        $at = self::times($order);
        $vars = [
            '{store}' => $order->vendor->name,
            '{store_address}' => $order->vendor->address ? ', '.$order->vendor->address : '',
            '{driver}' => $order->driver?->user?->name ? explode(' ', $order->driver->user->name)[0] : 'Your driver',
            '{address}' => self::addressLine($order) ?: 'your address',
        ];

        // Stage key for the banner.
        $key = match (true) {
            $order->status === 'ready' && $pickup => 'ready_pickup',
            $order->status === 'delivered' && $pickup => 'collected',
            default => $order->status,
        };
        [$image, $title, $sub] = self::BANNERS[$key] ?? self::BANNERS['placed'];
        if ($key === 'scheduled' && $order->scheduled_for) {
            $sub = 'We’ll send your order to '.$order->vendor->name.' in time for '.$order->scheduled_for->timezone('Africa/Harare')->format('D j M, H:i').'.';
        }

        // Timeline: every stage, ticked when reached.
        $steps = $pickup
            ? [['placed', 'Order received'], ['accepted', 'Order confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready to collect'], ['delivered', 'Collected']]
            : [['placed', 'Order received'], ['accepted', 'Order confirmed'], ['preparing', 'Being prepared'], ['ready', 'Ready for your driver'], ['picked_up', 'Collected by driver'], ['arriving', 'Almost there'], ['delivered', 'Delivered']];
        $flow = ['pending_payment', 'scheduled', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];
        $pos = array_search($order->status, $flow, true);
        $stopped = in_array($order->status, ['cancelled', 'rejected'], true);
        $timeline = [];
        foreach ($steps as [$s, $label]) {
            $reached = $stopped ? isset($at[$s]) : ($pos !== false && array_search($s, $flow, true) <= $pos);
            // Skipped stages (e.g. a store that went straight to "ready") still count as done.
            $timeline[] = [
                'key' => $s, 'label' => $label,
                'at' => $at[$s] ?? null,
                'state' => $reached ? ($s === $order->status && ! in_array($s, ['delivered'], true) ? 'current' : 'done') : 'upcoming',
                'detail' => $s === 'accepted' ? $order->vendor->name : ($s === 'picked_up' && $order->driver?->user ? $order->driver->user->name : null),
            ];
        }
        if ($stopped) {
            $timeline = array_values(array_filter($timeline, fn ($t) => $t['state'] !== 'upcoming'));
            $timeline[] = ['key' => $order->status, 'label' => $order->status === 'cancelled' ? 'Cancelled' : 'Declined by the restaurant', 'at' => $at[$order->status] ?? null, 'state' => 'stopped', 'detail' => $order->cancel_reason ?? $order->reject_reason];
        }

        $done = in_array($order->status, ['delivered', 'cancelled', 'rejected'], true);
        $time = match (true) {
            $order->status === 'delivered' => ['label' => $pickup ? 'Collected at' : 'Delivered at', 'at' => $at['delivered'] ?? $order->delivered_at?->toIso8601String()],
            $stopped => ['label' => $order->status === 'cancelled' ? 'Cancelled at' : 'Declined at', 'at' => $at[$order->status] ?? $order->updated_at->toIso8601String()],
            $order->status === 'scheduled' => ['label' => $pickup ? 'Collection time' : 'Delivery time', 'at' => $order->scheduled_for?->toIso8601String()],
            default => ['label' => $pickup ? 'Ready by (estimated)' : 'Delivery time (estimated)', 'at' => $order->estimated_delivery_at?->toIso8601String()],
        };

        $money = fn ($z) => Money::both((float) $z, $order->zig_per_usd);
        $driver = $order->driver?->user;

        return [
            'id' => $order->id,
            'reference' => $order->reference,
            'status' => $order->status,
            'fulfilment' => $order->fulfilment,
            'is_done' => $done,
            'placed_at' => $order->created_at->toIso8601String(),
            'time' => $time,
            'banner' => [
                'key' => $key,
                'image' => ($web ? '' : rtrim(config('app.url'), '/')).'/images/tracking/'.$image.'.jpg',
                'title' => $title,
                'subtitle' => $sub ? strtr($sub, $vars) : null,
            ],
            'review_banner' => $order->status === 'delivered' && ! $order->review ? ($web ? '' : rtrim(config('app.url'), '/')).'/images/tracking/rate-your-order.jpg' : null,
            'timeline' => $timeline,
            'store' => ['id' => $order->vendor->id, 'name' => $order->vendor->name, 'slug' => $order->vendor->slug, 'logo' => $order->vendor->logo_path && ! $web && ! str_starts_with($order->vendor->logo_path, 'http') ? rtrim(config('app.url'), '/').$order->vendor->logo_path : $order->vendor->logo_path, 'address' => $order->vendor->address, 'phone' => $order->vendor->phone, 'lat' => $order->vendor->lat, 'lng' => $order->vendor->lng],
            'driver' => $driver && ! $done ? ['name' => $driver->name, 'phone' => $driver->phone, 'vehicle' => $order->driver->vehicle_type, 'plate' => $order->driver->vehicle_plate, 'rating' => $order->driver->rating, 'lat' => $order->driver->lat, 'lng' => $order->driver->lng, 'heading' => $order->driver->heading !== null ? (float) $order->driver->heading : null, 'located_at' => $order->driver->location_updated_at?->toIso8601String(), 'stops_before' => \App\Support\RoutePlanner::stopsBefore($order)] : null,
            // Live map: once the driver has collected a delivery order.
            'live' => $order->fulfilment === 'delivery' && in_array($order->status, ['picked_up', 'arriving'], true),
            'delivery_pin' => ! $done && $order->dropoff === 'hand_to_me' ? $order->delivery_pin : null,
            'can_cancel' => in_array($order->status, ['pending_payment', 'scheduled', 'placed'], true),
            'review' => $order->review?->only('vendor_rating', 'driver_rating', 'comment'),
            'receipt' => [
                'lines' => $order->items->map(fn ($i) => [
                    'name' => $i->name,
                    'quantity' => $i->quantity,
                    'options' => self::options($i->options),
                    'notes' => $i->notes,
                    'unit' => $money($i->unit_price_zig),
                    'total' => $money($i->line_total_zig),
                ])->values(),
                'totals' => array_values(array_filter([
                    ['label' => 'Subtotal', 'amount' => $money($order->subtotal_zig)],
                    (float) $order->discount_zig ? ['label' => 'Discount', 'amount' => $money(-$order->discount_zig)] : null,
                    ! $pickup ? ['label' => 'Delivery fee', 'amount' => $money($order->delivery_fee_zig)] : null,
                    ['label' => 'Service fee', 'amount' => $money($order->service_fee_zig), 'help' => 'Keeps Zvino running: support, payments and the app.'],
                    (float) $order->small_order_fee_zig ? ['label' => 'Small-order fee', 'amount' => $money($order->small_order_fee_zig)] : null,
                    (float) $order->tip_zig ? ['label' => 'Driver tip', 'amount' => $money($order->tip_zig)] : null,
                    (float) $order->donation_zig ? ['label' => 'Donation', 'amount' => $money($order->donation_zig)] : null,
                ])),
                'total' => $money($order->total_zig),
                'vat' => $money($order->vat_zig),
                'wallet_applied' => (float) $order->wallet_applied_zig ? $money($order->wallet_applied_zig) : null,
                'pdf_url' => URL::temporarySignedRoute('site.order.receipt', now()->addHours(2), ['order' => $order->id]),
            ],
            'details' => [
                'address' => $order->address ? array_filter([
                    'label' => $order->address->label ?? null,
                    'line1' => $order->address->line1,
                    'landmark' => $order->address->landmark ?? null,
                    'suburb' => $order->address->suburb,
                    'city' => $order->address->city,
                ]) : null,
                'address_lat' => $order->address?->lat, 'address_lng' => $order->address?->lng,
                'instructions' => trim(implode("\n", array_filter([$order->address?->instructions, $order->notes]))) ?: null,
                'dropoff' => $pickup ? null : ($order->dropoff === 'leave_at_door' ? 'Leave at the door' : 'Hand it to me'),
                'no_cutlery' => (bool) $order->no_cutlery,
                'account' => ['name' => $order->user?->name, 'phone' => $order->user?->phone, 'email' => $order->user?->email],
                'payment' => ['method' => self::paymentLabel($order->payment_method), 'status' => ucfirst(str_replace('_', ' ', $order->payment_status)), 'cash_part' => (float) $order->cash_part_zig ? $money($order->cash_part_zig) : null],
                'scheduled_for' => $order->scheduled_for?->toIso8601String(),
            ],
            'support' => ['phone' => Setting::get('general.support_phone'), 'whatsapp' => Setting::get('general.support_whatsapp')],
        ];
    }

    /** First time each status was reached, from the order's history. */
    private static function times(Order $order): array
    {
        $at = [];
        foreach ($order->status_history ?? [] as $h) {
            if (! empty($h['status']) && ! isset($at[$h['status']])) {
                $at[$h['status']] = Carbon::parse($h['at'])->toIso8601String();
            }
        }

        return $at;
    }

    public static function addressLine(Order $order): ?string
    {
        $a = $order->address;

        return $a ? implode(', ', array_filter([$a->line1, $a->suburb, $a->city])) : null;
    }

    /** ["Large", "Extra cheese"] from the stored {variant, modifiers}. */
    public static function options(mixed $options): array
    {
        if (! is_array($options)) {
            return [];
        }
        $out = [];
        if (! empty($options['variant'])) {
            $out[] = (string) $options['variant'];
        }
        foreach ((array) ($options['modifiers'] ?? []) as $m) {
            $out[] = is_array($m) ? (string) ($m['name'] ?? '') : (string) $m;
        }

        return array_values(array_filter($out));
    }

    public static function paymentLabel(?string $m): string
    {
        return ['ecocash' => 'EcoCash', 'onemoney' => 'OneMoney', 'innbucks' => 'InnBucks', 'card' => 'Card', 'wallet' => 'Zvino wallet', 'cash' => 'Cash on delivery', 'company' => 'Company account'][$m] ?? ucfirst(str_replace('_', ' ', (string) $m));
    }
}

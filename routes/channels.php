<?php

use App\Models\Order;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Customer tracking their own order (OrderTracking screen), or staff of that vendor.
Broadcast::channel('order.{orderId}', function ($user, $orderId) {
    $order = Order::find($orderId);

    return $order && ($order->user_id === $user->id
        || ($user->isStaff() && in_array($user->scopedVendorId(), [null, $order->vendor_id], true)));
});

// Kitchen display / admin live order feed for one vendor.
Broadcast::channel('vendor.{vendorId}.orders', function ($user, $vendorId) {
    return $user->isStaff() && in_array($user->scopedVendorId(), [null, (int) $vendorId], true);
});

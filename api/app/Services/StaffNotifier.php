<?php

namespace App\Services;

use App\Models\AppNotification;
use App\Models\User;
use App\Support\Permissions;

/**
 * Admin-panel notifications (bell, pop-ups and sounds) for everyone who should know:
 * platform staff with the permission, plus the store's own staff (manager, cashier, kitchen)
 * for events at their store.
 */
class StaffNotifier
{
    /** @param string[] $permissions any of these lets a staff member see the alert */
    public function notify(string $type, string $title, string $body, string $url, ?int $vendorId, array $permissions, array $data = []): void
    {
        try {
            $staff = User::whereIn('role', User::STAFF_ROLES)
                ->where(fn ($q) => $q->whereNull('vendor_id')->when($vendorId, fn ($w) => $w->orWhere('vendor_id', $vendorId)))
                ->get()
                ->filter(fn (User $u) => collect($permissions)->contains(fn ($p) => Permissions::allows($u, $p)));
            foreach ($staff as $u) {
                // Store staff only hear about their own store.
                if ($u->vendor_id && $u->vendor_id !== $vendorId) {
                    continue;
                }
                AppNotification::create(['user_id' => $u->id, 'type' => $type, 'title' => $title, 'body' => $body, 'data' => ['url' => $url] + $data]);
            }
        } catch (\Throwable $e) {
            report($e); // an alert must never break the order flow
        }
    }
}

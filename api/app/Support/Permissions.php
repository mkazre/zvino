<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Role → permission map. Defaults below; Admin → Roles & permissions can override
 * per role (stored in the permissions table). Super admin always has everything.
 */
class Permissions
{
    public const ALL = [
        'orders.view' => 'View orders',
        'orders.manage' => 'Change order status, assign drivers, cancel',
        'refunds.approve' => 'Approve or reject refunds',
        'catalog.manage' => 'Edit menus, prices and stock',
        'vendors.manage' => 'Add and edit stores, commission, payouts details',
        'drivers.manage' => 'Approve drivers, review documents, suspend',
        'dispatch.manage' => 'Use the ops command centre and manual dispatch',
        'customers.manage' => 'View customers, wallet adjustments, bans',
        'staff.manage' => 'Create staff accounts and change roles',
        'marketing.manage' => 'Promos, rewards, home builder, campaigns',
        'payouts.manage' => 'Generate and mark payouts as paid',
        'reports.view' => 'Reports, exports and finance dashboards',
        'support.manage' => 'Support tickets and order chat',
        'settings.manage' => 'Platform settings, zones, fees, integrations',
        'audit.view' => 'View the audit log',
        'pos.use' => 'Use the point of sale',
        'kitchen.use' => 'Use the kitchen display',
    ];

    public const DEFAULTS = [
        'admin' => ['orders.view', 'orders.manage', 'refunds.approve', 'catalog.manage', 'vendors.manage', 'drivers.manage', 'dispatch.manage', 'customers.manage', 'marketing.manage', 'payouts.manage', 'reports.view', 'support.manage', 'audit.view', 'pos.use', 'kitchen.use'],
        'support' => ['orders.view', 'orders.manage', 'refunds.approve', 'dispatch.manage', 'customers.manage', 'support.manage'],
        'vendor_manager' => ['orders.view', 'orders.manage', 'catalog.manage', 'reports.view', 'pos.use', 'kitchen.use'],
        'cashier' => ['orders.view', 'pos.use'],
        'kitchen' => ['kitchen.use'],
    ];

    public static function for(string $role): array
    {
        if ($role === 'super_admin') {
            return array_keys(self::ALL);
        }

        return Cache::rememberForever("permissions.$role", function () use ($role) {
            $custom = DB::table('permissions')->where('role', $role)->pluck('permission')->all();

            return $custom ?: (self::DEFAULTS[$role] ?? []);
        });
    }

    public static function allows(User $user, string $permission): bool
    {
        return in_array($permission, self::for($user->role), true);
    }

    public static function set(string $role, array $permissions): void
    {
        abort_if($role === 'super_admin', 422, 'Super admin always has every permission.');
        DB::transaction(function () use ($role, $permissions) {
            DB::table('permissions')->where('role', $role)->delete();
            DB::table('permissions')->insert(collect($permissions)->intersect(array_keys(self::ALL))->map(fn ($p) => ['role' => $role, 'permission' => $p])->values()->all());
        });
        Cache::forget("permissions.$role");
    }
}

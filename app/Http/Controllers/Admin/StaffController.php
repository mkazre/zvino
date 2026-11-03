<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\Vendor;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;

class StaffController extends AdminController
{
    public function index()
    {
        $roles = array_values(array_diff(User::STAFF_ROLES, ['super_admin']));

        return Inertia::render('admin/staff', [
            'staff' => User::whereIn('role', User::STAFF_ROLES)->with('vendor:id,name')->orderBy('role')->orderBy('name')->get(['id', 'name', 'email', 'phone', 'role', 'vendor_id', 'banned_at', 'last_seen_at', 'created_at']),
            'roles' => User::STAFF_ROLES,
            'storeRoles' => User::STORE_ROLES,
            'vendors' => Vendor::orderBy('name')->get(['id', 'name']),
            'permissions' => Permissions::ALL,
            'matrix' => collect($roles)->mapWithKeys(fn ($r) => [$r => Permissions::for($r)]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:20'],
            'password' => ['required', Password::defaults()],
            'role' => ['required', Rule::in(User::STAFF_ROLES)],
            'vendor_id' => [Rule::requiredIf(in_array($request->input('role'), User::STORE_ROLES, true)), 'nullable', 'exists:vendors,id'],
        ]);
        abort_if($data['role'] === 'super_admin' && ! $request->user()->isSuperAdmin(), 403);
        if (! in_array($data['role'], User::STORE_ROLES, true)) {
            $data['vendor_id'] = null;
        }
        $user = User::create($data);
        AuditLog::record('staff.created', $user, ['role' => $user->role]);

        return back()->with('success', "{$user->name} can now sign in.");
    }

    public function update(Request $request, User $user)
    {
        abort_unless($user->isStaff(), 404);
        $data = $request->validate([
            'role' => ['sometimes', Rule::in(User::STAFF_ROLES)],
            'vendor_id' => ['sometimes', 'nullable', 'exists:vendors,id'],
            'active' => ['sometimes', 'boolean'],
            'password' => ['sometimes', 'nullable', Password::defaults()],
        ]);
        abort_if($user->is($request->user()) && isset($data['role']) && $data['role'] !== $user->role, 422, 'You cannot change your own role.');
        abort_if($user->is($request->user()) && isset($data['active']) && ! $data['active'], 422, 'You cannot deactivate yourself.');

        if (isset($data['active'])) {
            $data['banned_at'] = $data['active'] ? null : now();
            if (! $data['active']) {
                $user->tokens()->delete();
            }
            unset($data['active']);
        }
        if (empty($data['password'])) {
            unset($data['password']);
        }
        $user->update($data);
        AuditLog::record('staff.updated', $user, collect($data)->except('password')->all());

        return back()->with('success', 'Staff member updated.');
    }

    public function permissions(Request $request, string $role)
    {
        abort_unless(in_array($role, User::STAFF_ROLES, true), 404);
        $perms = $request->validate(['permissions' => ['present', 'array'], 'permissions.*' => [Rule::in(array_keys(Permissions::ALL))]])['permissions'];
        Permissions::set($role, $perms);
        AuditLog::record('permissions.updated', null, ['role' => $role, 'permissions' => $perms]);

        return back()->with('success', 'Permissions for '.str_replace('_', ' ', $role).' saved.');
    }
}

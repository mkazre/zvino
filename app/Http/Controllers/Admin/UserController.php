<?php

namespace App\Http\Controllers\Admin;

use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;

class UserController extends AdminController
{
    public function index(Request $request)
    {
        $type = $request->query('type', 'customers');
        $search = $request->query('q');

        $users = User::query()
            ->when($type === 'staff', fn ($q) => $q->whereIn('role', User::STAFF_ROLES)->with('vendor:id,name'),
                fn ($q) => $q->where('role', 'customer')->with('loyalty'))
            ->when($request->query('tier'), fn ($q, $t) => $q->whereHas('loyalty', fn ($l) => $l->where('tier', $t)))
            ->when($search, fn ($q) => $q->where(fn ($w) => $w->where('name', 'like', "%$search%")
                ->orWhere('phone', 'like', "%$search%")->orWhere('email', 'like', "%$search%")))
            ->withCount(['orders' => fn ($q) => $q->where('payment_status', 'paid')])
            ->withSum(['orders as spend_zig' => fn ($q) => $q->where('payment_status', 'paid')], 'total_zig')
            ->latest()->paginate(25)->withQueryString();

        return Inertia::render('admin/users', [
            'users' => $users,
            'filters' => ['type' => $type, 'q' => $search, 'tier' => $request->query('tier')],
            'tiers' => array_keys(config('zvino.loyalty.tiers')),
            'roles' => User::STAFF_ROLES,
            'vendors' => Vendor::orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Super admin creates staff logins (managers, cashiers, kitchen screens). */
    public function storeStaff(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', Password::defaults()],
            'role' => ['required', Rule::in(User::STAFF_ROLES)],
            'vendor_id' => ['required_unless:role,super_admin', 'nullable', 'exists:vendors,id'],
        ]);
        User::create($data);

        return back()->with('success', 'Staff account created.');
    }

    public function updateStaff(Request $request, User $user)
    {
        abort_unless($user->isStaff(), 404);
        $data = $request->validate([
            'role' => ['required', Rule::in(User::STAFF_ROLES)],
            'vendor_id' => ['required_unless:role,super_admin', 'nullable', 'exists:vendors,id'],
        ]);
        abort_if($user->is($request->user()) && $data['role'] !== 'super_admin', 422, 'You cannot demote yourself.');
        $user->update($data);

        return back()->with('success', 'Staff updated.');
    }
}

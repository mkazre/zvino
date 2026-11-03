<?php

namespace App\Http\Controllers\Admin;

use App\Models\Order;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Http\Request;

/** ⌘K command palette: orders by reference, customers by name/phone, stores by name. */
class SearchController extends AdminController
{
    public function __invoke(Request $request)
    {
        $q = trim((string) $request->query('q'));
        if (mb_strlen($q) < 2) {
            return response()->json([]);
        }
        $user = $request->user();
        $out = collect();

        if ($user->can('orders.view')) {
            $this->scoped(Order::query(), $request)->with('user:id,name')
                ->where(fn ($w) => $w->where('reference', 'like', "%$q%")->orWhereHas('user', fn ($u) => $u->where('phone', 'like', "%$q%")))
                ->latest()->limit(5)->get()
                ->each(fn ($o) => $out->push(['type' => 'order', 'label' => $o->reference, 'sub' => ($o->user?->name ?: 'Walk-in').' · '.str_replace('_', ' ', $o->status), 'href' => "/admin/orders/{$o->id}"]));
        }
        if ($user->can('customers.manage')) {
            User::where('role', 'customer')->where(fn ($w) => $w->where('name', 'like', "%$q%")->orWhere('phone', 'like', "%$q%")->orWhere('email', 'like', "%$q%"))
                ->limit(5)->get()
                ->each(fn ($u) => $out->push(['type' => 'customer', 'label' => $u->name ?: $u->phone, 'sub' => $u->phone, 'href' => "/admin/users/{$u->id}"]));
        }
        if ($user->can('vendors.manage')) {
            Vendor::where('name', 'like', "%$q%")->limit(5)->get()
                ->each(fn ($v) => $out->push(['type' => 'store', 'label' => $v->name, 'sub' => $v->city, 'href' => "/admin/vendors/{$v->id}"]));
        }
        if ($user->can('drivers.manage')) {
            \App\Models\Driver::with('user:id,name,phone')->whereHas('user', fn ($u) => $u->where('name', 'like', "%$q%")->orWhere('phone', 'like', "%$q%"))
                ->limit(5)->get()
                ->each(fn ($d) => $out->push(['type' => 'driver', 'label' => $d->user->name, 'sub' => $d->vehicle_plate, 'href' => "/admin/drivers/{$d->id}"]));
        }

        return response()->json($out->values());
    }
}

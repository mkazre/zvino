<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Vendor;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

abstract class AdminController extends Controller
{
    /** Limit a query to the signed-in staff member's vendor (super admins see all). */
    protected function scoped(Builder $query, Request $request, string $column = 'vendor_id'): Builder
    {
        return $query->when($request->user()->scopedVendorId(), fn ($q, $id) => $q->where($column, $id));
    }

    protected function authorizeVendor(Request $request, ?int $vendorId): void
    {
        $scope = $request->user()->scopedVendorId();
        abort_if($scope && $scope !== $vendorId, 403);
    }

    /** Vendor the staff member works for, or the one picked in the vendor switcher (super admin). */
    protected function currentVendor(Request $request): ?Vendor
    {
        $id = $request->user()->scopedVendorId() ?? $request->integer('vendor_id') ?: null;

        return $id ? Vendor::find($id) : Vendor::active()->orderBy('name')->first();
    }

    protected function vendorOptions(Request $request): array
    {
        return $this->scoped(Vendor::query(), $request, 'id')->orderBy('name')->get(['id', 'name'])->all();
    }
}

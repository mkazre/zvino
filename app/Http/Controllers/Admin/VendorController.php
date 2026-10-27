<?php

namespace App\Http\Controllers\Admin;

use App\Models\Order;
use App\Models\Setting;
use App\Models\Vendor;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class VendorController extends AdminController
{
    public function index(Request $request)
    {
        $vendors = Vendor::query()
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('q'), fn ($q, $s) => $q->where('name', 'like', "%$s%"))
            ->withCount(['orders as orders_30d' => fn ($q) => $q->where('payment_status', 'paid')->where('created_at', '>=', now()->subDays(30))])
            ->withSum(['orders as revenue_30d' => fn ($q) => $q->where('payment_status', 'paid')->where('created_at', '>=', now()->subDays(30))], 'total_zig')
            ->withSum(['orders as commission_30d' => fn ($q) => $q->where('payment_status', 'paid')->where('created_at', '>=', now()->subDays(30))], 'commission_zig')
            ->orderBy('name')->get();

        return Inertia::render('admin/vendors', [
            'vendors' => $vendors,
            'filters' => $request->only('status', 'q'),
            'cities' => config('zvino.cities'),
            'platformMode' => Setting::platformMode(),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['slug'] = Str::slug($data['name']).'-'.Str::lower(Str::random(4));
        Vendor::create($data);

        return back()->with('success', 'Vendor added.');
    }

    public function update(Request $request, Vendor $vendor)
    {
        $vendor->update($this->validated($request));

        return back()->with('success', 'Vendor saved.');
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'cuisine' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:500'],
            'city' => ['required', Rule::in(config('zvino.cities'))],
            'address' => ['nullable', 'string', 'max:200'],
            'lat' => ['nullable', 'numeric'],
            'lng' => ['nullable', 'numeric'],
            'status' => ['required', 'in:active,pending,suspended'],
            'commission_pct' => ['required', 'numeric', 'between:0,100'],
            'prep_minutes' => ['required', 'integer', 'min:1'],
            'delivery_fee_zig' => ['required', 'numeric', 'min:0'],
            'min_order_zig' => ['required', 'numeric', 'min:0'],
            'is_featured' => ['boolean'],
        ]);
    }
}

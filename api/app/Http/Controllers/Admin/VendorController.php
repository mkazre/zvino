<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Setting;
use App\Models\Vendor;
use App\Models\Zone;
use App\Services\StoreAvailability;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class VendorController extends AdminController
{
    public function index(Request $request, StoreAvailability $availability)
    {
        $paid30 = fn ($q) => $q->where('status', 'delivered')->where('created_at', '>=', now()->subDays(30));

        $vendors = Vendor::query()->with('zone:id,name', 'hours')
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('city'), fn ($q, $c) => $q->where('city', $c))
            ->when($request->query('q'), fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', "%$s%")->orWhere('cuisine', 'like', "%$s%")))
            ->withCount(['orders as orders_30d' => $paid30, 'items'])
            ->withSum(['orders as revenue_30d' => $paid30], 'total_zig')
            ->withSum(['orders as commission_30d' => $paid30], 'commission_zig')
            ->orderByDesc('is_featured')->orderBy('name')->get()
            ->map(fn (Vendor $v) => $v->toArray() + ['availability' => $availability->status($v), 'balance_zig' => $v->balance()]);

        return Inertia::render('admin/vendors', [
            'vendors' => $vendors,
            'filters' => $request->only('status', 'q', 'city'),
            'cities' => Setting::get('general.cities'),
            'zones' => Zone::orderBy('name')->get(['id', 'name']),
            'defaultCommission' => Setting::get('fees.default_commission_pct'),
        ]);
    }

    public function show(Vendor $vendor, StoreAvailability $availability)
    {
        $vendor->load('zone:id,name', 'hours', 'closures', 'staff:id,name,email,role,vendor_id,last_seen_at');
        $from = now()->subDays(30);
        $delivered = fn () => Order::where('vendor_id', $vendor->id)->where('status', 'delivered')->where('created_at', '>=', $from);

        return Inertia::render('admin/vendor-show', [
            'mapsKey' => \App\Models\Setting::get('integrations.google_maps_browser_key'),
            'vendor' => $vendor->toArray() + ['availability' => $availability->status($vendor), 'balance_zig' => $vendor->balance()],
            'stats' => [
                'orders_30d' => $delivered()->count(),
                'gmv_30d' => (float) $delivered()->sum('subtotal_zig'),
                'commission_30d' => (float) $delivered()->sum('commission_zig'),
                'rejected_30d' => Order::where('vendor_id', $vendor->id)->where('status', 'rejected')->where('created_at', '>=', $from)->count(),
                'avg_prep' => (int) round((float) $delivered()->whereNotNull('ready_at')->whereNotNull('accepted_at')->get()->avg(fn ($o) => $o->accepted_at->diffInMinutes($o->ready_at))),
                'items' => $vendor->items()->count(),
                'unavailable_items' => $vendor->items()->where('is_available', false)->count(),
            ],
            'daily' => $delivered()->selectRaw('DATE(created_at) as day, SUM(subtotal_zig) as gmv, COUNT(*) as orders')->groupBy('day')->orderBy('day')->get(),
            'recentOrders' => Order::where('vendor_id', $vendor->id)->with('user:id,name')->latest()->limit(10)->get(['id', 'reference', 'status', 'user_id', 'total_zig', 'created_at']),
            'payouts' => \App\Models\Payout::where('account_type', 'vendor')->where('account_id', $vendor->id)->latest()->limit(10)->get(),
            'cities' => Setting::get('general.cities'),
            'zones' => Zone::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['slug'] = Str::slug($data['name']).'-'.Str::lower(Str::random(4));
        $vendor = Vendor::create($data);
        foreach (range(0, 6) as $d) {
            $vendor->hours()->create(['weekday' => $d, 'opens_at' => '08:00:00', 'closes_at' => '22:00:00']);
        }
        AuditLog::record('vendor.created', $vendor);

        return redirect()->route('admin.vendors.show', $vendor)->with('success', "{$vendor->name} added. Set up the menu and staff next.");
    }

    public function update(Request $request, Vendor $vendor)
    {
        $data = $this->validated($request, $vendor);
        foreach (['logo' => 'logo_path', 'cover' => 'cover_path'] as $field => $column) {
            if ($request->hasFile($field)) {
                $data[$column] = '/storage/'.$request->file($field)->store('vendors', 'public');
            }
        }
        $vendor->update($data);
        AuditLog::record('vendor.updated', $vendor, collect($data)->except('payout_details')->all());

        return back()->with('success', 'Store saved.');
    }

    public function hours(Request $request, Vendor $vendor)
    {
        $data = $request->validate([
            'hours' => ['present', 'array'],
            'hours.*.weekday' => ['required', 'integer', 'between:0,6'],
            'hours.*.opens_at' => ['required', 'date_format:H:i'],
            'hours.*.closes_at' => ['required', 'date_format:H:i'],
            'closures' => ['array'],
            'closures.*.date' => ['required', 'date'],
            'closures.*.reason' => ['nullable', 'string', 'max:100'],
        ]);

        DB::transaction(function () use ($vendor, $data) {
            $vendor->hours()->delete();
            foreach ($data['hours'] as $h) {
                $vendor->hours()->create(['weekday' => $h['weekday'], 'opens_at' => $h['opens_at'].':00', 'closes_at' => $h['closes_at'].':00']);
            }
            $vendor->closures()->delete();
            foreach ($data['closures'] ?? [] as $c) {
                $vendor->closures()->create($c);
            }
        });
        AuditLog::record('vendor.hours', $vendor);

        return back()->with('success', 'Opening hours saved.');
    }

    private function validated(Request $request, ?Vendor $vendor = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'cuisine' => ['nullable', 'string', 'max:60'],
            'kind' => ['nullable', 'in:restaurant,grocery,market,pharmacy'],
            'tags' => ['nullable', 'array'],
            'description' => ['nullable', 'string', 'max:500'],
            'city' => ['required', Rule::in(Setting::get('general.cities'))],
            'zone_id' => ['nullable', 'exists:zones,id'],
            'address' => ['nullable', 'string', 'max:200'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email'],
            'lat' => ['nullable', 'numeric', 'between:-90,90'],
            'lng' => ['nullable', 'numeric', 'between:-180,180'],
            'status' => ['required', 'in:active,pending,suspended'],
            'commission_pct' => ['required', 'numeric', 'between:0,100'],
            'prep_minutes' => ['required', 'integer', 'between:1,180'],
            'price_level' => ['nullable', 'integer', 'between:1,4'],
            'delivery_fee_zig' => ['required', 'numeric', 'min:0'],
            'min_order_zig' => ['required', 'numeric', 'min:0'],
            'delivery_radius_km' => ['nullable', 'numeric', 'between:1,50'],
            'is_featured' => ['boolean'],
            'offers_delivery' => ['boolean'],
            'offers_pickup' => ['boolean'],
            'accepts_scheduled' => ['boolean'],
            'accepts_catering' => ['boolean'],
            'auto_accept' => ['boolean'],
            'payout_method' => ['nullable', 'in:ecocash,onemoney,innbucks,bank'],
            'payout_details' => ['nullable', 'array'],
            'logo' => ['nullable', 'image', 'max:4096'],
            'cover' => ['nullable', 'image', 'max:8192'],
        ]);

        return collect($data)->except(['logo', 'cover'])->all();
    }
}

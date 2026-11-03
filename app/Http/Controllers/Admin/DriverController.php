<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Driver;
use App\Models\DriverDocument;
use App\Models\Setting;
use App\Services\PushService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;

class DriverController extends AdminController
{
    public function index(Request $request)
    {
        $status = $request->query('status', 'all');
        $base = Driver::query();

        return Inertia::render('admin/drivers', [
            'drivers' => (clone $base)->with('user:id,name,phone,avatar_path', 'zone:id,name')
                ->withCount(['documents as pending_docs' => fn ($q) => $q->where('status', 'pending')])
                ->when($status === 'online', fn ($q) => $q->where('is_online', true))
                ->when(in_array($status, ['applied', 'approved', 'suspended', 'rejected'], true), fn ($q) => $q->where('status', $status))
                ->when($request->query('q'), fn ($q, $s) => $q->whereHas('user', fn ($u) => $u->where('name', 'like', "%$s%")->orWhere('phone', 'like', "%$s%"))->orWhere('vehicle_plate', 'like', "%$s%"))
                ->orderByRaw("CASE status WHEN 'applied' THEN 0 ELSE 1 END")->orderByDesc('is_online')->latest()
                ->paginate(30)->withQueryString()
                ->through(fn (Driver $d) => $d->toArray() + ['balance_zig' => $d->balance(), 'cash_held_zig' => $d->cashHeld()]),
            'counts' => [
                'all' => (clone $base)->count(),
                'online' => (clone $base)->where('is_online', true)->count(),
                'applied' => (clone $base)->where('status', 'applied')->count(),
                'approved' => (clone $base)->where('status', 'approved')->count(),
                'suspended' => (clone $base)->where('status', 'suspended')->count(),
            ],
            'filters' => ['status' => $status, 'q' => $request->query('q')],
        ]);
    }

    public function show(Driver $driver)
    {
        $driver->load('user', 'zone', 'documents');
        $from = now()->subDays(30);

        return Inertia::render('admin/driver-show', [
            'driver' => $driver->toArray() + ['balance_zig' => $driver->balance(), 'cash_held_zig' => $driver->cashHeld()],
            'requiredDocuments' => Setting::get('drivers.required_documents'),
            'zones' => \App\Models\Zone::orderBy('name')->get(['id', 'name']),
            'stats' => [
                'deliveries_30d' => $driver->orders()->where('status', 'delivered')->where('delivered_at', '>=', $from)->count(),
                'earned_30d' => (float) $driver->ledger()->whereIn('type', ['earning', 'tip'])->where('created_at', '>=', $from)->sum('amount_zig'),
                'tips_30d' => (float) $driver->ledger()->where('type', 'tip')->where('created_at', '>=', $from)->sum('amount_zig'),
                'avg_delivery_minutes' => (int) round((float) $driver->orders()->whereNotNull('delivered_at')->whereNotNull('picked_up_at')->where('delivered_at', '>=', $from)->get()->avg(fn ($o) => $o->picked_up_at->diffInMinutes($o->delivered_at))),
            ],
            'recentOrders' => $driver->orders()->with('vendor:id,name')->latest()->limit(15)->get(['id', 'reference', 'status', 'vendor_id', 'total_zig', 'driver_pay_zig', 'tip_zig', 'created_at']),
            'ledger' => $driver->ledger()->latest()->limit(30)->get(),
            'reviews' => \App\Models\Review::where('driver_id', $driver->id)->whereNotNull('driver_rating')->with('user:id,name')->latest()->limit(10)->get(),
        ]);
    }

    public function update(Request $request, Driver $driver, PushService $push)
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:applied,approved,suspended,rejected'],
            'zone_id' => ['sometimes', 'nullable', 'exists:zones,id'],
            'vehicle_type' => ['sometimes', 'in:motorbike,bicycle,car,on_foot'],
            'vehicle_make' => ['sometimes', 'nullable', 'string', 'max:60'],
            'vehicle_plate' => ['sometimes', 'nullable', 'string', 'max:20'],
            'reason' => ['nullable', 'string', 'max:300'],
        ]);

        if (($data['status'] ?? null) === 'approved' && $driver->status !== 'approved') {
            $missing = collect(Setting::get('drivers.required_documents'))->diff($driver->documents()->where('status', 'approved')->pluck('type'));
            abort_if($missing->isNotEmpty(), 422, 'Approve these documents first: '.$missing->map(fn ($m) => str_replace('_', ' ', $m))->implode(', '));
            $data['approved_at'] = now();
        }
        if (($data['status'] ?? null) === 'suspended') {
            $data['is_online'] = false;
        }

        $reason = $data['reason'] ?? null;
        unset($data['reason']);
        $driver->update($data);
        AuditLog::record('driver.updated', $driver, $data + ['reason' => $reason]);

        if (isset($data['status'])) {
            $msg = ['approved' => ['You’re approved! 🎉', 'Go online to start receiving deliveries.'], 'suspended' => ['Account suspended', $reason ?? 'Contact Zvino support.'], 'rejected' => ['Application update', $reason ?? 'Your application was not approved.']][$data['status']] ?? null;
            if ($msg) {
                $push->toUser($driver->user, 'driver_status', $msg[0], $msg[1]);
            }
        }

        return back()->with('success', 'Driver updated.');
    }

    public function reviewDocument(Request $request, DriverDocument $document)
    {
        $document->update($request->validate(['status' => ['required', 'in:approved,rejected'], 'note' => ['nullable', 'string', 'max:200']]));
        AuditLog::record('driver.document.'.$document->status, $document->driver, ['type' => $document->type]);

        return back()->with('success', ucfirst(str_replace('_', ' ', $document->type)).' '.$document->status.'.');
    }

    /** Documents are on the private disk; only staff with drivers.manage can view them. */
    public function documentFile(DriverDocument $document)
    {
        abort_unless(Storage::disk('local')->exists($document->path), 404);

        return Storage::disk('local')->response($document->path);
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Order;
use App\Models\Setting;
use App\Models\Zone;
use Illuminate\Http\Request;
use Inertia\Inertia;

class ZoneController extends AdminController
{
    public function index()
    {
        $zones = Zone::withCount(['vendors', 'drivers'])->orderBy('city')->orderBy('name')->get()->map(fn (Zone $z) => $z->toArray() + [
            'orders_7d' => Order::where('zone_id', $z->id)->where('created_at', '>=', now()->subDays(7))->count(),
            'online_drivers' => $z->drivers()->available()->count(),
        ]);

        return Inertia::render('admin/zones', [
            'zones' => $zones,
            'cities' => Setting::get('general.cities'),
            'mapsKey' => Setting::get('integrations.google_maps_browser_key'),
            'vendors' => \App\Models\Vendor::whereNotNull('lat')->get(['id', 'name', 'lat', 'lng', 'zone_id']),
            'safetyZones' => \App\Models\SafetyZone::orderBy('name')->get(),
            'nightZonesEnabled' => (bool) Setting::get('drivers.night_zones_enabled'),
        ]);
    }

    public function saveSafety(Request $request, ?\App\Models\SafetyZone $safetyZone = null)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'city' => ['nullable', 'string'],
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'radius_km' => ['required', 'numeric', 'between:0.1,10'],
            'night_from' => ['required', 'date_format:H:i'],
            'night_to' => ['required', 'date_format:H:i'],
            'note' => ['nullable', 'string', 'max:200'],
            'is_active' => ['boolean'],
        ]);
        $zone = $safetyZone ? tap($safetyZone)->update($data) : \App\Models\SafetyZone::create($data);
        AuditLog::record('safety_zone.saved', $zone, $data);

        return back()->with('success', 'Safety zone saved.');
    }

    public function destroySafety(\App\Models\SafetyZone $safetyZone)
    {
        AuditLog::record('safety_zone.deleted', $safetyZone);
        $safetyZone->delete();

        return back()->with('success', 'Safety zone removed.');
    }

    public function save(Request $request, ?Zone $zone = null)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'city' => ['required', 'string', 'max:60'],
            'polygon' => ['required', 'array', 'min:3'],
            'polygon.*' => ['array', 'size:2'],
            'polygon.*.*' => ['numeric'],
            'is_active' => ['boolean'],
            'base_delivery_fee_zig' => ['required', 'numeric', 'min:0'],
            'per_km_fee_zig' => ['required', 'numeric', 'min:0'],
            'free_km' => ['required', 'numeric', 'min:0'],
            'max_delivery_km' => ['required', 'numeric', 'min:1'],
            'min_order_zig' => ['required', 'numeric', 'min:0'],
            'surge_multiplier' => ['required', 'numeric', 'between:1,'.Setting::get('fees.max_surge')],
            'surge_reason' => ['nullable', 'string', 'max:80'],
            'extra_eta_minutes' => ['required', 'integer', 'between:0,120'],
        ]);

        if ($zone?->exists) {
            $zone->update($data);
        } else {
            $zone = Zone::create($data);
        }
        AuditLog::record('zone.saved', $zone, collect($data)->except('polygon')->all());

        // Stores inside the polygon join the zone automatically.
        \App\Models\Vendor::whereNotNull('lat')->get()->each(function ($v) use ($zone) {
            if ($zone->contains($v->lat, $v->lng)) {
                $v->update(['zone_id' => $zone->id]);
            }
        });

        return back()->with('success', "Zone “{$zone->name}” saved.");
    }

    /** Weather surge (#49): one tap applies the rain-mode surge to every active zone, tap again to clear. */
    public function rain(Request $request)
    {
        $on = $request->boolean('on');
        $multiplier = $on ? (float) Setting::get('fees.rain_surge') : 1;
        Zone::where('is_active', true)->update(['surge_multiplier' => $multiplier, 'surge_reason' => $on ? 'Rain: high demand' : null]);
        AuditLog::record($on ? 'zones.rain_on' : 'zones.rain_off', null, ['multiplier' => $multiplier]);

        return back()->with('success', $on ? "Rain mode on: {$multiplier}× delivery surge in every zone." : 'Rain mode off.');
    }

    public function destroy(Zone $zone)
    {
        $zone->delete();
        AuditLog::record('zone.deleted', null, ['name' => $zone->name]);

        return back()->with('success', 'Zone deleted.');
    }
}

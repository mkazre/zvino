import { Button } from '@/components/ui/button';
import { Badge, Card, Drawer, Field, Input, LiveMap, Page, PageHeader, Select, Switch, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { router, useForm } from '@inertiajs/react';
import { CloudRain, Map as MapIcon, Moon, Pencil, Plus, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';

interface Zone {
    id: number;
    name: string;
    city: string;
    polygon: [number, number][];
    is_active: boolean;
    base_delivery_fee_zig: number;
    per_km_fee_zig: number;
    free_km: number;
    max_delivery_km: number;
    min_order_zig: number;
    surge_multiplier: number;
    surge_reason: string | null;
    extra_eta_minutes: number;
    vendors_count: number;
    drivers_count: number;
    orders_7d: number;
    online_drivers: number;
}

interface SafetyZone { id: number; name: string; city: string | null; lat: number; lng: number; radius_km: number; night_from: string; night_to: string; note: string | null; is_active: boolean }

/** Circle as a polygon so the shared map component can draw it. */
const circle = (lat: number, lng: number, km: number): [number, number][] =>
    Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * 2 * Math.PI;
        return [lat + (km / 111) * Math.sin(a), lng + (km / (111 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a)] as [number, number];
    });

export default function Zones({ zones, cities, mapsKey, vendors, safetyZones = [], nightZonesEnabled }: { zones: Zone[]; cities: string[]; mapsKey: string | null; vendors: { id: number; name: string; lat: number; lng: number }[]; safetyZones?: SafetyZone[]; nightZonesEnabled?: boolean }) {
    const [editing, setEditing] = useState<Zone | 'new' | null>(null);
    const [safety, setSafety] = useState<SafetyZone | 'new' | null>(null);
    const confirm = useConfirm();

    return (
        <AdminLayout title="Zones & fees">
            <Page wide>
                <PageHeader title="Zones & delivery fees" description="Draw where Zvino delivers. Each zone sets its own delivery fee, minimum order and surge." actions={
                        <>
                            {zones.some((z) => z.surge_reason?.startsWith('Rain')) ? (
                                <Button variant="outline" onClick={() => router.post('/admin/zones-rain', { on: false })}><CloudRain /> Rain mode off</Button>
                            ) : (
                                <Button variant="outline" onClick={async () => (await confirm({ title: 'Turn on rain mode?', description: 'Applies the rain surge from Settings → Fees to every active zone. Customers see “Rain: high demand”.', confirmLabel: 'Rain mode on' })) && router.post('/admin/zones-rain', { on: true })}><CloudRain /> Rain mode</Button>
                            )}
                            <Button onClick={() => setEditing('new')}><Plus /> New zone</Button>
                        </>
                    } />

                <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
                    <LiveMap apiKey={mapsKey} className="h-[560px]" markers={vendors.map((v) => ({ id: `v${v.id}`, lat: v.lat, lng: v.lng, kind: 'store', label: v.name }))} polygons={[...zones.map((z) => ({ id: z.id, points: z.polygon, label: z.name, tone: (!z.is_active ? 'muted' : z.surge_multiplier > 1 ? 'gold' : 'brand') as 'muted' | 'gold' | 'brand' })), ...safetyZones.filter((s) => s.is_active).map((s) => ({ id: `s${s.id}`, points: circle(s.lat, s.lng, s.radius_km), label: `⚠ ${s.name}`, tone: 'gold' as const }))]} />

                    <div className="grid content-start gap-3">
                        {zones.length === 0 && <Card padded className="text-muted-foreground text-center text-sm"><MapIcon className="mx-auto mb-2 size-6" />No zones yet. Create one to start delivering.</Card>}
                        {zones.map((z) => (
                            <Card key={z.id} padded>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold">{z.name}</h3>
                                            {!z.is_active && <Badge>Inactive</Badge>}
                                            {z.surge_multiplier > 1 && <Badge tone="warning">{z.surge_multiplier}× surge</Badge>}
                                        </div>
                                        <p className="text-muted-foreground text-[13px]">{z.city} · {z.vendors_count} stores · {z.online_drivers}/{z.drivers_count} drivers online</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button size="icon-sm" variant="ghost" onClick={() => setEditing(z)} aria-label="Edit"><Pencil /></Button>
                                        <Button size="icon-sm" variant="ghost" className="text-zred" aria-label="Delete" onClick={async () => (await confirm({ title: `Delete ${z.name}?`, description: 'Stores in this zone fall back to their own flat delivery fee.', tone: 'danger', confirmLabel: 'Delete zone' })) && router.delete(`/admin/zones/${z.id}`)}><Trash2 /></Button>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                                    <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{zig(z.base_delivery_fee_zig)}</div><div className="text-muted-foreground">first {z.free_km} km</div></div>
                                    <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">+{zig(z.per_km_fee_zig)}</div><div className="text-muted-foreground">per km after</div></div>
                                    <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{z.orders_7d}</div><div className="text-muted-foreground">orders (7d)</div></div>
                                </div>
                                <div className="mt-3 flex items-center justify-between border-t pt-3">
                                    <span className="text-muted-foreground text-xs">Quick surge</span>
                                    <div className="flex gap-1">
                                        {[1, 1.25, 1.5, 2].map((m) => (
                                            <Button key={m} size="sm" variant={z.surge_multiplier === m ? 'dark' : 'outline'} className="h-7 px-2 text-xs" onClick={() => router.post(`/admin/zones/${z.id}`, { ...z, surge_multiplier: m, surge_reason: m > 1 ? (z.surge_reason ?? 'High demand') : null }, { preserveScroll: true })}>
                                                {m === 1 ? 'Off' : `${m}×`}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        ))}

                        <Card padded>
                            <div className="flex items-center justify-between">
                                <h3 className="flex items-center gap-2 font-semibold"><ShieldAlert className="size-4" /> Night safety zones</h3>
                                <Button size="sm" variant="outline" onClick={() => setSafety('new')}><Plus /> Add</Button>
                            </div>
                            <p className="text-muted-foreground mt-1 text-[13px]">Drivers see a warning on drop-offs here after dark, and drivers who opt out aren’t offered them.{!nightZonesEnabled && ' Currently switched off in Settings → Driver onboarding.'}</p>
                            <div className="mt-3 grid gap-2">
                                {safetyZones.length === 0 && <p className="text-muted-foreground text-xs">None yet.</p>}
                                {safetyZones.map((s) => (
                                    <div key={s.id} className="bg-subtle flex items-center gap-3 rounded-lg px-3 py-2">
                                        <Moon className="size-4 shrink-0" />
                                        <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}{!s.is_active && <span className="text-muted-foreground"> (off)</span>}</div><div className="text-muted-foreground text-xs">{s.radius_km} km · {s.night_from.slice(0, 5)}–{s.night_to.slice(0, 5)}{s.note && ` · ${s.note}`}</div></div>
                                        <Button size="icon-sm" variant="ghost" aria-label="Edit" onClick={() => setSafety(s)}><Pencil /></Button>
                                        <Button size="icon-sm" variant="ghost" className="text-zred" aria-label="Delete" onClick={async () => (await confirm({ title: `Remove ${s.name}?`, tone: 'danger', confirmLabel: 'Remove' })) && router.delete(`/admin/safety-zones/${s.id}`, { preserveScroll: true })}><Trash2 /></Button>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                </div>
            </Page>
            {safety && <SafetyDrawer zone={safety === 'new' ? null : safety} cities={cities} mapsKey={mapsKey} onClose={() => setSafety(null)} />}
            {editing && <ZoneDrawer zone={editing === 'new' ? null : editing} cities={cities} mapsKey={mapsKey} vendors={vendors} onClose={() => setEditing(null)} />}
        </AdminLayout>
    );
}

function ZoneDrawer({ zone, cities, mapsKey, vendors, onClose }: { zone: Zone | null; cities: string[]; mapsKey: string | null; vendors: { id: number; name: string; lat: number; lng: number }[]; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        name: zone?.name ?? '',
        city: zone?.city ?? cities[0],
        polygon: zone?.polygon ?? ([] as [number, number][]),
        is_active: zone?.is_active ?? true,
        base_delivery_fee_zig: zone?.base_delivery_fee_zig ?? 15,
        per_km_fee_zig: zone?.per_km_fee_zig ?? 4,
        free_km: zone?.free_km ?? 2,
        max_delivery_km: zone?.max_delivery_km ?? 10,
        min_order_zig: zone?.min_order_zig ?? 0,
        surge_multiplier: zone?.surge_multiplier ?? 1,
        surge_reason: zone?.surge_reason ?? '',
        extra_eta_minutes: zone?.extra_eta_minutes ?? 0,
    });
    const err = (k: string) => (errors as Record<string, string>)[k];
    const ex = (km: number) => data.base_delivery_fee_zig + Math.max(0, km - data.free_km) * data.per_km_fee_zig;

    return (
        <Drawer open onClose={onClose} width="xl" title={zone ? `Edit ${zone.name}` : 'New zone'} description="Click on the map to place the corners of the delivery area."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || data.polygon.length < 3} onClick={() => post(zone ? `/admin/zones/${zone.id}` : '/admin/zones', { onSuccess: onClose })}>Save zone</Button></>}>
            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                <div>
                    <LiveMap apiKey={mapsKey} className="h-[420px]" draft={data.polygon} markers={vendors.map((v) => ({ id: `v${v.id}`, lat: v.lat, lng: v.lng, kind: 'store', label: v.name }))} onMapClick={(lat, lng) => setData('polygon', [...data.polygon, [Number(lat.toFixed(6)), Number(lng.toFixed(6))]])} />
                    <div className="mt-2 flex items-center justify-between text-xs">
                        <span className={err('polygon') ? 'text-zred' : 'text-muted-foreground'}>{data.polygon.length} points {data.polygon.length < 3 && '· at least 3 needed'}</span>
                        <div className="flex gap-1">
                            <Button size="sm" variant="ghost" disabled={!data.polygon.length} onClick={() => setData('polygon', data.polygon.slice(0, -1))}><Undo2 /> Undo</Button>
                            <Button size="sm" variant="ghost" disabled={!data.polygon.length} onClick={() => setData('polygon', [])}>Clear</Button>
                        </div>
                    </div>
                </div>
                <div className="grid content-start gap-4">
                    <Field label="Zone name" error={err('name')}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Borrowdale & Mt Pleasant" /></Field>
                    <Field label="City"><Select value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Base fee"><Input type="number" prefix="ZiG" value={data.base_delivery_fee_zig} onChange={(e) => setData('base_delivery_fee_zig', Number(e.target.value))} /></Field>
                        <Field label="Covers first"><Input type="number" suffix="km" value={data.free_km} onChange={(e) => setData('free_km', Number(e.target.value))} /></Field>
                        <Field label="Per extra km"><Input type="number" prefix="ZiG" value={data.per_km_fee_zig} onChange={(e) => setData('per_km_fee_zig', Number(e.target.value))} /></Field>
                        <Field label="Max distance"><Input type="number" suffix="km" value={data.max_delivery_km} onChange={(e) => setData('max_delivery_km', Number(e.target.value))} /></Field>
                        <Field label="Minimum order"><Input type="number" prefix="ZiG" value={data.min_order_zig} onChange={(e) => setData('min_order_zig', Number(e.target.value))} /></Field>
                        <Field label="Extra ETA"><Input type="number" suffix="min" value={data.extra_eta_minutes} onChange={(e) => setData('extra_eta_minutes', Number(e.target.value))} /></Field>
                    </div>
                    <div className="bg-subtle rounded-lg border p-3 text-xs">
                        <div className="mb-1.5 font-semibold">Customer pays</div>
                        {[2, 5, 8].map((km) => <div key={km} className="flex justify-between"><span className="text-muted-foreground">{km} km away</span><span className="tabular font-medium">{zig(ex(km) * data.surge_multiplier)}</span></div>)}
                    </div>
                    <Field label="Surge multiplier" hint="1 = off. Applied to the delivery fee."><Input type="number" step="0.05" min={1} value={data.surge_multiplier} onChange={(e) => setData('surge_multiplier', Number(e.target.value))} suffix="×" /></Field>
                    {data.surge_multiplier > 1 && <Field label="Shown to customers as"><Input value={data.surge_reason} onChange={(e) => setData('surge_reason', e.target.value)} placeholder="Rain / high demand" /></Field>}
                    <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Zone active" />
                </div>
            </div>
        </Drawer>
    );
}

function SafetyDrawer({ zone, cities, mapsKey, onClose }: { zone: SafetyZone | null; cities: string[]; mapsKey: string | null; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        name: zone?.name ?? '',
        city: zone?.city ?? cities[0],
        lat: zone?.lat ?? 0,
        lng: zone?.lng ?? 0,
        radius_km: zone?.radius_km ?? 1,
        night_from: zone?.night_from?.slice(0, 5) ?? '19:00',
        night_to: zone?.night_to?.slice(0, 5) ?? '05:00',
        note: zone?.note ?? '',
        is_active: zone?.is_active ?? true,
    });
    const err = (k: string) => (errors as Record<string, string>)[k];
    const placed = data.lat !== 0 || data.lng !== 0;
    return (
        <Drawer open onClose={onClose} width="lg" title={zone ? `Edit ${zone.name}` : 'New safety zone'} description="Click the map to set the centre."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || !placed || !data.name} onClick={() => post(zone ? `/admin/safety-zones/${zone.id}` : '/admin/safety-zones', { onSuccess: onClose, preserveScroll: true })}>Save</Button></>}>
            <div className="grid gap-4">
                <LiveMap apiKey={mapsKey} className="h-[320px]" markers={[]} polygons={placed ? [{ id: 'c', points: circle(data.lat, data.lng, data.radius_km), label: data.name || 'Zone', tone: 'gold' }] : []} onMapClick={(lat, lng) => { setData('lat', Number(lat.toFixed(6))); setData('lng', Number(lng.toFixed(6))); }} />
                {err('lat') && <p className="text-zred text-xs">Click the map to place the zone.</p>}
                <Field label="Name" error={err('name')}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Mbare Musika (night)" /></Field>
                <div className="grid grid-cols-3 gap-3">
                    <Field label="Radius"><Input type="number" step="0.1" suffix="km" value={data.radius_km} onChange={(e) => setData('radius_km', Number(e.target.value))} /></Field>
                    <Field label="From"><Input type="time" value={data.night_from} onChange={(e) => setData('night_from', e.target.value)} /></Field>
                    <Field label="Until"><Input type="time" value={data.night_to} onChange={(e) => setData('night_to', e.target.value)} /></Field>
                </div>
                <Field label="City"><Select value={data.city ?? ''} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Note for drivers" optional><Input value={data.note} onChange={(e) => setData('note', e.target.value)} placeholder="Meet the customer at the main road" /></Field>
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Active" />
            </div>
        </Drawer>
    );
}

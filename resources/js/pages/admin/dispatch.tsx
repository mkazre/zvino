import { Button } from '@/components/ui/button';
import { Avatar, Badge, LiveDot, LiveMap, Segmented, StatusPill, useConfirm, type MapMarker } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import { AlertTriangle, Bike, Clock, RefreshCw, ShoppingBasket, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface LiveOrder {
    id: number;
    reference: string;
    status: string;
    fulfilment: string;
    store: { id: number; name: string; lat: number; lng: number } | null;
    shop?: boolean;
    seeing?: number;
    dropoff: { lat: number; lng: number; suburb?: string; line1?: string } | null;
    customer: string | null;
    driver: { id: number; name: string } | null;
    total_zig: number;
    age_minutes: number;
    eta: string | null;
    alerts: string[];
    offers: number;
}

interface LiveDriver {
    id: number;
    name: string;
    phone: string;
    lat: number;
    lng: number;
    vehicle: string;
    rating: number;
    active: number;
    stale: boolean;
    cash_held: number;
}

interface Snapshot {
    orders: LiveOrder[];
    drivers: LiveDriver[];
    stats: { live: number; unassigned: number; late: number; online_drivers: number; busy_drivers: number };
    at: string;
}

const ALERT_LABEL: Record<string, string> = { late: 'Late', no_driver: 'No driver', store_slow: 'Store slow', manual: 'Needs manual dispatch' };

export default function Dispatch(initial: Snapshot & { mapsKey: string | null; zones: { id: number; name: string; polygon: [number, number][]; surge_multiplier: number }[] }) {
    const [snap, setSnap] = useState<Snapshot>(initial);
    const [filter, setFilter] = useState<'attention' | 'all' | 'unassigned'>('attention');
    const [selected, setSelected] = useState<number | null>(null);
    const confirm = useConfirm();

    useEffect(() => {
        const t = setInterval(() => {
            fetch('/admin/dispatch/live', { headers: { Accept: 'application/json' } }).then((r) => r.ok && r.json()).then((d) => d && setSnap(d));
        }, 10000);
        return () => clearInterval(t);
    }, []);

    const orders = useMemo(() => {
        const list = snap.orders.filter((o) => (filter === 'all' ? true : filter === 'unassigned' ? o.alerts.includes('no_driver') : o.alerts.length > 0));
        return list.sort((a, b) => b.alerts.length - a.alerts.length || b.age_minutes - a.age_minutes);
    }, [snap, filter]);
    const sel = snap.orders.find((o) => o.id === selected) ?? null;

    const markers: MapMarker[] = [
        ...snap.drivers.map((d) => ({ id: `d${d.id}`, lat: d.lat, lng: d.lng, kind: (d.stale ? 'driver-stale' : d.active ? 'driver-busy' : 'driver') as MapMarker['kind'], label: `${d.name}${d.active ? ` · ${d.active} job` : ' · free'}` })),
        ...Object.values(Object.fromEntries(snap.orders.filter((o) => o.store).map((o) => [o.store!.id, o.store!]))).map((s) => ({ id: `s${s.id}`, lat: s.lat, lng: s.lng, kind: 'store' as const, label: s.name, alert: snap.orders.some((o) => o.store?.id === s.id && o.alerts.length > 0) })),
        ...(sel?.dropoff?.lat ? [{ id: `o${sel.id}`, lat: sel.dropoff.lat, lng: sel.dropoff.lng!, kind: 'dropoff' as const, label: sel.dropoff.suburb ?? 'Drop-off' }] : []),
    ].filter((m) => m.lat && m.lng);

    // Any online driver can be assigned (free or mid-run), nearest to the store first.
    const onlineNear = (o: LiveOrder) =>
        snap.drivers
            .filter((d) => !d.stale)
            .map((d) => ({ ...d, km: o.store ? Math.round(Math.hypot((d.lat - o.store.lat) * 111, (d.lng - o.store.lng) * 105) * 10) / 10 : null }))
            .sort((a, b) => (a.km ?? 99) - (b.km ?? 99))
            .slice(0, 10);

    return (
        <AdminLayout title="Command centre" fullBleed>
            <div className="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row">
                {/* Queue */}
                <aside className="bg-surface flex w-full flex-col border-b lg:w-[400px] lg:border-r lg:border-b-0">
                    <div className="border-b px-5 pt-5 pb-4">
                        <div className="flex items-center justify-between">
                            <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight"><LiveDot /> Command centre</h1>
                            <span className="text-muted-foreground text-xs">Updated {new Date(snap.at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        </div>
                        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                            {[['Live', snap.stats.live, ''], ['No driver', snap.stats.unassigned, snap.stats.unassigned ? 'text-zred' : ''], ['Late', snap.stats.late, snap.stats.late ? 'text-zred' : ''], ['Drivers', `${snap.stats.online_drivers - snap.stats.busy_drivers}/${snap.stats.online_drivers}`, '']].map(([l, v, c]) => (
                                <div key={String(l)} className="bg-subtle rounded-lg border px-2 py-2">
                                    <div className={cn('tabular text-lg font-bold', String(c))}>{String(v)}</div>
                                    <div className="text-muted-foreground text-[11px]">{String(l)}{l === 'Drivers' ? ' free' : ''}</div>
                                </div>
                            ))}
                        </div>
                        <Segmented className="mt-4 w-full" size="sm" value={filter} onChange={setFilter} options={[{ value: 'attention', label: 'Needs attention', count: snap.orders.filter((o) => o.alerts.length).length }, { value: 'unassigned', label: 'No driver', count: snap.stats.unassigned }, { value: 'all', label: 'All', count: snap.stats.live }]} />
                    </div>
                    <ul className="scroll-quiet flex-1 divide-y overflow-y-auto">
                        {orders.length === 0 && <li className="text-muted-foreground px-5 py-16 text-center text-sm">{filter === 'attention' ? 'All clear. Nothing needs attention. 🎉' : 'No live orders.'}</li>}
                        {orders.map((o) => (
                            <li key={o.id}>
                                <button onClick={() => setSelected(o.id === selected ? null : o.id)} className={cn('w-full px-5 py-3.5 text-left transition', o.id === selected ? 'bg-muted' : 'hover:bg-subtle')}>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-[13px] font-semibold">{o.reference}</span>
                                        <StatusPill status={o.status} />
                                        <span className={cn('tabular ml-auto flex items-center gap-1 text-xs', o.age_minutes > 40 ? 'text-zred font-semibold' : 'text-muted-foreground')}><Clock className="size-3" />{o.age_minutes}m</span>
                                    </div>
                                    <div className="text-muted-foreground mt-1 flex items-center gap-1.5 truncate text-xs">
                                        <Store className="size-3 shrink-0" /> {o.store?.name} → {o.dropoff?.suburb ?? label(o.fulfilment)}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                        {o.alerts.map((a) => <Badge key={a} tone="danger"><AlertTriangle className="size-3" />{ALERT_LABEL[a]}</Badge>)}
                                        {o.shop && <Badge tone="info"><ShoppingBasket className="size-3" />Shop order</Badge>}
                                        {o.driver ? <Badge tone="success"><Bike className="size-3" />{o.driver.name}</Badge> : o.fulfilment === 'delivery' && (o.seeing ? <Badge tone="info">{o.seeing} driver{o.seeing > 1 ? 's' : ''} deciding</Badge> : o.offers > 0 && <Badge>{o.offers} offer{o.offers > 1 ? 's' : ''} sent</Badge>)}
                                    </div>
                                </button>
                                {o.id === selected && (
                                    <div className="bg-muted grid gap-2 px-5 pb-4">
                                        {o.fulfilment === 'delivery' && !o.driver && (
                                            <>
                                                <div className="text-muted-foreground text-xs font-medium">{o.shop ? 'Assign a shopper (any online driver)' : 'Assign any online driver'}</div>
                                                {onlineNear(o).length === 0 && <p className="text-muted-foreground text-xs">No drivers online.</p>}
                                                {onlineNear(o).map((d) => (
                                                    <button key={d.id} onClick={async () => (await confirm({ title: `Assign ${d.name} to ${o.reference}?`, confirmLabel: 'Assign' })) && router.post(`/admin/dispatch/${o.id}/assign`, { driver_id: d.id }, { preserveScroll: true })}
                                                        className="bg-surface hover:border-foreground/30 flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm">
                                                        <Avatar name={d.name} size={26} />
                                                        <span className="flex-1 font-medium">{d.name}</span>
                                                        {d.active > 0 && <Badge tone="warning">Busy · {d.active}</Badge>}
                                                        <span className="text-muted-foreground text-xs">{d.km} km · ★{d.rating}</span>
                                                    </button>
                                                ))}
                                                <Button size="sm" variant="outline" onClick={() => router.post(`/admin/dispatch/${o.id}/retry`, {}, { preserveScroll: true })}><RefreshCw /> Send to nearby drivers again</Button>
                                            </>
                                        )}
                                        <Button size="sm" variant="dark" asChild><Link href={`/admin/orders/${o.id}`}>Open order · {zig(o.total_zig)}</Link></Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </aside>

                {/* Map */}
                <div className="relative min-h-[420px] flex-1 p-3 lg:p-4">
                    <LiveMap apiKey={initial.mapsKey} markers={markers} polygons={initial.zones.map((z) => ({ id: z.id, points: z.polygon, label: z.name + (z.surge_multiplier > 1 ? ` · ${z.surge_multiplier}× surge` : ''), tone: z.surge_multiplier > 1 ? 'gold' : 'brand' }))} className="h-full min-h-[420px]">
                        <div className="bg-surface/95 absolute top-3 right-3 grid gap-1.5 rounded-lg border px-3 py-2.5 text-xs shadow-(--shadow-card) backdrop-blur">
                            {[['bg-brand', 'Free driver'], ['bg-gold', 'Driver on a job'], ['bg-muted-foreground', 'No GPS (3 min+)'], ['bg-foreground', 'Store with live orders']].map(([c, l]) => (
                                <span key={l} className="flex items-center gap-2"><span className={cn('size-2.5 rounded-full', c)} />{l}</span>
                            ))}
                        </div>
                    </LiveMap>
                    <div className="bg-surface absolute bottom-6 left-1/2 hidden -translate-x-1/2 gap-4 rounded-xl border px-4 py-2 text-xs shadow-(--shadow-card) lg:flex">
                        {snap.drivers.slice(0, 6).map((d) => (
                            <span key={d.id} className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full', d.stale ? 'bg-muted-foreground' : d.active ? 'bg-gold' : 'bg-brand')} />{d.name.split(' ')[0]}{d.cash_held > 0 && <span className="text-muted-foreground">· {zig(d.cash_held)} cash</span>}</span>
                        ))}
                        {snap.drivers.length === 0 && <span className="text-muted-foreground">No drivers online</span>}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
}

import { LiveMap, type MapMarker } from '@/components/z';
import { label } from '@/lib/money';
import { type OrderView } from '@/types/order-view';
import { Bike, Crosshair, House, LocateFixed, Phone, Store, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const POLL_MS = 4000;

function km(a: [number, number], b: [number, number]) {
    const r = 6371, d = Math.PI / 180;
    const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Slides the driver pin smoothly to each new position instead of jumping. */
function useGlide(target: [number, number] | null, ms = 3000): [number, number] | null {
    const [pos, setPos] = useState(target);
    const from = useRef(target);
    useEffect(() => {
        if (!target) return setPos(null);
        const start = from.current ?? target;
        if (start[0] === target[0] && start[1] === target[1]) return setPos(target);
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number) => {
            const k = Math.min(1, (t - t0) / ms);
            const e = k * (2 - k);
            const p: [number, number] = [start[0] + (target[0] - start[0]) * e, start[1] + (target[1] - start[1]) * e];
            from.current = p;
            setPos(p);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target?.[0], target?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
    return pos;
}

function ago(iso: string | null | undefined, now: number) {
    if (!iso) return null;
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

/**
 * Full-screen live map once the driver has the order: the store, the driver moving in real time,
 * the delivery address and (if allowed) where the customer is right now.
 */
export function LiveTrack({ v, mapsKey, onClose, onUpdate }: { v: OrderView; mapsKey: string | null; onClose: () => void; onUpdate: (v: OrderView) => void }) {
    const [me, setMe] = useState<[number, number] | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [fit, setFit] = useState(0);

    // Fast updates while the map is open.
    useEffect(() => {
        const refresh = () => fetch(`/orders/${v.id}/status`, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).then((d) => d?.view && onUpdate(d.view)).catch(() => {});
        refresh();
        const t = setInterval(refresh, POLL_MS);
        const c = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(t); clearInterval(c); };
    }, [v.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // The customer's own position (only after they opened the map, and only if they allow it).
    useEffect(() => {
        if (!('geolocation' in navigator)) return;
        const id = navigator.geolocation.watchPosition((p) => setMe([p.coords.latitude, p.coords.longitude]), () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // Esc closes; lock page scroll behind the map.
    useEffect(() => {
        const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', key);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
    }, [onClose]);

    const driverAt = v.driver?.lat && v.driver.lng ? ([v.driver.lat, v.driver.lng] as [number, number]) : null;
    const driver = useGlide(driverAt);
    const home = v.details.address_lat && v.details.address_lng ? ([v.details.address_lat, v.details.address_lng] as [number, number]) : null;
    const store = v.store.lat && v.store.lng ? ([v.store.lat, v.store.lng] as [number, number]) : null;

    const markers = useMemo<MapMarker[]>(() => [
        ...(store ? [{ id: 's', lat: store[0], lng: store[1], kind: 'store' as const, label: v.store.name, icon: <Store className="size-3" /> }] : []),
        ...(home ? [{ id: 'h', lat: home[0], lng: home[1], kind: 'home' as const, label: 'Delivery address', icon: <House className="size-4" /> }] : []),
        ...(me ? [{ id: 'me', lat: me[0], lng: me[1], kind: 'me' as const, label: 'You are here' }] : []),
        ...(driver ? [{ id: 'd', lat: driver[0], lng: driver[1], kind: 'courier' as const, label: v.driver?.name?.split(' ')[0], pinned: true, icon: <Bike className="size-5" /> }] : []),
    ], [store?.[0], home?.[0], me?.[0], me?.[1], driver?.[0], driver?.[1], v.store.name, v.driver?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    const lines = useMemo(() => (driver && home ? [{ id: 'route', points: [driver, home], dashed: true }] : []), [driver?.[0], driver?.[1], home?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fit when the first positions arrive (driver, then "me").
    useEffect(() => setFit((n) => n + 1), [!!driverAt, !!me, !!home]); // eslint-disable-line react-hooks/exhaustive-deps

    const away = driverAt && home ? km(driverAt, home) * 1.3 : null;
    const eta = v.time.at ? Math.max(0, Math.round((new Date(v.time.at).getTime() - now) / 60000)) : null;
    const delivered = v.status === 'delivered';
    const stopsBefore = v.driver?.stops_before ?? 0;

    return (
        <div className="fixed inset-0 z-[60] flex flex-col bg-neutral-100 dark:bg-black" role="dialog" aria-modal aria-label="Live tracking">
            <LiveMap apiKey={mapsKey} markers={markers} lines={lines} fitKey={fit} className="absolute inset-0 rounded-none border-0" />

            {/* Top bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 py-2 pr-4 pl-3 shadow-lg backdrop-blur dark:bg-[#1c1c1c]/95">
                    <span className="relative flex size-2.5"><span className="bg-brand absolute inset-0 animate-ping rounded-full" /><span className="bg-brand relative size-2.5 rounded-full" /></span>
                    <span className="text-sm font-bold">Live · #{v.reference}</span>
                </div>
                <button onClick={onClose} className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-white/95 shadow-lg backdrop-blur hover:bg-white dark:bg-[#1c1c1c]/95" aria-label="Close live map"><X className="size-5" /></button>
            </div>
            <button onClick={() => setFit((n) => n + 1)} className="absolute right-4 bottom-[272px] flex size-11 items-center justify-center rounded-full bg-white shadow-lg md:bottom-[248px] dark:bg-[#1c1c1c]" aria-label="Show everyone on the map"><Crosshair className="size-5" /></button>

            {/* Bottom sheet */}
            <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl p-3 md:p-5">
                <div className="rounded-[28px] bg-white p-5 shadow-[0_-10px_50px_-12px_rgba(0,0,0,0.35)] dark:bg-[#1c1c1c]">
                    {delivered ? (
                        <div className="py-2 text-center">
                            <div className="text-2xl font-extrabold">Delivered 🎉</div>
                            <p className="text-muted-foreground mt-1">Enjoy your order!</p>
                            <button onClick={onClose} className="bg-brand mt-4 h-12 w-full rounded-full font-bold text-black">Done</button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <div className="text-muted-foreground text-xs font-bold tracking-wide uppercase">{v.status === 'arriving' ? 'Almost there' : 'On the way'}</div>
                                    <div className="tabular text-3xl font-extrabold tracking-tight">{eta !== null ? (eta <= 1 ? 'Any moment' : `${eta} min`) : '—'}</div>
                                </div>
                                {away !== null && <div className="text-right"><div className="tabular text-xl font-bold">{away < 1 ? `${Math.round(away * 1000)} m` : `${away.toFixed(1)} km`}</div><div className="text-muted-foreground text-xs">away</div></div>}
                            </div>
                            {stopsBefore > 0 && <div className="bg-gold/15 mt-3 rounded-xl px-3 py-2 text-sm font-medium">Your driver has {stopsBefore} drop-off{stopsBefore > 1 ? 's' : ''} before you.</div>}
                            {v.driver && (
                                <div className="mt-4 flex items-center gap-3 border-t pt-4 dark:border-white/10">
                                    <span className="bg-brand flex size-12 items-center justify-center rounded-full text-lg font-bold text-black">{v.driver.name[0]}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-bold">{v.driver.name}</div>
                                        <div className="text-muted-foreground truncate text-sm">{label(v.driver.vehicle)}{v.driver.plate && ` · ${v.driver.plate}`}{v.driver.located_at && ` · updated ${ago(v.driver.located_at, now)}`}</div>
                                    </div>
                                    <a href={`tel:${v.driver.phone}`} className="bg-muted flex size-11 items-center justify-center rounded-full dark:bg-white/10" aria-label="Call driver"><Phone className="size-5" /></a>
                                </div>
                            )}
                            {!driverAt && <p className="text-muted-foreground mt-3 text-sm">Waiting for your driver’s location…</p>}
                            <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                <span className="flex items-center gap-1.5"><span className="bg-brand size-2.5 rounded-full" /> Driver</span>
                                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#1c1c1c] ring-1 ring-white/40" /> Delivery address</span>
                                <span className="flex items-center gap-1.5"><span className="bg-foreground size-2.5 rounded-sm" /> {v.store.name}</span>
                                {me ? <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#2f80ed]" /> You</span> : <span className="flex items-center gap-1.5"><LocateFixed className="size-3" /> Allow location to see yourself</span>}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

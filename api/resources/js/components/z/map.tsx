import { cn } from '@/lib/utils';
import { usePage } from '@inertiajs/react';
import { APIProvider, AdvancedMarker, Map as GMap, useMap } from '@vis.gl/react-google-maps';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

export interface MapMarker {
    id: string;
    lat: number;
    lng: number;
    kind: 'store' | 'driver' | 'dropoff' | 'driver-busy' | 'driver-stale' | 'me' | 'home' | 'courier';
    label?: string;
    /** Always show the label (not only on hover). */
    pinned?: boolean;
    icon?: ReactNode;
    alert?: boolean;
    onClick?: () => void;
}

export interface MapPolygon {
    id: string | number;
    points: [number, number][];
    tone?: 'brand' | 'gold' | 'muted';
    label?: string;
}

const HARARE = { lat: -17.8292, lng: 31.0522 };

const PIN: Record<MapMarker['kind'], string> = {
    store: 'bg-foreground text-background',
    driver: 'bg-brand text-white',
    'driver-busy': 'bg-gold text-white',
    'driver-stale': 'bg-muted-foreground text-white',
    dropoff: 'bg-white text-foreground border-2 border-foreground',
    me: 'bg-[#2f80ed] text-white',
    home: 'bg-[#1c1c1c] text-white',
    courier: 'bg-brand text-black',
};

const SIZE: Partial<Record<MapMarker['kind'], string>> = { store: 'size-6 text-[10px] font-bold', dropoff: 'size-3.5', me: 'size-4', home: 'size-9', courier: 'size-11' };

function Pin({ m }: { m: MapMarker }) {
    const glyph = m.icon ?? (m.kind === 'store' ? 'S' : '');
    return (
        <button onClick={m.onClick} className="group relative -translate-y-1/2" title={m.label}>
            {m.alert && <span className="bg-zred/40 absolute inset-0 -m-1.5 animate-ping rounded-full" />}
            {m.kind === 'me' && <span className="absolute inset-0 -m-2 animate-ping rounded-full bg-[#2f80ed]/30 [animation-duration:2s]" />}
            {m.kind === 'courier' && <span className="bg-brand/40 absolute inset-0 -m-1 animate-ping rounded-full [animation-duration:1.8s]" />}
            <span className={cn('relative flex items-center justify-center rounded-full shadow-md ring-2 ring-white transition group-hover:scale-110 dark:ring-black', PIN[m.kind], SIZE[m.kind] ?? 'size-4')}>
                {glyph}
            </span>
            {m.label && <span className={cn('bg-popover pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow group-hover:block', m.pinned ? 'block' : 'hidden')}>{m.label}</span>}
        </button>
    );
}

/**
 * Live map. Uses Google Maps when a browser key is configured (Settings → Integrations);
 * otherwise draws a schematic map so dispatch and zones still work in development.
 */
export interface MapLine {
    id: string;
    points: [number, number][];
    dashed?: boolean;
}

export function LiveMap({ apiKey, markers, polygons = [], lines = [], fitKey, className, onMapClick, draft, children }: { apiKey?: string | null; markers: MapMarker[]; polygons?: MapPolygon[]; lines?: MapLine[]; /** Change it to re-fit the map around every marker. */ fitKey?: string | number; className?: string; onMapClick?: (lat: number, lng: number) => void; draft?: [number, number][]; children?: ReactNode }) {
    // Map ID from Settings → Integrations (Google Cloud → Map management); needed for the custom pins.
    const mapId = usePage<{ mapsMapId?: string | null }>().props.mapsMapId || 'DEMO_MAP_ID';
    return (
        <div className={cn('bg-muted relative overflow-hidden rounded-xl border', className)}>
            {apiKey ? (
                <APIProvider apiKey={apiKey}>
                    <GMap mapId={mapId} defaultCenter={HARARE} defaultZoom={12} gestureHandling="greedy" disableDefaultUI clickableIcons={false} onClick={(e) => e.detail.latLng && onMapClick?.(e.detail.latLng.lat, e.detail.latLng.lng)} className="h-full w-full">
                        {markers.map((m) => (
                            <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={m.onClick}>
                                <Pin m={m} />
                            </AdvancedMarker>
                        ))}
                        <Polygons polygons={[...polygons, ...(draft?.length ? [{ id: 'draft', points: draft, tone: 'gold' as const }] : [])]} />
                        <Lines lines={lines} />
                        {fitKey !== undefined && <FitBounds markers={markers} fitKey={fitKey} />}
                    </GMap>
                </APIProvider>
            ) : (
                <SchematicMap markers={markers} polygons={polygons} lines={lines} draft={draft} onMapClick={onMapClick} />
            )}
            {children}
        </div>
    );
}

function Polygons({ polygons }: { polygons: MapPolygon[] }) {
    const map = useMap();
    const refs = useRef<google.maps.Polygon[]>([]);
    useEffect(() => {
        if (!map) return;
        refs.current.forEach((p) => p.setMap(null));
        refs.current = polygons.map((p) => {
            const color = p.tone === 'gold' ? 'var(--color-gold)' : p.tone === 'muted' ? '#7a8a82' : 'var(--color-brand)';
            return new google.maps.Polygon({ map, paths: p.points.map(([lat, lng]) => ({ lat, lng })), strokeColor: color, strokeWeight: 2, fillColor: color, fillOpacity: 0.08, clickable: false });
        });
        return () => refs.current.forEach((p) => p.setMap(null));
    }, [map, polygons]);
    return null;
}

function Lines({ lines }: { lines: MapLine[] }) {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        const made = lines.map((l) => new google.maps.Polyline({
            map, path: l.points.map(([lat, lng]) => ({ lat, lng })), clickable: false, strokeColor: '#1c1c1c',
            strokeOpacity: l.dashed ? 0 : 0.85, strokeWeight: 4,
            icons: l.dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, strokeColor: '#1c1c1c', scale: 3 }, offset: '0', repeat: '14px' }] : undefined,
        }));
        return () => made.forEach((p) => p.setMap(null));
    }, [map, lines]);
    return null;
}

/** Zoom so every marker is in view (again whenever fitKey changes). */
function FitBounds({ markers, fitKey }: { markers: MapMarker[]; fitKey: string | number }) {
    const map = useMap();
    useEffect(() => {
        if (!map || !markers.length) return;
        if (markers.length === 1) { map.setCenter({ lat: markers[0].lat, lng: markers[0].lng }); map.setZoom(15); return; }
        const b = new google.maps.LatLngBounds();
        markers.forEach((m) => b.extend({ lat: m.lat, lng: m.lng }));
        map.fitBounds(b, { top: 80, bottom: 260, left: 40, right: 40 });
    }, [map, fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

function SchematicMap({ markers, polygons, lines = [], draft, onMapClick }: { markers: MapMarker[]; polygons: MapPolygon[]; lines?: MapLine[]; draft?: [number, number][]; onMapClick?: (lat: number, lng: number) => void }) {
    const pts = useMemo(() => [...markers.map((m) => [m.lat, m.lng]), ...polygons.flatMap((p) => p.points), ...(draft ?? [])] as [number, number][], [markers, polygons, draft]);
    const bounds = useMemo(() => {
        if (!pts.length) return { minLat: HARARE.lat - 0.06, maxLat: HARARE.lat + 0.06, minLng: HARARE.lng - 0.08, maxLng: HARARE.lng + 0.08 };
        const lats = pts.map((p) => p[0]);
        const lngs = pts.map((p) => p[1]);
        const pad = 0.012;
        return { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLng: Math.min(...lngs) - pad, maxLng: Math.max(...lngs) + pad };
    }, [pts]);
    const x = (lng: number) => ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng || 1)) * 100;
    const y = (lat: number) => ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat || 1)) * 100;

    return (
        <div
            className="absolute inset-0 cursor-crosshair bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px]"
            onClick={(e) => {
                if (!onMapClick) return;
                const r = e.currentTarget.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width;
                const py = (e.clientY - r.top) / r.height;
                onMapClick(bounds.maxLat - py * (bounds.maxLat - bounds.minLat), bounds.minLng + px * (bounds.maxLng - bounds.minLng));
            }}
        >
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {polygons.map((p) => (
                    <polygon key={p.id} points={p.points.map(([la, ln]) => `${x(ln)},${y(la)}`).join(' ')} fill={p.tone === 'gold' ? 'var(--color-gold)' : 'var(--color-brand)'} fillOpacity={0.07} stroke={p.tone === 'gold' ? 'var(--color-gold)' : 'var(--color-brand)'} strokeWidth={0.35} vectorEffect="non-scaling-stroke" />
                ))}
                {lines.map((l) => <polyline key={l.id} points={l.points.map(([la, ln]) => `${x(ln)},${y(la)}`).join(' ')} fill="none" stroke="currentColor" strokeOpacity={0.75} strokeWidth={3} strokeDasharray={l.dashed ? '2 6' : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
                {draft && draft.length > 0 && <polygon points={draft.map(([la, ln]) => `${x(ln)},${y(la)}`).join(' ')} fill="var(--color-gold)" fillOpacity={0.12} stroke="var(--color-gold)" strokeWidth={2} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
            </svg>
            {polygons.filter((p) => p.label).map((p) => {
                const cy = p.points.reduce((s, q) => s + q[0], 0) / p.points.length;
                const cx = p.points.reduce((s, q) => s + q[1], 0) / p.points.length;
                return <span key={`l${p.id}`} className="text-brand-600/70 pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-[11px] font-semibold tracking-wide uppercase" style={{ left: `${x(cx)}%`, top: `${y(cy)}%` }}>{p.label}</span>;
            })}
            {draft?.map(([la, ln], i) => <span key={`d${i}`} className="bg-gold absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${x(ln)}%`, top: `${y(la)}%` }} />)}
            {markers.map((m) => (
                <div key={m.id} className="absolute -translate-x-1/2" style={{ left: `${x(m.lng)}%`, top: `${y(m.lat)}%` }} onClick={(e) => e.stopPropagation()}>
                    <Pin m={m} />
                </div>
            ))}
            <div className="bg-surface/90 text-muted-foreground absolute bottom-3 left-3 rounded-md border px-2 py-1 text-[11px] backdrop-blur">Schematic view · add a Google Maps key in Settings → Integrations for street maps</div>
        </div>
    );
}

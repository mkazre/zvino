import { cn } from '@/lib/utils';
import { APIProvider, AdvancedMarker, Map as GMap, useMap } from '@vis.gl/react-google-maps';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

export interface MapMarker {
    id: string;
    lat: number;
    lng: number;
    kind: 'store' | 'driver' | 'dropoff' | 'driver-busy' | 'driver-stale';
    label?: string;
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
};

function Pin({ m }: { m: MapMarker }) {
    const glyph = m.kind === 'store' ? 'S' : m.kind === 'dropoff' ? '' : '';
    return (
        <button onClick={m.onClick} className="group relative -translate-y-1/2" title={m.label}>
            {m.alert && <span className="bg-zred/40 absolute inset-0 -m-1.5 animate-ping rounded-full" />}
            <span className={cn('relative flex items-center justify-center rounded-full shadow-md ring-2 ring-white transition group-hover:scale-110 dark:ring-black', PIN[m.kind], m.kind === 'store' ? 'size-6 text-[10px] font-bold' : m.kind === 'dropoff' ? 'size-3.5' : 'size-4')}>
                {glyph}
            </span>
            {m.label && <span className="bg-popover pointer-events-none absolute top-full left-1/2 mt-1 hidden -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap shadow group-hover:block">{m.label}</span>}
        </button>
    );
}

/**
 * Live map. Uses Google Maps when a browser key is configured (Settings → Integrations);
 * otherwise draws a schematic map so dispatch and zones still work in development.
 */
export function LiveMap({ apiKey, markers, polygons = [], className, onMapClick, draft, children }: { apiKey?: string | null; markers: MapMarker[]; polygons?: MapPolygon[]; className?: string; onMapClick?: (lat: number, lng: number) => void; draft?: [number, number][]; children?: ReactNode }) {
    return (
        <div className={cn('bg-muted relative overflow-hidden rounded-xl border', className)}>
            {apiKey ? (
                <APIProvider apiKey={apiKey}>
                    <GMap mapId="zvino-ops" defaultCenter={HARARE} defaultZoom={12} gestureHandling="greedy" disableDefaultUI clickableIcons={false} onClick={(e) => e.detail.latLng && onMapClick?.(e.detail.latLng.lat, e.detail.latLng.lng)} className="h-full w-full">
                        {markers.map((m) => (
                            <AdvancedMarker key={m.id} position={{ lat: m.lat, lng: m.lng }} onClick={m.onClick}>
                                <Pin m={m} />
                            </AdvancedMarker>
                        ))}
                        <Polygons polygons={[...polygons, ...(draft?.length ? [{ id: 'draft', points: draft, tone: 'gold' as const }] : [])]} />
                    </GMap>
                </APIProvider>
            ) : (
                <SchematicMap markers={markers} polygons={polygons} draft={draft} onMapClick={onMapClick} />
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

function SchematicMap({ markers, polygons, draft, onMapClick }: { markers: MapMarker[]; polygons: MapPolygon[]; draft?: [number, number][]; onMapClick?: (lat: number, lng: number) => void }) {
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

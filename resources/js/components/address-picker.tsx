import { Button } from '@/components/ui/button';
import { Modal, Popover } from '@/components/z';
import { cn } from '@/lib/utils';
import { router, useForm, usePage } from '@inertiajs/react';
import { Check, ChevronDown, Crosshair, Home, Loader2, MapPin, Plus } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

export interface ActiveLocation { lat: number | null; lng: number | null; address_id: number | null; label: string | null; line: string | null; city: string | null; suburb?: string | null }
export interface SavedAddress { id: number; label: string; line1: string; suburb: string | null; city: string; lat: number | null; lng: number | null }
type SiteBits = { auth?: { user?: { role: string } | null }; site: { cities: string[]; city: string | null; location: ActiveLocation | null; addresses: SavedAddress[] } };

const xsrf = () => decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');
const ASKED = 'zvino.geo.asked';

/** Browser GPS → server picks the saved address you're at (or keeps "Current location"). */
async function detect(): Promise<{ location: ActiveLocation; matched: boolean; needs_address: boolean } | null> {
    if (!('geolocation' in navigator)) return null;
    const pos = await new Promise<GeolocationPosition | null>((resolve) => navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }));
    if (!pos) return null;
    const r = await fetch('/location/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf(), 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    }).catch(() => null);
    return r && r.ok ? r.json() : null;
}

const Ctx = createContext<{ openAdd: (prefill?: Partial<ActiveLocation>) => void; locate: () => Promise<void>; busy: boolean }>({ openAdd: () => {}, locate: async () => {}, busy: false });

/**
 * Wraps the website: on the first visit asks the browser for the location, switches to the saved
 * address the visitor is at, or offers to save the new address. Pages re-load for that location.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
    const { auth, site } = usePage<SiteBits>().props;
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState<Partial<ActiveLocation> | null>(null);
    const signedIn = !!auth?.user && ['customer', 'driver'].includes(auth.user.role);

    const locate = useCallback(async () => {
        setBusy(true);
        const r = await detect();
        setBusy(false);
        if (!r) return;
        router.reload({ preserveScroll: true } as never);
        if (r.needs_address) setAdding(r.location);
    }, []);

    useEffect(() => {
        if (site.location) return;
        try {
            if (sessionStorage.getItem(ASKED)) return;
            sessionStorage.setItem(ASKED, '1');
        } catch {
            return;
        }
        locate();
    }, [site.location, locate]);

    return (
        <Ctx.Provider value={{ openAdd: (prefill) => (signedIn ? setAdding(prefill ?? {}) : router.visit('/signin')), locate, busy }}>
            {children}
            {adding && <AddAddressModal prefill={adding} cities={site.cities} onClose={() => setAdding(null)} />}
        </Ctx.Provider>
    );
}

export const useLocationPicker = () => useContext(Ctx);

/** Header control: the active address, with saved addresses / current location / add new. */
export function AddressPicker({ tone = 'light', className }: { tone?: 'light' | 'glass'; className?: string }) {
    const { site } = usePage<SiteBits>().props;
    const { openAdd, locate, busy } = useLocationPicker();
    const loc = site.location;
    const title = loc ? (loc.address_id ? loc.label : loc.line || 'Current location') : site.city ?? 'Set delivery address';
    const sub = loc ? (loc.address_id ? loc.line : loc.city) : null;

    return (
        <Popover
            align="start"
            className="w-80 p-1.5"
            trigger={
                <button className={cn('flex max-w-[260px] min-w-0 items-center gap-2 rounded-full px-3 py-2 text-left text-sm transition', tone === 'glass' ? 'text-white hover:bg-white/15' : 'hover:bg-muted', className)}>
                    {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <MapPin className="size-4 shrink-0" />}
                    <span className="min-w-0"><span className="block truncate font-bold">{title}</span>{sub && <span className="block truncate text-xs opacity-70">{sub}</span>}</span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                </button>
            }
        >
            <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-neutral-500 uppercase">Deliver to</div>
            {site.addresses.map((a) => (
                <button key={a.id} onClick={() => router.post('/location/address', { address_id: a.id }, { preserveScroll: true })} className="hover:bg-muted flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm">
                    <Home className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{a.label}</span><span className="text-muted-foreground block truncate text-xs">{[a.line1, a.suburb, a.city].filter(Boolean).join(', ')}</span></span>
                    {loc?.address_id === a.id && <Check className="text-brand size-4 shrink-0" />}
                </button>
            ))}
            <button onClick={() => locate()} className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold"><Crosshair className="size-4" /> Use my current location {loc && !loc.address_id && <Check className="text-brand ml-auto size-4" />}</button>
            <button onClick={() => openAdd(loc && !loc.address_id ? loc : {})} className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold"><Plus className="size-4" /> Add a new address</button>
            {!loc && site.cities.length > 0 && (
                <div className="border-t px-3 pt-2 pb-1">
                    <div className="mb-1 text-xs text-neutral-500">Or browse a city</div>
                    <div className="flex flex-wrap gap-1.5">{site.cities.map((c) => <button key={c} onClick={() => router.post('/city', { city: c }, { preserveScroll: true })} className={cn('rounded-full border px-3 py-1 text-xs', site.city === c && 'border-[#222222] font-semibold')}>{c}</button>)}</div>
                </div>
            )}
            {loc && <button onClick={() => router.post('/location/clear', {}, { preserveScroll: true })} className="text-muted-foreground w-full px-3 py-2 text-left text-xs hover:underline">Clear location (browse by city)</button>}
        </Popover>
    );
}

function AddAddressModal({ prefill, cities, onClose }: { prefill: Partial<ActiveLocation>; cities: string[]; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        label: 'Home', line1: prefill.line ?? '', landmark: '', suburb: prefill.suburb ?? '', city: prefill.city && cities.includes(prefill.city) ? prefill.city : cities[0] ?? 'Harare',
        instructions: '', lat: prefill.lat ?? (null as number | null), lng: prefill.lng ?? (null as number | null), use_now: true,
    });
    const [pinning, setPinning] = useState(false);
    const pin = () => {
        setPinning(true);
        navigator.geolocation?.getCurrentPosition((p) => { setData((d) => ({ ...d, lat: p.coords.latitude, lng: p.coords.longitude })); setPinning(false); }, () => setPinning(false), { enableHighAccuracy: true, timeout: 12000 });
    };
    const input = 'h-11 w-full rounded-xl border px-3.5 text-sm outline-none focus:border-[#222222] dark:bg-white/5';
    return (
        <Modal open onClose={onClose} title={prefill.lat ? 'Save this address?' : 'Add a delivery address'} description={prefill.lat ? 'You’re not at any of your saved addresses. Save where you are now so drivers find you easily.' : 'Pin your gate so the driver finds you.'}
            footer={<><Button variant="outline" onClick={onClose}>Not now</Button><Button disabled={processing || !data.line1} onClick={() => post('/account/addresses', { preserveScroll: true, onSuccess: onClose })}>Save & deliver here</Button></>}>
            <div className="grid gap-3">
                <div className="flex gap-2">{['Home', 'Work', 'Other'].map((l) => <button key={l} type="button" onClick={() => setData('label', l)} className={cn('h-9 rounded-full border px-4 text-sm font-semibold', data.label === l && 'border-[#222222] bg-[#222222] text-white dark:border-white dark:bg-white dark:text-black')}>{l}</button>)}</div>
                <button type="button" onClick={pin} className={cn('flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold', data.lat ? 'bg-brand/15 text-brand-700 dark:text-brand' : 'bg-brand text-black')}>
                    {pinning ? <Loader2 className="size-4 animate-spin" /> : <Crosshair className="size-4" />}{data.lat ? 'Exact location pinned ✓' : 'Pin my current location'}
                </button>
                <input className={input} placeholder="Street address, e.g. 21 Moepel Avenue" value={data.line1} onChange={(e) => setData('line1', e.target.value)} />
                {errors.line1 && <p className="text-zred text-xs">{errors.line1}</p>}
                <input className={input} placeholder="Complex / landmark (blue gate, opposite OK Mart)" value={data.landmark} onChange={(e) => setData('landmark', e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="Suburb" value={data.suburb} onChange={(e) => setData('suburb', e.target.value)} />
                    <select className={input} value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</select>
                </div>
                <input className={input} placeholder="Instructions for the driver (optional)" value={data.instructions} onChange={(e) => setData('instructions', e.target.value)} />
            </div>
        </Modal>
    );
}

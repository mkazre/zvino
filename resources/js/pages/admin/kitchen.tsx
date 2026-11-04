import { Button } from '@/components/ui/button';
import { Segmented, Switch } from '@/components/z';
import { useLiveOrders } from '@/hooks/use-live-orders';
import AdminLayout from '@/layouts/admin-layout';
import { label } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Bell, BellOff, Bike, CalendarClock, Flame, Maximize, Store, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Ticket {
    id: number; reference: string; stage: 'new' | 'cooking' | 'ready'; status: string; source: string; fulfilment: string; customer: string | null; driver: string | null;
    notes: string | null; placed_at: string; accepted_at: string | null; prep_minutes: number; scheduled_for: string | null;
    items: { name: string; quantity: number; options: { variant?: string; modifiers?: string[] } | null; notes: string | null; station: string | null }[];
}
interface Props {
    vendor: { id: number; name: string; is_busy: boolean; busy_extra_minutes: number; power_out: boolean; prep_minutes: number; effective_prep: number } | null;
    vendors: { id: number; name: string }[];
    tickets: Ticket[];
    stations: string[];
    learnedPrep: number | null;
}

const COLUMNS = [
    { stage: 'new', title: 'New', action: 'Start', tone: 'border-t-blue-500', bar: 'bg-blue-500' },
    { stage: 'cooking', title: 'Cooking', action: 'Ready', tone: 'border-t-amber-500', bar: 'bg-amber-500' },
    { stage: 'ready', title: 'Ready', action: 'Handed over', tone: 'border-t-emerald-500', bar: 'bg-emerald-500' },
] as const;

/** Two-tone chime via Web Audio (no sound file needed). */
function chime() {
    try {
        const ctx = new AudioContext();
        [880, 1320].forEach((f, i) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
            g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + i * 0.18 + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.4);
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime + i * 0.18);
            o.stop(ctx.currentTime + i * 0.18 + 0.45);
        });
    } catch {
        /* audio blocked until first tap */
    }
}

export default function Kitchen({ vendor, vendors, tickets, stations, learnedPrep }: Props) {
    const { auth } = usePage<SharedData>().props;
    useLiveOrders(vendor?.id, ['tickets', 'vendor'], 8000);
    const [station, setStation] = useState<string>('all');
    const [sound, setSound] = useState(true);
    const [acked, setAcked] = useState<Set<number>>(new Set());
    const [, tick] = useState(0);
    const seen = useRef<Set<number>>(new Set(tickets.map((t) => t.id)));

    useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 15000);
        return () => clearInterval(t);
    }, []);

    // Repeat the chime every 20 s while unacknowledged new tickets exist.
    const unacked = tickets.filter((t) => t.stage === 'new' && !acked.has(t.id));
    useEffect(() => {
        const fresh = tickets.filter((t) => !seen.current.has(t.id));
        fresh.forEach((t) => seen.current.add(t.id));
        if (sound && fresh.some((t) => t.stage === 'new')) chime();
    }, [tickets, sound]);
    useEffect(() => {
        if (!sound || unacked.length === 0) return;
        const t = setInterval(chime, 20000);
        return () => clearInterval(t);
    }, [sound, unacked.length]);

    const visibleItems = (t: Ticket) => (station === 'all' ? t.items : t.items.filter((i) => i.station === station || !i.station));
    const shown = tickets.filter((t) => visibleItems(t).length > 0);
    const target = learnedPrep ?? vendor?.effective_prep ?? 20;
    const advance = (t: Ticket) => {
        setAcked((s) => new Set(s).add(t.id));
        router.patch(`/admin/api/orders/${t.id}/stage`, {}, { preserveScroll: true, only: ['tickets'] });
    };

    return (
        <AdminLayout title="Kitchen" fullBleed>
            <div className="flex flex-1 flex-col gap-4 bg-[#0c0e0d] p-4 text-white md:p-5 lg:min-h-[calc(100vh-4rem)]" onClick={() => unacked.length && setAcked(new Set(tickets.map((t) => t.id)))}>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="mr-auto">
                        <h1 className="text-2xl font-bold tracking-tight">{vendor?.name ?? 'Kitchen'}</h1>
                        <p className="text-sm text-white/55">{shown.length} open tickets · target prep {target} min{learnedPrep && ' (learned from your last 14 days)'}</p>
                    </div>
                    {vendors.length > 1 && !auth.user.vendor_id && (
                        <select className="h-10 rounded-lg border border-white/15 bg-white/5 px-3 text-sm" value={vendor?.id} onChange={(e) => router.get('/admin/kitchen', { vendor_id: e.target.value })}>{vendors.map((v) => <option key={v.id} value={v.id} className="text-black">{v.name}</option>)}</select>
                    )}
                    {stations.length > 0 && <Segmented className="bg-white/10 [&_button]:text-white/60 [&_button[aria-selected=true]]:bg-white [&_button[aria-selected=true]]:text-black" value={station} onChange={setStation} options={[{ value: 'all', label: 'All stations' }, ...stations.map((s) => ({ value: s, label: label(s) }))]} />}
                    {vendor && (
                        <label className={cn('flex h-10 items-center gap-2.5 rounded-lg border px-3 text-sm font-semibold', vendor.is_busy ? 'border-amber-400/50 bg-amber-400/15 text-amber-300' : 'border-white/15 bg-white/5')}>
                            <Flame className="size-4" /> Rush mode {vendor.is_busy && `+${vendor.busy_extra_minutes}m`}
                            <Switch size="sm" checked={vendor.is_busy} onChange={(v) => router.post(`/admin/kitchen/${vendor.id}/rush`, { is_busy: v }, { preserveScroll: true })} />
                        </label>
                    )}
                    <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => setSound(!sound)} aria-label="Toggle sound">{sound ? <Bell /> : <BellOff />}</Button>
                    <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Full screen"><Maximize /></Button>
                </div>

                {vendor?.power_out && <div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-4 py-2.5 text-sm font-medium text-red-300"><Zap className="size-4" /> Load-shedding mode is on. Power-dependent items are hidden from customers.</div>}
                {unacked.length > 0 && <div className="animate-pulse rounded-lg bg-blue-500 px-4 py-3 text-center text-base font-bold">🔔 {unacked.length} new order{unacked.length > 1 ? 's' : ''}! Tap anywhere to acknowledge</div>}
                {shown.length > 20 && !vendor?.is_busy && <div className="rounded-lg bg-amber-500/15 px-4 py-2.5 text-sm text-amber-300">Lots of tickets. Consider switching on rush mode so customers get accurate times.</div>}

                <div className="grid flex-1 gap-4 lg:grid-cols-3">
                    {COLUMNS.map((col) => {
                        const list = shown.filter((t) => t.stage === col.stage);
                        return (
                            <section key={col.stage} className={cn('flex min-h-0 flex-col rounded-2xl border border-t-4 border-white/10 bg-white/[0.03]', col.tone)}>
                                <header className="flex items-center justify-between px-4 py-3">
                                    <h2 className="text-lg font-bold">{col.title}</h2>
                                    <span className="tabular rounded-full bg-white/10 px-3 py-0.5 text-base font-bold">{list.length}</span>
                                </header>
                                <div className="scroll-quiet flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
                                    {list.map((t) => {
                                        const started = new Date(t.accepted_at ?? t.placed_at).getTime();
                                        const mins = Math.floor((Date.now() - started) / 60000);
                                        const pct = Math.min(100, (mins / (t.prep_minutes || target)) * 100);
                                        const late = mins > (t.prep_minutes || target);
                                        return (
                                            <article key={t.id} className={cn('overflow-hidden rounded-xl bg-[#181b1a] ring-1 ring-white/10', col.stage === 'new' && !acked.has(t.id) && 'ring-2 ring-blue-400')}>
                                                <div className="h-1 bg-white/10"><div className={cn('h-full transition-all', late ? 'bg-red-500' : col.bar)} style={{ width: `${col.stage === 'ready' ? 100 : pct}%` }} /></div>
                                                <div className="flex items-center justify-between px-4 pt-3">
                                                    <span className="font-mono text-xl font-bold">{t.reference.replace('ZV-', '#')}</span>
                                                    <span className={cn('tabular rounded-md px-2 py-0.5 text-base font-bold', late ? 'bg-red-500 text-white' : mins >= (t.prep_minutes || target) * 0.7 ? 'bg-amber-500 text-black' : 'bg-white/10')}>{mins}m</span>
                                                </div>
                                                <div className="flex items-center gap-2 px-4 pt-1 text-xs font-semibold tracking-wide text-white/55 uppercase">
                                                    {t.fulfilment === 'delivery' ? <Bike className="size-3.5" /> : <Store className="size-3.5" />}
                                                    {t.source === 'pos' ? 'Counter' : label(t.fulfilment)} · {t.customer ?? 'Walk-in'}
                                                    {t.scheduled_for && <span className="flex items-center gap-1 text-blue-300"><CalendarClock className="size-3" />{new Date(t.scheduled_for).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</span>}
                                                </div>
                                                <ul className="space-y-2 px-4 py-3">
                                                    {visibleItems(t).map((i, idx) => (
                                                        <li key={idx} className="text-[17px] leading-snug">
                                                            <span className="font-extrabold text-white">{i.quantity}×</span> <span className="font-semibold">{i.name}</span>
                                                            {(i.options?.variant || i.options?.modifiers?.length) && <div className="pl-7 text-sm text-white/60">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(' · ')}</div>}
                                                            {i.notes && <div className="pl-7 text-sm font-semibold text-amber-300">⚠ {i.notes}</div>}
                                                        </li>
                                                    ))}
                                                    {station !== 'all' && visibleItems(t).length < t.items.length && <li className="text-xs text-white/40">+ {t.items.length - visibleItems(t).length} item(s) at other stations</li>}
                                                </ul>
                                                {t.notes && <div className="mx-3 mb-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">📝 {t.notes}</div>}
                                                <div className="p-2 pt-0">
                                                    {col.stage === 'ready' && t.fulfilment === 'delivery' ? (
                                                        <div className="rounded-lg bg-white/5 px-3 py-3 text-center text-sm text-white/70">{t.driver ? `🛵 ${t.driver} is coming` : 'Waiting for a driver…'}</div>
                                                    ) : (
                                                        <button onClick={(e) => { e.stopPropagation(); advance(t); }} className={cn('h-14 w-full rounded-lg text-lg font-bold transition active:scale-[0.98]', col.stage === 'new' ? 'bg-blue-500 hover:bg-blue-400' : col.stage === 'cooking' ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-emerald-600 hover:bg-emerald-500')}>
                                                            {col.stage === 'new' && t.status === 'placed' ? 'Accept & start' : col.action}
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                    {list.length === 0 && <p className="py-10 text-center text-sm text-white/35">Nothing here</p>}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </AdminLayout>
    );
}

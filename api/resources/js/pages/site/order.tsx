import { Button } from '@/components/ui/button';
import { LiveMap, Modal, Textarea } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { useT } from '@/lib/i18n';
import { label, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type OrderView } from '@/types/order-view';
import { EnableAlertsCard } from '@/components/order-alerts';
import { LiveTrack } from '@/components/live-track';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, Bike, Check, CircleHelp, Download, HelpCircle, Mail, MessageCircle, Phone, RotateCcw, Star, Store, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Tab = 'tracking' | 'receipt' | 'details';
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) : '–');

/** Order page: Tracking (current-stage banner + stage list), Receipt (with PDF) and Details tabs. */
export default function OrderPage({ view: initial, mapsKey }: { view: OrderView; mapsKey: string | null }) {
    const [v, setV] = useState(initial);
    const [tab, setTab] = useState<Tab>(() => {
        const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
        return q === 'receipt' || q === 'details' ? q : 'tracking';
    });
    const [help, setHelp] = useState(false);
    const [live, setLive] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('live') === '1');
    const t = useT();
    useEffect(() => setV(initial), [initial]);

    // Live updates while the order is moving (Pusher pushes too when configured).
    useEffect(() => {
        if (v.is_done) return;
        const refresh = () => fetch(`/orders/${v.id}/status`, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : null)).then((d) => d?.view && setV(d.view)).catch(() => {});
        const timer = setInterval(refresh, 10000);
        // An order alert just arrived (OrderAlerts): refresh straight away.
        const onAlert = (e: Event) => (e as CustomEvent<{ data?: { order_id?: number } }>).detail?.data?.order_id === v.id && refresh();
        window.addEventListener('zvino:order-update', onAlert);
        return () => { clearInterval(timer); window.removeEventListener('zvino:order-update', onAlert); };
    }, [v.is_done, v.id]);

    const closeLive = useCallback(() => {
        setLive(false);
        const url = new URL(window.location.href);
        url.searchParams.delete('live');
        window.history.replaceState(window.history.state, '', url);
    }, []);

    const go = (next: Tab) => {
        setTab(next);
        const url = new URL(window.location.href);
        if (next === 'tracking') url.searchParams.delete('tab');
        else url.searchParams.set('tab', next);
        window.history.replaceState(window.history.state, '', url);
    };

    return (
        <SiteLayout>
            <Head title={`Order #${v.reference}`} />
            <div className="bg-[#1c1c1c] text-white">
                <div className="mx-auto max-w-3xl px-4 pt-5 md:px-6">
                    <div className="flex items-center gap-3">
                        <Link href="/account?tab=orders" className="-ml-2 rounded-full p-2 hover:bg-white/10" aria-label="Back to orders"><ArrowLeft className="size-5" /></Link>
                        <h1 className="truncate text-xl font-extrabold tracking-tight md:text-2xl">Order #{v.reference}</h1>
                    </div>
                    <nav className="mt-4 flex justify-center gap-1 pb-4 sm:justify-start" role="tablist">
                        {(['tracking', 'receipt', 'details'] as Tab[]).map((k) => (
                            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className={cn('h-10 rounded-full px-5 text-[15px] font-semibold capitalize transition', tab === k ? 'bg-brand text-black' : 'text-white/75 hover:bg-white/10 hover:text-white')}>{t(k.charAt(0).toUpperCase() + k.slice(1))}</button>
                        ))}
                    </nav>
                </div>
            </div>

            <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6 md:px-6 md:py-8">
                <TimeCard v={v} onHelp={() => setHelp(true)} />
                {tab === 'tracking' && <Tracking v={v} mapsKey={mapsKey} onLive={() => setLive(true)} />}
                {tab === 'receipt' && <Receipt v={v} />}
                {tab === 'details' && <Details v={v} />}
            </div>
            <HelpModal open={help} onClose={() => setHelp(false)} v={v} />
            {live && (v.live || v.status === 'delivered') && <LiveTrack v={v} mapsKey={mapsKey} onUpdate={setV} onClose={closeLive} />}
        </SiteLayout>
    );
}

function TimeCard({ v, onHelp }: { v: OrderView; onHelp: () => void }) {
    const eta = v.time.at && !v.is_done && v.status !== 'scheduled' ? Math.max(0, Math.round((new Date(v.time.at).getTime() - Date.now()) / 60000)) : null;
    return (
        <div className="flex items-center justify-between gap-4 rounded-3xl border px-5 py-4 md:px-6">
            <div>
                <div className="text-muted-foreground text-sm font-medium">{v.time.label}</div>
                <div className="tabular text-[34px] leading-tight font-extrabold tracking-tight">{v.status === 'scheduled' && v.time.at ? new Date(v.time.at).toLocaleString('en-ZW', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : hhmm(v.time.at)}</div>
                {eta !== null && <div className="text-muted-foreground text-sm">about {eta} min</div>}
                {!v.is_done && v.time.trend && (
                    <div className={cn('mt-1.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold', v.time.trend.type === 'early' ? 'bg-brand/15 text-brand-700 dark:text-brand' : 'bg-gold/20 text-[#7a6a00] dark:text-gold')}>
                        {v.time.trend.type === 'early' ? '⚡ ' : ''}{v.time.trend.text}
                    </div>
                )}
            </div>
            <button onClick={onHelp} className="hover:bg-muted flex flex-col items-center gap-1 rounded-2xl px-3 py-2 text-sm font-semibold"><CircleHelp className="size-7" />Help</button>
        </div>
    );
}

/** The illustrated card for the current stage (text on the left, art on the right). */
function StageBanner({ image, title, subtitle, children }: { image: string; title: string; subtitle?: string | null; children?: React.ReactNode }) {
    return (
        <div className="relative overflow-hidden rounded-3xl text-[#1c1c1c]">
            <img src={image} alt="" className="block aspect-[1200/593] w-full object-cover" />
            <div className="absolute inset-y-0 left-0 flex w-[48%] flex-col justify-start p-4 sm:p-6 md:p-8">
                <h2 className="text-[22px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[30px] md:text-[38px]">{title}</h2>
                {subtitle && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug sm:mt-2 sm:text-base md:text-lg">{subtitle}</p>}
                {children}
            </div>
        </div>
    );
}

function Tracking({ v, mapsKey, onLive }: { v: OrderView; mapsKey: string | null; onLive: () => void }) {
    const markers = [
        ...(v.store.lat ? [{ id: 's', lat: v.store.lat, lng: v.store.lng!, kind: 'store' as const, label: v.store.name }] : []),
        ...(v.details.address_lat ? [{ id: 'h', lat: v.details.address_lat, lng: v.details.address_lng!, kind: 'dropoff' as const, label: 'You' }] : []),
        ...(v.driver?.lat ? [{ id: 'd', lat: v.driver.lat, lng: v.driver.lng!, kind: 'driver' as const, label: v.driver.name }] : []),
    ];
    const [cancelOpen, setCancelOpen] = useState(false);
    return (
        <>
            <StageBanner image={v.banner.image} title={v.banner.title} subtitle={v.banner.subtitle} />
            {v.live && (
                <button onClick={onLive} className="group bg-brand flex items-center gap-4 rounded-3xl p-4 text-left text-black shadow-[0_12px_32px_-12px_rgba(23,199,74,0.7)] transition hover:brightness-105">
                    <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-black text-white"><span className="absolute inset-0 animate-ping rounded-full bg-black/30 [animation-duration:2s]" /><Bike className="relative size-6" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-lg font-extrabold">Track your driver live</span><span className="block text-sm text-black/70">See the store, your driver and you on the map</span></span>
                    <span className="rounded-full bg-black px-4 py-2 text-sm font-bold text-white transition group-hover:translate-x-0.5">Open map</span>
                </button>
            )}
            {!v.is_done && <EnableAlertsCard />}

            <ol className="grid gap-1 px-1">
                {v.timeline.map((s) => (
                    <li key={s.key} className="flex items-start gap-4 py-2.5">
                        <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full',
                            s.state === 'done' && 'bg-brand text-black',
                            s.state === 'current' && 'bg-brand text-black ring-brand/25 ring-4',
                            s.state === 'upcoming' && 'border-2 border-neutral-200 dark:border-white/15',
                            s.state === 'stopped' && 'bg-[var(--color-zred)] text-white')}>
                            {s.state === 'stopped' ? <X className="size-4" strokeWidth={3} /> : s.state !== 'upcoming' ? <Check className="size-4" strokeWidth={3} /> : null}
                        </span>
                        <div className="min-w-0">
                            <div className={cn('text-[17px]', s.state === 'upcoming' ? 'text-muted-foreground font-medium' : 'font-bold')}>
                                {s.label}{s.at && s.state !== 'upcoming' && <span className="tabular ml-2 font-normal">{hhmm(s.at)}</span>}
                                {s.state === 'current' && !v.is_done && <span className="bg-brand/15 text-brand-700 dark:text-brand ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-bold tracking-wide uppercase">Now</span>}
                            </div>
                            {s.detail && s.state !== 'upcoming' && <div className="text-muted-foreground text-[15px]">{s.detail}</div>}
                        </div>
                    </li>
                ))}
            </ol>

            {v.driver && (
                <div className="flex items-center gap-4 rounded-3xl border p-5">
                    <span className="bg-brand/15 flex size-14 items-center justify-center rounded-full text-xl font-bold">{v.driver.name[0]}</span>
                    <div className="min-w-0 flex-1"><div className="font-bold">{v.driver.name}</div><div className="text-muted-foreground text-sm">{label(v.driver.vehicle)}{v.driver.plate && ` · ${v.driver.plate}`} · ★ {v.driver.rating.toFixed(1)}</div></div>
                    <Button variant="outline" size="icon" className="rounded-full" asChild><a href={`tel:${v.driver.phone}`} aria-label="Call driver"><Phone /></a></Button>
                </div>
            )}
            {v.delivery_pin && <div className="bg-muted rounded-3xl p-5 dark:bg-white/5"><div className="text-sm font-semibold">Your delivery PIN</div><div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{v.delivery_pin}</div><div className="text-muted-foreground mt-1 text-xs">Give it to your driver when they arrive.</div></div>}
            {v.fulfilment === 'delivery' && !v.is_done && markers.length > 0 && <LiveMap apiKey={mapsKey} markers={markers} className="h-64 rounded-3xl" />}

            {v.review_banner && (
                <>
                    <StageBanner image={v.review_banner} title="How was it?" subtitle={`Rate ${v.store.name} and help others choose.`} />
                    <ReviewBox orderId={v.id} hasDriver={v.fulfilment === 'delivery'} />
                </>
            )}
            <div className="flex flex-wrap gap-3">
                {v.status === 'delivered' && <Button asChild variant="ink" className="h-12 flex-1 rounded-full"><Link href={`/orders/${v.id}/reorder`} method="post" as="button"><RotateCcw /> Order this again</Link></Button>}
                {v.can_cancel && <Button variant="outline" className="text-zred h-12 rounded-full" onClick={() => setCancelOpen(true)}><X /> Cancel order</Button>}
            </div>
            <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} id={v.id} />
        </>
    );
}

function Receipt({ v }: { v: OrderView }) {
    const [emailOpen, setEmailOpen] = useState(false);
    return (
        <>
            <div className="flex items-center gap-4">
                {v.store.logo ? <img src={v.store.logo} alt="" className="size-16 shrink-0 rounded-full border object-cover" /> : <span className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-full"><Store className="size-7" /></span>}
                <div className="min-w-0"><h2 className="text-2xl leading-tight font-extrabold tracking-tight">{v.store.name}</h2>{v.store.address && <p className="text-muted-foreground text-sm">{v.store.address}</p>}</div>
            </div>
            <div className="overflow-hidden rounded-3xl border">
                <div className="border-b px-5 py-3 text-sm font-semibold capitalize">{v.fulfilment} · {new Date(v.placed_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <ul className="divide-y">
                    {v.receipt.lines.map((l, i) => (
                        <li key={i} className="flex gap-4 px-5 py-4">
                            <span className="tabular w-8 shrink-0 text-lg font-bold">{l.quantity}×</span>
                            <div className="min-w-0 flex-1">
                                <div className="font-bold">{l.name}</div>
                                {l.options.map((o) => <div key={o} className="text-muted-foreground text-sm">{o}</div>)}
                                {l.notes && <div className="text-muted-foreground text-sm italic">“{l.notes}”</div>}
                                {l.quantity > 1 && <div className="text-muted-foreground mt-1 text-xs">{zig(l.unit.zig)} each</div>}
                            </div>
                            <span className="tabular shrink-0 font-semibold">{zig(l.total.zig)}</span>
                        </li>
                    ))}
                </ul>
            </div>
            <Totals v={v} />
            <div className="grid gap-3 sm:grid-cols-2">
                <Button asChild className="h-12 rounded-full text-[15px]"><a href={v.receipt.pdf_url} download={`Zvino-receipt-${v.reference}.pdf`}><Download /> Download PDF receipt</a></Button>
                <Button variant="outline" className="h-12 rounded-full text-[15px]" onClick={() => setEmailOpen(true)}><Mail /> Email me the receipt</Button>
            </div>
            <EmailModal open={emailOpen} onClose={() => setEmailOpen(false)} id={v.id} email={v.details.account.email} />
        </>
    );
}

function Totals({ v }: { v: OrderView }) {
    return (
        <div className="overflow-hidden rounded-3xl border">
            <div className="grid gap-3 px-5 py-5">
                {v.receipt.totals.map((t) => (
                    <div key={t.label} className="flex justify-between gap-4 text-[15px]">
                        <span className="flex items-center gap-1.5">{t.label}{t.help && <span title={t.help}><HelpCircle className="text-muted-foreground size-4" /></span>}</span>
                        <span className="tabular font-semibold">{zig(t.amount.zig)}</span>
                    </div>
                ))}
            </div>
            <div className="flex items-baseline justify-between border-t px-5 py-4">
                <span className="text-xl font-extrabold">Total</span>
                <span className="tabular text-right"><span className="block text-2xl font-extrabold">{zig(v.receipt.total.zig)}</span><span className="text-muted-foreground text-xs">VAT incl. {zig(v.receipt.vat.zig)}</span></span>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section>
            <h2 className="mb-2.5 text-lg font-extrabold tracking-tight">{title}</h2>
            <div className="bg-muted rounded-3xl px-5 py-4 text-[15px] leading-relaxed dark:bg-white/5">{children}</div>
        </section>
    );
}

function Details({ v }: { v: OrderView }) {
    const a = v.details.address;
    return (
        <>
            {v.fulfilment === 'delivery' ? (
                <Section title="Delivery address">
                    {a ? <>{a.label && <div className="font-semibold">{a.label}</div>}<div>{a.line1}</div>{a.landmark && <div>Near {a.landmark}</div>}<div>{[a.suburb, a.city].filter(Boolean).join(', ')}</div></> : <span className="text-muted-foreground">No address</span>}
                    {v.details.dropoff && <div className="text-muted-foreground mt-2 text-sm">Drop-off: {v.details.dropoff}</div>}
                </Section>
            ) : (
                <Section title="Collect from"><div className="font-semibold">{v.store.name}</div><div>{v.store.address}</div>{v.store.phone && <a href={`tel:${v.store.phone}`} className="underline">{v.store.phone}</a>}</Section>
            )}
            <Section title={v.fulfilment === 'delivery' ? 'Delivery instructions' : 'Notes'}>
                {v.details.instructions ? <span className="whitespace-pre-line">{v.details.instructions}</span> : <span className="text-muted-foreground">No instructions</span>}
                {v.details.no_cutlery && <div className="text-muted-foreground mt-1 text-sm">No cutlery, please</div>}
            </Section>
            <Section title="Account details">
                <div>{v.details.account.name || 'Zvino customer'}</div>
                {v.details.account.phone && <div>{v.details.account.phone}</div>}
                {v.details.account.email && <div>{v.details.account.email}</div>}
            </Section>
            <Section title="Payment method">
                <div className="flex justify-between gap-3"><span>{v.details.payment.method}</span><span className="text-muted-foreground">{v.details.payment.status}</span></div>
                {v.details.payment.cash_part && <div className="text-muted-foreground text-sm">Cash to the driver: {zig(v.details.payment.cash_part.zig)}</div>}
                {v.receipt.wallet_applied && <div className="text-muted-foreground text-sm">From your wallet: {zig(v.receipt.wallet_applied.zig)}</div>}
            </Section>
            <section>
                <h2 className="mb-2.5 text-lg font-extrabold tracking-tight">Order summary</h2>
                <Totals v={v} />
            </section>
        </>
    );
}

function HelpModal({ open, onClose, v }: { open: boolean; onClose: () => void; v: OrderView }) {
    const [cancel, setCancel] = useState(false);
    const wa = v.support.whatsapp ? `https://wa.me/${v.support.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Zvino, I need help with order #${v.reference}`)}` : null;
    return (
        <>
            <Modal open={open} onClose={onClose} size="sm" title="Need help with this order?" description={`Quote order #${v.reference}.`} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
                <div className="grid gap-2">
                    {wa && <a href={wa} target="_blank" rel="noreferrer" className="hover:bg-muted flex h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold"><MessageCircle className="size-5" /> WhatsApp support</a>}
                    {v.support.phone && <a href={`tel:${v.support.phone}`} className="hover:bg-muted flex h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold"><Phone className="size-5" /> Call {v.support.phone}</a>}
                    {v.store.phone && !v.is_done && <a href={`tel:${v.store.phone}`} className="hover:bg-muted flex h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold"><Store className="size-5" /> Call {v.store.name}</a>}
                    {v.can_cancel && <button onClick={() => { onClose(); setCancel(true); }} className="text-zred hover:bg-muted flex h-12 items-center gap-3 rounded-xl border px-4 text-sm font-semibold"><X className="size-5" /> Cancel order</button>}
                </div>
            </Modal>
            <CancelModal open={cancel} onClose={() => setCancel(false)} id={v.id} />
        </>
    );
}

function EmailModal({ open, onClose, id, email }: { open: boolean; onClose: () => void; id: number; email: string | null }) {
    const { data, setData, post, processing, errors } = useForm({ email: email ?? '' });
    return (
        <Modal open={open} onClose={onClose} size="sm" title="Email the receipt" description="We’ll send a PDF copy."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || !data.email} onClick={() => post(`/orders/${id}/receipt/email`, { preserveScroll: true, onSuccess: onClose })}><Mail /> Send</Button></>}>
            <input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} placeholder="you@example.com" className="h-12 w-full rounded-xl border px-4 outline-none focus:border-[#222222] dark:bg-white/5" />
            {errors.email && <p className="text-zred mt-1.5 text-sm">{errors.email}</p>}
        </Modal>
    );
}

function ReviewBox({ orderId, hasDriver }: { orderId: number; hasDriver: boolean }) {
    const { data, setData, post, processing } = useForm({ vendor_rating: 0, driver_rating: 5, comment: '', tags: [] as string[] });
    const tags = ['Hot & fresh', 'Great portions', 'Fast delivery', 'Friendly driver', 'Well packed'];
    return (
        <div className="rounded-3xl border p-6">
            <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setData('vendor_rating', n)} aria-label={`${n} stars`}><Star className={cn('size-9 transition', n <= data.vendor_rating ? 'fill-[var(--color-gold)] text-gold' : 'text-neutral-300')} /></button>)}</div>
            {data.vendor_rating > 0 && (
                <>
                    <div className="mt-4 flex flex-wrap gap-2">{tags.map((t) => <button key={t} onClick={() => setData('tags', data.tags.includes(t) ? data.tags.filter((x) => x !== t) : [...data.tags, t])} className={cn('h-9 rounded-full px-3.5 text-sm font-medium', data.tags.includes(t) ? 'bg-[#1c1c1c] text-white' : 'bg-muted')}>{t}</button>)}</div>
                    <Textarea className="mt-3" value={data.comment} onChange={(e) => setData('comment', e.target.value)} placeholder="Tell others about your meal (optional)" />
                    {hasDriver && <div className="mt-3 flex items-center gap-3 text-sm"><span className="font-medium">Driver</span>{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setData('driver_rating', n)}><Star className={cn('size-5', n <= data.driver_rating ? 'fill-[var(--color-gold)] text-gold' : 'text-neutral-300')} /></button>)}</div>}
                    <Button variant="ink" className="mt-4 rounded-full" disabled={processing} onClick={() => post(`/orders/${orderId}/review`, { preserveScroll: true })}>Submit review</Button>
                </>
            )}
        </div>
    );
}

function CancelModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: number }) {
    const [reason, setReason] = useState('Changed my mind');
    return (
        <Modal open={open} onClose={onClose} size="sm" title="Cancel this order?" description="You’ll get a full refund to your Zvino wallet straight away."
            footer={<><Button variant="outline" onClick={onClose}>Keep order</Button><Button variant="destructive" onClick={() => router.post(`/orders/${id}/cancel`, { reason }, { onSuccess: onClose })}>Cancel order</Button></>}>
            <div className="grid gap-2">{['Changed my mind', 'Ordered by mistake', 'Taking too long', 'Wrong address'].map((r) => <button key={r} onClick={() => setReason(r)} className={cn('rounded-xl border px-4 py-3 text-left text-sm', reason === r && 'border-[#222222] font-semibold')}>{r}</button>)}</div>
        </Modal>
    );
}

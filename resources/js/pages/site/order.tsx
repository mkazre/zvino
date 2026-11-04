import { Button } from '@/components/ui/button';
import { LiveMap, Modal, Textarea } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { label, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Order } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Bike, Check, ChefHat, Clock, MessageCircle, Phone, ReceiptText, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type Live = {
    status: string;
    payment_status: string;
    status_history: { status?: string; at: string }[];
    estimated_delivery_at: string | null;
    driver: { name: string; phone: string; vehicle: string; plate: string | null; rating: number; lat: number | null; lng: number | null } | null;
};
interface Props {
    order: Order & Live & {
        address: { line1: string; landmark?: string; suburb?: string; city: string; lat?: number; lng?: number } | null;
        store: { name: string; slug: string; phone: string | null; lat: number | null; lng: number | null; logo_path: string | null; address: string | null };
        delivery_pin: string | null;
        scheduled_for: string | null;
        can_cancel: boolean;
        review: { vendor_rating: number } | null;
        tip_zig: number;
        dropoff: string;
    };
    mapsKey: string | null;
    support: { phone: string; whatsapp: string };
}

const STEPS = [
    { key: 'placed', label: 'Order received', icon: ReceiptText },
    { key: 'accepted', label: 'Restaurant confirmed', icon: Check },
    { key: 'preparing', label: 'Being prepared', icon: ChefHat },
    { key: 'picked_up', label: 'On the way', icon: Bike },
    { key: 'delivered', label: 'Delivered', icon: Check },
];
const ORDER = ['pending_payment', 'scheduled', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];

const HEADLINE: Record<string, [string, string]> = {
    pending_payment: ['Waiting for payment', 'Approve the prompt on your phone to confirm.'],
    scheduled: ['Scheduled', 'We’ll send your order to the restaurant in time.'],
    placed: ['Order received', 'Waiting for the restaurant to confirm…'],
    accepted: ['Confirmed!', 'The restaurant is getting started.'],
    preparing: ['Being prepared', 'Your food is being cooked fresh.'],
    ready: ['Ready for pickup', 'Your driver is on the way to the restaurant.'],
    picked_up: ['On the way', 'Your driver has your order.'],
    arriving: ['Almost there!', 'Your driver is just around the corner.'],
    delivered: ['Delivered. Enjoy! 🎉', 'Thanks for ordering with Zvino.'],
    cancelled: ['Order cancelled', 'Any payment has been returned to your Zvino wallet.'],
    rejected: ['Restaurant couldn’t take your order', 'You’ve been fully refunded to your Zvino wallet.'],
};

export default function OrderPage({ order: initial, mapsKey, support }: Props) {
    const [live, setLive] = useState<Live>(initial);
    const [cancelOpen, setCancelOpen] = useState(false);
    const o = { ...initial, ...live };
    const done = ['delivered', 'cancelled', 'rejected'].includes(o.status);

    useEffect(() => {
        if (done) return;
        const t = setInterval(() => fetch(`/orders/${o.id}/status`, { headers: { Accept: 'application/json' } }).then((r) => r.ok && r.json()).then((d) => d && setLive(d)), 10000);
        return () => clearInterval(t);
    }, [done, o.id]);

    const idx = ORDER.indexOf(o.status === 'ready' ? 'preparing' : o.status === 'arriving' ? 'picked_up' : o.status);
    const eta = o.estimated_delivery_at ? new Date(o.estimated_delivery_at) : null;
    const minsLeft = eta ? Math.max(0, Math.round((eta.getTime() - Date.now()) / 60000)) : null;
    const [title, sub] = HEADLINE[o.status] ?? [label(o.status), ''];
    const markers = [
        ...(o.store.lat ? [{ id: 's', lat: o.store.lat, lng: o.store.lng!, kind: 'store' as const, label: o.store.name }] : []),
        ...(o.address?.lat ? [{ id: 'h', lat: o.address.lat, lng: o.address.lng!, kind: 'dropoff' as const, label: 'You' }] : []),
        ...(o.driver?.lat ? [{ id: 'd', lat: o.driver.lat, lng: o.driver.lng!, kind: 'driver' as const, label: o.driver.name }] : []),
    ];

    return (
        <SiteLayout>
            <Head title={`Order ${o.reference} · Zvino`} />
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[1fr_380px]">
                <div className="grid content-start gap-6">
                    <div>
                        <p className="text-muted-foreground text-sm font-medium">{o.reference} · {o.store.name}</p>
                        <h1 className="mt-1 text-[34px] leading-tight font-extrabold tracking-[-0.04em]">{title}</h1>
                        <p className="text-muted-foreground mt-1">{sub}</p>
                        {!done && minsLeft !== null && o.status !== 'pending_payment' && o.status !== 'scheduled' && (
                            <div className="mt-5 inline-flex items-center gap-3 rounded-2xl bg-[#111412] px-5 py-3 text-white"><Clock className="size-5" /><span><span className="tabular text-2xl font-extrabold">{eta!.toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</span><span className="ml-2 text-sm text-white/60">estimated · {minsLeft} min</span></span></div>
                        )}
                        {o.scheduled_for && o.status === 'scheduled' && <div className="mt-5 inline-flex rounded-2xl bg-blue-50 px-5 py-3 font-semibold text-blue-900">Scheduled for {new Date(o.scheduled_for).toLocaleString('en-ZW', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</div>}
                    </div>

                    {!['cancelled', 'rejected'].includes(o.status) && (
                        <ol className="grid gap-0">
                            {STEPS.filter((s) => o.fulfilment === 'delivery' || s.key !== 'picked_up').map((s, i, arr) => {
                                const reached = ORDER.indexOf(s.key) <= idx;
                                const current = reached && (i === arr.length - 1 || ORDER.indexOf(arr[i + 1].key) > idx);
                                const at = o.status_history.find((h) => h.status === s.key)?.at;
                                return (
                                    <li key={s.key} className="flex gap-4">
                                        <div className="flex flex-col items-center">
                                            <span className={cn('flex size-10 items-center justify-center rounded-full border-2 transition', reached ? 'border-[#0b6e4f] bg-[#0b6e4f] text-white' : 'border-neutral-200 text-neutral-400', current && !done && 'ring-4 ring-[#0b6e4f]/20')}><s.icon className="size-5" /></span>
                                            {i < arr.length - 1 && <span className={cn('my-1 h-8 w-0.5', ORDER.indexOf(arr[i + 1].key) <= idx ? 'bg-[#0b6e4f]' : 'bg-neutral-200')} />}
                                        </div>
                                        <div className="pt-2"><div className={cn('font-semibold', !reached && 'text-muted-foreground')}>{s.label}</div>{at && <div className="text-muted-foreground text-xs">{new Date(at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</div>}</div>
                                    </li>
                                );
                            })}
                        </ol>
                    )}

                    {o.fulfilment === 'delivery' && markers.length > 0 && !done && <LiveMap apiKey={mapsKey} markers={markers} className="h-72" />}

                    {o.driver && !done && (
                        <div className="flex items-center gap-4 rounded-3xl border p-5">
                            <span className="flex size-14 items-center justify-center rounded-full bg-[#e8f3ee] text-xl font-bold text-[#0b6e4f]">{o.driver.name[0]}</span>
                            <div className="flex-1"><div className="font-bold">{o.driver.name}</div><div className="text-muted-foreground text-sm">{label(o.driver.vehicle)} {o.driver.plate && `· ${o.driver.plate}`} · ★ {o.driver.rating.toFixed(1)}</div></div>
                            <Button variant="outline" size="icon" className="rounded-full" asChild><a href={`tel:${o.driver.phone}`} aria-label="Call driver"><Phone /></a></Button>
                        </div>
                    )}
                    {o.delivery_pin && !done && o.dropoff === 'hand_to_me' && <div className="rounded-3xl bg-neutral-50 p-5 dark:bg-white/5"><div className="text-sm font-semibold">Your delivery PIN</div><div className="mt-1 font-mono text-3xl font-extrabold tracking-[0.3em]">{o.delivery_pin}</div><div className="text-muted-foreground mt-1 text-xs">Share it with your driver when they arrive.</div></div>}

                    {o.status === 'delivered' && !o.review && <ReviewBox orderId={o.id} hasDriver={o.fulfilment === 'delivery'} />}
                    {o.status === 'delivered' && <Link href={`/orders/${o.id}/reorder`} method="post" as="button" className="h-12 rounded-full bg-[#111412] font-semibold text-white">Order this again</Link>}
                </div>

                <aside className="grid content-start gap-4">
                    <div className="rounded-3xl border p-6">
                        <h2 className="font-bold">Order details</h2>
                        <ul className="mt-3 grid gap-2 text-sm">{o.items?.map((i, k) => <li key={k} className="flex gap-3"><span className="tabular font-semibold">{i.quantity}×</span><span className="flex-1">{i.name}</span><span className="tabular">{zig(i.line_total.zig)}</span></li>)}</ul>
                        <div className="mt-4 flex justify-between border-t pt-4 font-bold"><span>Total paid</span><span className="tabular">{zig(o.totals.total.zig)}</span></div>
                        <p className="text-muted-foreground text-right text-xs">{label(o.payment_method)} · {label(o.payment_status)}</p>
                        {o.address && <p className="text-muted-foreground mt-4 border-t pt-4 text-sm">📍 {o.address.line1}{o.address.landmark && ` (${o.address.landmark})`}, {o.address.city}</p>}
                    </div>
                    <div className="rounded-3xl border p-6">
                        <h2 className="font-bold">Need help?</h2>
                        <div className="mt-3 grid gap-2">
                            {support.whatsapp && <a href={`https://wa.me/${support.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Zvino, I need help with order ${o.reference}`)}`} className="flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"><MessageCircle className="size-4" /> WhatsApp support</a>}
                            <a href={`tel:${support.phone}`} className="flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"><Phone className="size-4" /> Call {support.phone}</a>
                            {o.can_cancel && <button onClick={() => setCancelOpen(true)} className="flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-[#c8102e]"><X className="size-4" /> Cancel order</button>}
                        </div>
                    </div>
                </aside>
            </div>
            <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} id={o.id} />
        </SiteLayout>
    );
}

function ReviewBox({ orderId, hasDriver }: { orderId: number; hasDriver: boolean }) {
    const { data, setData, post, processing } = useForm({ vendor_rating: 0, driver_rating: 5, comment: '', tags: [] as string[] });
    const tags = ['Hot & fresh', 'Great portions', 'Fast delivery', 'Friendly driver', 'Well packed'];
    return (
        <div className="rounded-3xl border p-6">
            <h2 className="text-lg font-bold">How was it?</h2>
            <div className="mt-3 flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setData('vendor_rating', n)} aria-label={`${n} stars`}><Star className={cn('size-9 transition', n <= data.vendor_rating ? 'fill-[#c99412] text-[#c99412]' : 'text-neutral-300')} /></button>)}</div>
            {data.vendor_rating > 0 && (
                <>
                    <div className="mt-4 flex flex-wrap gap-2">{tags.map((t) => <button key={t} onClick={() => setData('tags', data.tags.includes(t) ? data.tags.filter((x) => x !== t) : [...data.tags, t])} className={cn('h-9 rounded-full px-3.5 text-sm font-medium', data.tags.includes(t) ? 'bg-[#111412] text-white' : 'bg-muted')}>{t}</button>)}</div>
                    <Textarea className="mt-3" value={data.comment} onChange={(e) => setData('comment', e.target.value)} placeholder="Tell others about your meal (optional)" />
                    {hasDriver && <div className="mt-3 flex items-center gap-3 text-sm"><span className="font-medium">Driver</span>{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setData('driver_rating', n)}><Star className={cn('size-5', n <= data.driver_rating ? 'fill-[#c99412] text-[#c99412]' : 'text-neutral-300')} /></button>)}</div>}
                    <Button variant="dark" className="mt-4 rounded-full" disabled={processing} onClick={() => post(`/orders/${orderId}/review`, { preserveScroll: true })}>Submit review</Button>
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
            <div className="grid gap-2">{['Changed my mind', 'Ordered by mistake', 'Taking too long', 'Wrong address'].map((r) => <button key={r} onClick={() => setReason(r)} className={cn('rounded-xl border px-4 py-3 text-left text-sm', reason === r && 'border-[#111412] font-semibold')}>{r}</button>)}</div>
        </Modal>
    );
}

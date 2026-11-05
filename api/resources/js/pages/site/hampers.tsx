import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/z';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { alt, both, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Money } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Check, Gift, Loader2, Package } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Hamper { id: number; name: string; description: string | null; image_path: string | null; vendor: { name: string; city: string } | null; price: Money; contents: { name: string; quantity: number }[] }
interface Props { enabled: boolean; hampers: Hamper[]; wallet: Money | null; cities: string[]; sent: { id: number; name: string; kind: string; day_of_month: number | null; next_run_at: string | null; is_active: boolean; recipient_name: string | null }[] }

const xsrf = () => decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '');
const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() }, body: JSON.stringify(body) });

/** Diaspora: send a grocery hamper to family in Zimbabwe, once or every month. */
export default function Hampers(p: Props) {
    const { auth } = usePage<SiteProps>().props;
    const [pick, setPick] = useState<Hamper | null>(null);
    return (
        <SiteLayout>
            <Head title="Send groceries home · Zvino" />
            <section className="bg-brand text-white">
                <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
                    <p className="text-sm font-semibold tracking-wide text-white/70 uppercase">For Zimbabweans abroad</p>
                    <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-extrabold tracking-[-0.03em] md:text-5xl">Send a grocery hamper home. Every month, on time.</h1>
                    <p className="mt-4 max-w-xl text-lg text-white/80">Pay by card from the UK, South Africa or the US. We deliver to Mum’s gate and SMS her when it’s on the way.</p>
                </div>
            </section>
            <div className="mx-auto max-w-6xl px-6 py-10">
                {!p.enabled || p.hampers.length === 0 ? (
                    <div className="py-16 text-center"><Package className="mx-auto size-8" /><p className="text-muted-foreground mt-3">Hampers are coming soon.</p></div>
                ) : (
                    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        {p.hampers.map((h) => (
                            <article key={h.id} className="flex flex-col overflow-hidden rounded-3xl border">
                                {h.image_path ? <img src={h.image_path} alt="" className="h-44 w-full object-cover" /> : <div className="flex h-44 items-center justify-center bg-brand-50"><Gift className="size-10 text-brand-600" /></div>}
                                <div className="flex flex-1 flex-col p-5">
                                    <h2 className="text-lg font-bold">{h.name}</h2>
                                    <p className="text-muted-foreground text-sm">{h.vendor?.name} · {h.vendor?.city}</p>
                                    {h.description && <p className="mt-2 text-sm">{h.description}</p>}
                                    <ul className="text-muted-foreground mt-3 grid gap-1 text-sm">{h.contents.map((c, i) => <li key={i}>{c.quantity}× {c.name}</li>)}</ul>
                                    <div className="mt-auto flex items-end justify-between pt-5">
                                        <span><span className="tabular block text-2xl font-extrabold">{zig(h.price.zig)}</span><span className="tabular text-muted-foreground text-sm">{alt(h.price.zig)}</span></span>
                                        {auth?.user ? <Button variant="dark" className="rounded-full" onClick={() => setPick(h)}>Send this</Button> : <Button variant="dark" className="rounded-full" asChild><Link href="/signin?next=/hampers">Sign in to send</Link></Button>}
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                {p.sent.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-xl font-bold">Your hampers</h2>
                        <ul className="mt-3 grid gap-2">{p.sent.map((s) => <li key={s.id} className="flex justify-between rounded-2xl border px-5 py-3 text-sm"><span><b>{s.name}</b> for {s.recipient_name}</span><span className="text-muted-foreground">{s.kind === 'monthly' ? `Monthly on the ${s.day_of_month}th` : 'Once'}{s.next_run_at && s.is_active ? ` · next ${new Date(s.next_run_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}` : ' · delivered'}</span></li>)}</ul>
                    </div>
                )}
            </div>
            {pick && <SendForm h={pick} p={p} onClose={() => setPick(null)} />}
        </SiteLayout>
    );
}

function SendForm({ h, p, onClose }: { h: Hamper; p: Props; onClose: () => void }) {
    const [f, setF] = useState({ recipient_name: '', recipient_phone: '', line1: '', suburb: '', city: p.cities[0] ?? 'Harare', landmark: '', frequency: 'monthly', day_of_month: '25', deliver_on: '', gift_message: '' });
    const [busy, setBusy] = useState(false);
    const short = Math.max(0, h.price.zig - (p.wallet?.zig ?? 0));
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

    const topUp = async () => {
        setBusy(true);
        const r = await postJson('/wallet/topup', { amount_zig: Math.ceil(short), method: 'card' });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return toast.error(d.message ?? 'Top-up failed');
        if (d.redirect_url) window.location.href = d.redirect_url;
        else router.reload({ only: ['wallet'] });
    };
    const send = async () => {
        setBusy(true);
        const r = await postJson(`/hampers/${h.id}/send`, { ...f, day_of_month: f.frequency === 'monthly' ? Number(f.day_of_month) : null, deliver_on: f.frequency === 'once' ? f.deliver_on : null });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return toast.error(d.message ?? Object.values(d.errors ?? {})[0] ?? 'Please check the form');
        toast.success(`Done! First delivery ${new Date(d.next_delivery).toLocaleDateString('en-ZW', { weekday: 'long', day: 'numeric', month: 'long' })}.`);
        onClose();
        router.reload();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-6" onClick={onClose}>
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 md:rounded-3xl dark:bg-[#222222]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-xl font-bold">Send “{h.name}”</h2>
                <p className="text-muted-foreground text-sm">{both(h.price.zig)} each time · paid from your Zvino wallet</p>
                <div className="mt-5 grid gap-3">
                    <div className="grid grid-cols-2 gap-3"><Input placeholder="Who is it for?" value={f.recipient_name} onChange={set('recipient_name')} /><Input placeholder="Their phone (077…)" inputMode="tel" value={f.recipient_phone} onChange={set('recipient_phone')} /></div>
                    <Input placeholder="Street address / stand number" value={f.line1} onChange={set('line1')} />
                    <div className="grid grid-cols-2 gap-3"><Input placeholder="Suburb" value={f.suburb} onChange={set('suburb')} /><Select value={f.city} onChange={set('city')}>{p.cities.map((c) => <option key={c}>{c}</option>)}</Select></div>
                    <Input placeholder="Landmark (e.g. opposite the church, green gate)" value={f.landmark} onChange={set('landmark')} />
                    <div className="grid grid-cols-2 gap-2">
                        {['monthly', 'once'].map((k) => <button key={k} type="button" onClick={() => setF({ ...f, frequency: k })} className={cn('rounded-2xl border-2 p-3 text-left text-sm font-semibold', f.frequency === k ? 'border-[#222222] dark:border-white' : 'border-transparent bg-neutral-50 dark:bg-white/5')}>{k === 'monthly' ? 'Every month' : 'Just once'}{f.frequency === k && <Check className="float-right size-4" />}</button>)}
                    </div>
                    {f.frequency === 'monthly' ? <label className="text-sm">Deliver on day <Input className="ml-2 inline-block w-20" type="number" min={1} max={28} value={f.day_of_month} onChange={set('day_of_month')} /> of each month</label> : <Input type="date" value={f.deliver_on} onChange={set('deliver_on')} />}
                    <Textarea placeholder="Gift message (optional)" value={f.gift_message} onChange={set('gift_message')} maxLength={200} />
                </div>
                {short > 0 ? (
                    <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                        Your wallet has {zig(p.wallet?.zig ?? 0)}. Top up {zig(Math.ceil(short))} by card to send this hamper. Monthly hampers need a balance each month (we’ll remind you).
                        <Button variant="dark" className="mt-3 w-full rounded-full" disabled={busy} onClick={topUp}>{busy ? <Loader2 className="size-4 animate-spin" /> : `Top up ${zig(Math.ceil(short))} by card`}</Button>
                    </div>
                ) : (
                    <Button variant="dark" className="mt-5 h-12 w-full rounded-full" disabled={busy || !f.recipient_name || !f.recipient_phone || !f.line1 || (f.frequency === 'once' && !f.deliver_on)} onClick={send}>{busy ? <Loader2 className="size-4 animate-spin" /> : 'Send hamper'}</Button>
                )}
            </div>
        </div>
    );
}

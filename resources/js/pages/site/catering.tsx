import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/z';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { label, zig } from '@/lib/money';
import { type Money } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { CookingPot, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Req { id: number; reference: string; event_type: string; event_at: string; headcount: number; status: string; quote_zig: number | null; quote_note: string | null; deposit_zig: number; paid_zig: number; amount_due_zig: number; vendor: { name: string } | null }
interface Props { enabled: boolean; stores: { id: number; name: string; city: string; cuisine: string | null }[]; requests: Req[]; minHeadcount: number; wallet: Money | null }

const TYPES = [['funeral', 'Funeral (mariro / umngcwabo)'], ['wedding', 'Wedding / roora'], ['gathering', 'Family gathering'], ['church', 'Church event'], ['corporate', 'Company event'], ['other', 'Other']];
const xsrf = () => decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '');
const postJson = (url: string, body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf() }, body: JSON.stringify(body) });

/** Catering for funerals, weddings and gatherings: request a quote, pay a deposit, then the balance. */
export default function Catering(p: Props) {
    const { auth } = usePage<SiteProps>().props;
    const [f, setF] = useState({ vendor_id: p.stores[0]?.id ?? 0, event_type: 'funeral', event_at: '', headcount: String(Math.max(p.minHeadcount, 50)), location: '', contact_name: '', contact_phone: '', notes: '' });
    const [busy, setBusy] = useState(false);
    const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

    const submit = async () => {
        setBusy(true);
        const r = await postJson('/catering', { ...f, headcount: Number(f.headcount), event_at: f.event_at.replace('T', ' ') });
        const d = await r.json().catch(() => ({}));
        setBusy(false);
        if (!r.ok) return toast.error(d.message ?? Object.values(d.errors ?? {})[0] ?? 'Please check the form');
        toast.success('Request sent. The caterer will reply with a quote.');
        router.reload({ only: ['requests'] });
    };
    const pay = async (r: Req, method: string) => {
        const res = await postJson(`/catering/${r.id}/pay`, { method, phone: auth?.user?.phone });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) return toast.error(d.message ?? 'Payment failed');
        if (d.payment?.redirect_url) window.location.href = d.payment.redirect_url;
        else { toast.success(d.payment?.status === 'paid' ? 'Paid ✓' : 'Approve the prompt on your phone'); router.reload({ only: ['requests', 'wallet'] }); }
    };

    return (
        <SiteLayout>
            <Head title="Catering · Zvino" />
            <section className="bg-[#111412] text-white">
                <div className="mx-auto max-w-6xl px-6 py-14">
                    <h1 className="max-w-2xl text-4xl font-extrabold tracking-[-0.03em] md:text-5xl">Catering for the moments that matter</h1>
                    <p className="mt-4 max-w-xl text-lg text-white/75">Funerals, weddings, church and family gatherings. Tell us how many people and when, and a trusted caterer sends you a quote. Pay a deposit to confirm.</p>
                </div>
            </section>
            <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[1fr_380px]">
                <div className="rounded-3xl border p-6">
                    <h2 className="text-xl font-bold">Request a quote</h2>
                    {!p.enabled || !p.stores.length ? <p className="text-muted-foreground mt-3">No caterers are available yet.</p> : !auth?.user ? (
                        <Button variant="dark" className="mt-4 rounded-full" asChild><Link href="/signin?next=/catering">Sign in to request</Link></Button>
                    ) : (
                        <div className="mt-4 grid gap-3">
                            <Select value={f.vendor_id} onChange={set('vendor_id')}>{p.stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.city}</option>)}</Select>
                            <Select value={f.event_type} onChange={set('event_type')}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-sm">When<Input className="mt-1" type="datetime-local" value={f.event_at} onChange={set('event_at')} /></label>
                                <label className="text-sm">How many people<Input className="mt-1" type="number" min={p.minHeadcount} value={f.headcount} onChange={set('headcount')} /></label>
                            </div>
                            <Input placeholder="Where (address, church, venue, rural home…)" value={f.location} onChange={set('location')} />
                            <div className="grid grid-cols-2 gap-3"><Input placeholder="Contact on the day" value={f.contact_name} onChange={set('contact_name')} /><Input placeholder="Their phone" inputMode="tel" value={f.contact_phone} onChange={set('contact_phone')} /></div>
                            <Textarea placeholder="What would you like? e.g. sadza, beef stew, chicken, rice, greens, drinks; serving staff, plates…" value={f.notes} onChange={set('notes')} />
                            <Button variant="dark" className="h-12 rounded-full" disabled={busy || !f.event_at || !f.location} onClick={submit}>{busy ? <Loader2 className="size-4 animate-spin" /> : 'Send request'}</Button>
                            <p className="text-muted-foreground text-xs">Funerals can be arranged at short notice. Deposits are refunded if the caterer declines.</p>
                        </div>
                    )}
                </div>
                <aside className="grid content-start gap-3">
                    <h2 className="font-bold">Your requests</h2>
                    {p.requests.length === 0 && <p className="text-muted-foreground text-sm"><CookingPot className="mr-1 inline size-4" />Nothing yet.</p>}
                    {p.requests.map((r) => (
                        <div key={r.id} className="rounded-2xl border p-4 text-sm">
                            <div className="flex justify-between"><b>{label(r.event_type)} · {r.headcount}</b><span className="text-muted-foreground">{label(r.status)}</span></div>
                            <div className="text-muted-foreground">{r.vendor?.name} · {new Date(r.event_at).toLocaleString('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            {r.quote_zig && <div className="mt-2">Quote <b className="tabular">{zig(r.quote_zig)}</b>{r.paid_zig > 0 && <> · paid {zig(r.paid_zig)}</>}</div>}
                            {r.quote_note && <p className="text-muted-foreground mt-1 text-xs">{r.quote_note}</p>}
                            {r.amount_due_zig > 0 && ['quoted', 'deposit_paid'].includes(r.status) && (
                                <div className="mt-3 flex gap-2">
                                    <Button size="sm" variant="dark" className="rounded-full" onClick={() => pay(r, 'ecocash')}>Pay {zig(r.amount_due_zig)} EcoCash</Button>
                                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => pay(r, 'card')}>Card</Button>
                                </div>
                            )}
                        </div>
                    ))}
                </aside>
            </div>
        </SiteLayout>
    );
}

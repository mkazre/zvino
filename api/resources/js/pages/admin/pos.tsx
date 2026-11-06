import { Button } from '@/components/ui/button';
import { Badge, Drawer, Field, Input, Modal, SearchInput, Segmented, StatusPill, Thumb } from '@/components/z';
import { QrCode } from '@/components/qr';
import AdminLayout from '@/layouts/admin-layout';
import { alt, fmtUsd, fmtZig, label, timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Item, type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Banknote, BarChart3, CreditCard, Loader2, Minus, Plus, Printer, QrCode as QrCodeIcon, Smartphone, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useMemo, useState } from 'react';

type PosItem = Item & { modifier_groups?: { id: number; name: string; min: number; max: number; required: boolean; options: { id: number; name: string; price_delta: { zig: number } }[] }[] };
interface Props {
    vendor: { id: number; name: string; power_out: boolean } | null;
    vendors: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    items: { data: PosItem[] };
    zigPerUsd: number;
    vatPct: number;
    businessName: string;
    vatNumber: string;
    shift: { sales: number; total_zig: number; by_method: { payment_method: string; c: number; t: number }[] };
    recent: { id: number; reference: string; total_zig: number; payment_method: string; payment_status: string; created_at: string; items: { name: string; quantity: number }[] }[];
}
interface Line { key: string; item: PosItem; variant: string | null; modifiers: string[]; quantity: number; unit: number }

const METHODS = [
    { value: 'cash', label: 'Cash', icon: Banknote },
    { value: 'card', label: 'Card', icon: CreditCard },
    { value: 'ecocash', label: 'EcoCash', icon: Smartphone },
    { value: 'innbucks', label: 'InnBucks', icon: Smartphone },
    { value: 'onemoney', label: 'OneMoney', icon: Smartphone },
    { value: 'qr', label: 'QR pay', icon: QrCodeIcon },
] as const;

export default function Pos(p: Props) {
    const { auth } = usePage<SharedData>().props;
    const [cat, setCat] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [lines, setLines] = useState<Line[]>([]);
    const [picking, setPicking] = useState<PosItem | null>(null);
    const [charging, setCharging] = useState<string | null>(null);
    const [shiftOpen, setShiftOpen] = useState(false);
    const [receipt, setReceipt] = useState<{ lines: Line[]; total: number; method: string; tendered?: number; currency?: string; change?: number } | null>(null);

    const visible = p.items.data.filter((i) => (!cat || i.category_id === cat) && i.name.toLowerCase().includes(search.toLowerCase()));
    const total = useMemo(() => lines.reduce((s, l) => s + l.unit * l.quantity, 0), [lines]);
    const vat = total - total / (1 + p.vatPct / 100);
    const count = lines.reduce((s, l) => s + l.quantity, 0);

    const base = (i: PosItem) => i.special_price?.zig ?? i.price.zig;
    const add = (item: PosItem, variant: string | null = null, modifiers: string[] = []) => {
        const unit = base(item) + Number(item.variants.find((v) => v.name === variant)?.price_delta_zig ?? 0) + modifiers.reduce((s, m) => s + (item.modifier_groups?.flatMap((g) => g.options).find((o) => o.name === m)?.price_delta.zig ?? 0), 0);
        const key = `${item.id}:${variant ?? ''}:${modifiers.join(',')}`;
        setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { key, item, variant, modifiers, quantity: 1, unit }]));
    };
    const tap = (item: PosItem) => (item.variants.length || item.modifier_groups?.length ? setPicking(item) : add(item));
    const qty = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

    const [qr, setQr] = useState<{ url: string; paymentId: number; total: number; reference: string; snapshot: { lines: Line[]; total: number; method: string } } | null>(null);

    // Poll the payment while the customer scans and pays on their phone.
    useEffect(() => {
        if (!qr) return;
        const timer = setInterval(async () => {
            const r = await fetch(`/admin/pos/payments/${qr.paymentId}`, { headers: { Accept: 'application/json' } }).then((x) => x.json()).catch(() => null);
            if (r?.status === 'paid') {
                clearInterval(timer);
                setReceipt(qr.snapshot);
                setQr(null);
                setLines([]);
                toast.success(`Paid ✓ ${qr.reference}`);
                router.reload({ only: ['shift', 'recent'] });
            } else if (r && ['failed', 'cancelled'].includes(r.status)) {
                clearInterval(timer);
                toast.error('Payment was declined. Try again or take cash.');
                setQr(null);
            }
        }, 2500);
        return () => clearInterval(timer);
    }, [qr]);

    const chargeQr = async () => {
        if (!p.vendor) return;
        const xsrf = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '');
        const res = await fetch('/admin/pos/sales', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': xsrf }, body: JSON.stringify({ vendor_id: p.vendor.id, method: 'qr', lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, variant: l.variant, modifiers: l.modifiers })) }) });
        const d = await res.json();
        if (!res.ok || !d.qr_url) return toast.error(d.message ?? 'Couldn’t start a QR payment. Is Paynow configured?');
        setCharging(null);
        setQr({ url: d.qr_url, paymentId: d.payment_id, total: d.total_zig, reference: d.reference, snapshot: { lines, total, method: 'qr' } });
    };

    const charge = (method: string, extra: { phone?: string; tendered?: number; tendered_currency?: string }) => {
        if (!p.vendor) return;
        if (method === 'qr') return void chargeQr();
        const snapshot = { lines, total, method, tendered: extra.tendered, currency: extra.tendered_currency, change: extra.tendered !== undefined ? Math.max(0, (extra.tendered_currency === 'USD' ? extra.tendered * p.zigPerUsd : extra.tendered) - total) : undefined };
        router.post('/admin/pos/sales', { vendor_id: p.vendor.id, method, ...extra, lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, variant: l.variant, modifiers: l.modifiers })) }, {
            preserveScroll: true,
            onSuccess: () => { setLines([]); setCharging(null); setReceipt(snapshot); },
        });
    };

    return (
        <AdminLayout title="Point of sale" fullBleed>
            <div className="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row">
                {/* Menu */}
                <section className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
                        <div className="mr-auto">
                            <h1 className="text-lg font-bold tracking-tight">{p.vendor?.name ?? 'Point of sale'}</h1>
                            <p className="text-muted-foreground text-xs">{auth.user.name} · 1 USD = {p.zigPerUsd} ZiG{p.vendor?.power_out && ' · ⚡ load-shedding: power items hidden'}</p>
                        </div>
                        {p.vendors.length > 1 && !auth.user.vendor_id && (
                            <select className="border-input bg-surface h-9 rounded-lg border px-3 text-sm" value={p.vendor?.id} onChange={(e) => router.get('/admin/pos', { vendor_id: e.target.value })}>{p.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                        )}
                        <SearchInput value={search} onChange={setSearch} placeholder="Search menu" className="w-56" />
                        <Button variant="outline" size="sm" onClick={() => setShiftOpen(true)}><BarChart3 /> Shift</Button>
                    </div>
                    <div className="scroll-quiet flex gap-2 overflow-x-auto border-b px-5 py-3">
                        {[{ id: null as number | null, name: 'All' }, ...p.categories].map((c) => (
                            <button key={c.id ?? 'all'} onClick={() => setCat(c.id)} className={cn('h-10 shrink-0 rounded-full px-5 text-sm font-semibold transition', cat === c.id ? 'bg-foreground text-background' : 'bg-muted hover:bg-muted/70')}>{c.name}</button>
                        ))}
                    </div>
                    <div className="scroll-quiet grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {visible.map((i) => {
                            const inTicket = lines.filter((l) => l.item.id === i.id).reduce((s, l) => s + l.quantity, 0);
                            return (
                                <button key={i.id} onClick={() => tap(i)} className="bg-surface group relative flex flex-col overflow-hidden rounded-xl border text-left shadow-(--shadow-card) transition active:scale-[0.97] hover:border-foreground/25">
                                    <Thumb src={i.image} size={400} rounded="rounded-none" className="!h-28 !w-full" />
                                    {inTicket > 0 && <span className="bg-brand absolute top-2 right-2 flex size-7 items-center justify-center rounded-full text-sm font-bold text-white shadow">{inTicket}</span>}
                                    <div className="flex flex-1 flex-col p-3">
                                        <span className="text-[13.5px] leading-snug font-semibold">{i.name}</span>
                                        <span className="mt-auto flex items-baseline gap-1.5 pt-1.5">
                                            <span className="tabular font-bold">{zig(base(i))}</span>
                                            {i.special_price && <span className="tabular text-muted-foreground text-xs line-through">{zig(i.price.zig)}</span>}
                                        </span>
                                        {(i.variants.length > 0 || (i.modifier_groups?.length ?? 0) > 0) && <span className="text-muted-foreground text-[11px]">Options available</span>}
                                    </div>
                                </button>
                            );
                        })}
                        {visible.length === 0 && <p className="text-muted-foreground col-span-full py-16 text-center text-sm">No items match.</p>}
                    </div>
                </section>

                {/* Ticket */}
                <aside className="bg-surface flex w-full flex-col border-t lg:w-[400px] lg:border-t-0 lg:border-l">
                    <header className="flex items-center justify-between border-b px-5 py-4">
                        <h2 className="font-bold">Current sale {count > 0 && <span className="text-muted-foreground font-normal">· {count} item{count > 1 ? 's' : ''}</span>}</h2>
                        {lines.length > 0 && <button className="text-muted-foreground hover:text-zred text-sm" onClick={() => setLines([])}>Clear</button>}
                    </header>
                    <ul className="scroll-quiet min-h-40 flex-1 divide-y overflow-y-auto">
                        {lines.length === 0 && <li className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 py-16 text-center text-sm"><Banknote className="size-6" />Tap items to start a sale</li>}
                        {lines.map((l) => (
                            <li key={l.key} className="flex items-center gap-3 px-5 py-3">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold">{l.item.name}</div>
                                    <div className="text-muted-foreground truncate text-xs">{[l.variant, ...l.modifiers].filter(Boolean).join(' · ') || 'Regular'} · {zig(l.unit)}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => qty(l.key, -1)} className="hover:bg-muted flex size-9 items-center justify-center rounded-lg border" aria-label="Less">{l.quantity === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}</button>
                                    <span className="tabular w-7 text-center font-bold">{l.quantity}</span>
                                    <button onClick={() => qty(l.key, 1)} className="hover:bg-muted flex size-9 items-center justify-center rounded-lg border" aria-label="More"><Plus className="size-4" /></button>
                                </div>
                                <span className="tabular w-20 text-right text-sm font-semibold">{zig(l.unit * l.quantity)}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="bg-subtle border-t px-5 py-4">
                        <div className="text-muted-foreground flex justify-between text-sm"><span>VAT {p.vatPct}% (included)</span><span className="tabular">{zig(vat)}</span></div>
                        <div className="mt-1 flex items-end justify-between">
                            <span className="text-lg font-bold">Total</span>
                            <span className="text-right"><span className="tabular block text-[28px] leading-none font-bold tracking-tight">{zig(total)}</span><span className="tabular text-muted-foreground text-sm">{alt(total)}</span></span>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t p-4">
                        {METHODS.map((m, idx) => (
                            <Button key={m.value} variant={idx === 0 ? 'default' : 'outline'} disabled={!lines.length} onClick={() => (m.value === 'qr' ? void chargeQr() : setCharging(m.value))} className={cn('h-14 flex-col gap-1 text-xs', idx === 0 && 'col-span-3 h-14 flex-row text-base')}>
                                <m.icon className={idx === 0 ? 'size-5' : 'size-4'} />{idx === 0 ? `Charge ${zig(total)} cash` : m.label}
                            </Button>
                        ))}
                    </div>
                </aside>
            </div>

            {picking && <OptionPicker item={picking} onClose={() => setPicking(null)} onAdd={(v, m) => { add(picking, v, m); setPicking(null); }} />}
            {qr && (
                <Modal open onClose={() => setQr(null)} title="Scan to pay" description={<span className="tabular">Total <b className="text-foreground">{zig(qr.total)}</b> · {qr.reference}</span>}
                    footer={<Button variant="outline" onClick={() => setQr(null)}><X /> Cancel</Button>}>
                    <div className="grid place-items-center gap-3 py-2">
                        <QrCode value={qr.url} size={260} />
                        <p className="text-muted-foreground text-center text-sm">Customer scans with their phone camera and pays with EcoCash, InnBucks, OneMoney or card. This closes by itself once paid.</p>
                        <Loader2 className="text-muted-foreground size-5 animate-spin" />
                    </div>
                </Modal>
            )}
            {charging && <ChargeModal method={charging} total={total} rate={p.zigPerUsd} onClose={() => setCharging(null)} onCharge={(extra) => charge(charging, extra)} />}
            {receipt && <Receipt r={receipt} p={p} cashier={auth.user.name} onClose={() => setReceipt(null)} />}
            <Drawer open={shiftOpen} onClose={() => setShiftOpen(false)} title="Today’s shift" description={`${p.shift.sales} paid sales`}>
                <div className="grid gap-5">
                    <div className="bg-foreground text-background rounded-xl p-5"><div className="text-sm opacity-70">Takings today</div><div className="tabular text-3xl font-bold">{zig(p.shift.total_zig)}</div><div className="tabular text-sm opacity-70">{alt(p.shift.total_zig)}</div></div>
                    <div className="grid gap-2">{p.shift.by_method.map((m) => <div key={m.payment_method} className="flex justify-between rounded-lg border px-4 py-3 text-sm"><span className="font-medium">{label(m.payment_method)} <span className="text-muted-foreground">· {m.c}</span></span><span className="tabular font-semibold">{zig(m.t)}</span></div>)}</div>
                    <div>
                        <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">Recent sales</div>
                        <ul className="divide-y rounded-lg border">{p.recent.map((r) => <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="font-mono text-xs font-semibold">{r.reference}</span><span className="text-muted-foreground flex-1 truncate text-xs">{r.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</span><span className="tabular">{zig(r.total_zig)}</span><StatusPill status={r.payment_status} /></li>)}</ul>
                    </div>
                    <p className="text-muted-foreground text-xs">Daily sales and VAT export for ZIMRA is in Reports → Orders CSV (source: POS).</p>
                </div>
            </Drawer>
        </AdminLayout>
    );
}

function OptionPicker({ item, onClose, onAdd }: { item: PosItem; onClose: () => void; onAdd: (variant: string | null, modifiers: string[]) => void }) {
    const [variant, setVariant] = useState<string | null>(item.variants[0]?.name ?? null);
    const [mods, setMods] = useState<string[]>([]);
    const groups = item.modifier_groups ?? [];
    const valid = groups.every((g) => { const n = g.options.filter((o) => mods.includes(o.name)).length; return n >= g.min && n <= g.max; });
    const toggle = (g: (typeof groups)[number], name: string) => {
        const inGroup = g.options.map((o) => o.name);
        const picked = mods.filter((m) => inGroup.includes(m));
        if (mods.includes(name)) setMods(mods.filter((m) => m !== name));
        else if (g.max === 1) setMods([...mods.filter((m) => !inGroup.includes(m)), name]);
        else if (picked.length < g.max) setMods([...mods, name]);
    };
    return (
        <Modal open onClose={onClose} title={item.name} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => onAdd(variant, mods)}>Add to sale</Button></>}>
            <div className="grid gap-5">
                {item.variants.length > 0 && <div><div className="mb-2 text-sm font-semibold">Size</div><div className="flex flex-wrap gap-2">{item.variants.map((v) => <button key={v.name} onClick={() => setVariant(v.name)} className={cn('h-11 rounded-lg border px-4 text-sm font-medium', variant === v.name ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}>{v.name}{v.price_delta_zig ? ` +${v.price_delta_zig}` : ''}</button>)}</div></div>}
                {groups.map((g) => (
                    <div key={g.id}>
                        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">{g.name}{g.required ? <Badge tone="danger">Required</Badge> : <span className="text-muted-foreground text-xs font-normal">up to {g.max}</span>}</div>
                        <div className="flex flex-wrap gap-2">{g.options.map((o) => <button key={o.id} onClick={() => toggle(g, o.name)} className={cn('h-11 rounded-lg border px-4 text-sm font-medium', mods.includes(o.name) ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}>{o.name}{o.price_delta.zig ? ` +${o.price_delta.zig}` : ''}</button>)}</div>
                    </div>
                ))}
            </div>
        </Modal>
    );
}

function ChargeModal({ method, total, rate, onClose, onCharge }: { method: string; total: number; rate: number; onClose: () => void; onCharge: (extra: { phone?: string; tendered?: number; tendered_currency?: string }) => void }) {
    const [currency, setCurrency] = useState<'USD' | 'ZIG'>('USD');
    const [tendered, setTendered] = useState('');
    const [phone, setPhone] = useState('');
    const dueUsd = total / rate;
    const t = Number(tendered) || 0;
    const tZig = currency === 'USD' ? t * rate : t;
    const change = tZig - total;
    const quick = currency === 'USD' ? [Math.ceil(dueUsd), 5, 10, 20, 50].filter((v, i, a) => v >= dueUsd && a.indexOf(v) === i).slice(0, 4) : [Math.ceil(total / 10) * 10, 100, 200, 500, 1000].filter((v, i, a) => v >= total && a.indexOf(v) === i).slice(0, 4);
    const mobile = ['ecocash', 'onemoney', 'innbucks'].includes(method);

    return (
        <Modal open onClose={onClose} title={`${label(method)} payment`} description={<span className="tabular">Due <b className="text-foreground">{fmtZig(total)}</b> · {fmtUsd(dueUsd)}</span>}
            footer={<><Button variant="outline" onClick={onClose}><X /> Back</Button><Button size="lg" disabled={(method === 'cash' && t > 0 && change < 0) || (mobile && phone.length < 9)} onClick={() => onCharge(method === 'cash' ? (t ? { tendered: t, tendered_currency: currency } : {}) : mobile ? { phone } : {})}>{method === 'cash' ? 'Complete sale' : mobile ? 'Send payment request' : 'Card approved'}</Button></>}>
            {method === 'cash' && (
                <div className="grid gap-4">
                    <Segmented value={currency} onChange={(c) => { setCurrency(c); setTendered(''); }} options={[{ value: 'USD', label: 'USD cash' }, { value: 'ZIG', label: 'ZiG cash' }]} />
                    <Field label="Cash received" hint="Leave empty for exact amount."><Input autoFocus type="number" step="0.01" prefix={currency === 'USD' ? '$' : 'ZiG'} value={tendered} onChange={(e) => setTendered(e.target.value)} className="h-14 text-xl" /></Field>
                    <div className="flex flex-wrap gap-2">{quick.map((q) => <Button key={q} variant="outline" onClick={() => setTendered(String(q))}>{currency === 'USD' ? `$${q}` : `ZiG ${q}`}</Button>)}</div>
                    {t > 0 && (
                        <div className={cn('rounded-xl p-4', change >= 0 ? 'bg-brand-50 dark:bg-brand/10' : 'bg-zred-50 dark:bg-zred/10')}>
                            <div className="text-sm font-medium">{change >= 0 ? 'Change to give' : 'Still owed'}</div>
                            <div className="tabular text-2xl font-bold">{zig(Math.abs(change))}</div>
                            <div className="tabular text-muted-foreground text-sm">or {fmtUsd(Math.abs(change) / rate)}</div>
                        </div>
                    )}
                </div>
            )}
            {mobile && (
                <div className="grid gap-3">
                    <Field label="Customer’s mobile number" hint="They’ll get a prompt on their phone to approve the payment."><Input autoFocus value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 123 4567" className="h-14 text-lg" inputMode="tel" /></Field>
                </div>
            )}
            {method === 'card' && <p className="text-muted-foreground text-sm">Take the payment on the card machine, then confirm here once it’s approved.</p>}
        </Modal>
    );
}

function Receipt({ r, p, cashier, onClose }: { r: { lines: Line[]; total: number; method: string; tendered?: number; currency?: string; change?: number }; p: Props; cashier: string; onClose: () => void }) {
    const vat = r.total - r.total / (1 + p.vatPct / 100);
    return (
        <Modal open onClose={onClose} size="sm" title="Sale complete ✓" footer={<><Button variant="outline" onClick={() => window.print()}><Printer /> Print receipt</Button><Button onClick={onClose}>New sale</Button></>}>
            <div id="receipt" className="rounded-lg border border-dashed p-4 font-mono text-xs leading-relaxed print:border-0">
                <div className="text-center font-bold">{p.businessName} · {p.vendor?.name}</div>
                {p.vatNumber && <div className="text-center">VAT {p.vatNumber}</div>}
                <div className="text-center">{new Date().toLocaleString('en-ZW')} · {cashier}</div>
                <div className="my-2 border-t border-dashed" />
                {r.lines.map((l) => <div key={l.key} className="flex justify-between"><span>{l.quantity}× {l.item.name}{l.variant ? ` (${l.variant})` : ''}</span><span>{(l.unit * l.quantity).toFixed(2)}</span></div>)}
                <div className="my-2 border-t border-dashed" />
                <div className="flex justify-between font-bold"><span>TOTAL ZiG</span><span>{r.total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>USD @ {p.zigPerUsd}</span><span>{(r.total / p.zigPerUsd).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>VAT incl.</span><span>{vat.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Paid by</span><span>{label(r.method)}</span></div>
                {r.tendered !== undefined && <><div className="flex justify-between"><span>Tendered</span><span>{r.currency} {r.tendered.toFixed(2)}</span></div><div className="flex justify-between"><span>Change ZiG</span><span>{(r.change ?? 0).toFixed(2)}</span></div></>}
                <div className="mt-2 text-center">Thank you! Order online at zvino.online</div>
            </div>
        </Modal>
    );
}

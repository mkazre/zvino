import { Button } from '@/components/ui/button';
import { Input, Modal, Select, Textarea } from '@/components/z';
import { AddressModal } from '@/components/site-address';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { cart as browserCart, useCart } from '@/lib/cart';
import { label, usd, zig } from '@/lib/money';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type Money } from '@/types';
import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { Banknote, Bike, CalendarClock, Check, CreditCard, Building2, Footprints, Heart, Home, Leaf, Loader2, MapPin, Plus, Smartphone, Tag, Wallet, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Address { id: number; label: string; line1: string; landmark: string | null; suburb: string | null; city: string; instructions: string | null; is_default: boolean }
interface ServerCart {
    vendor: { id: number; name: string; slug: string } | null;
    items: { id: number; name: string; quantity: number; options: { variant?: string; modifiers?: string[] } | null; line_total: Money }[];
    voucher: { code: string } | null;
    totals: Record<'subtotal' | 'delivery' | 'service' | 'small_order' | 'discount' | 'tip' | 'vat' | 'total' | 'member_savings', Money>;
    surge: { multiplier: number; reason: string | null } | null;
    distance_km: number | null;
    eta_minutes: [number, number] | null;
    tip_totals?: Record<string, Money>;
    needs_prescription?: boolean;
    batch?: { zone: string; departs_at: string; arrives_at: string } | null;
    deal?: string | null;
}
interface Props {
    cart: ServerCart;
    addresses: Address[];
    wallet: Money;
    methods: string[];
    tipPresets: number[];
    scheduleDays: number;
    store: { availability: { is_open: boolean; next_open_at: string | null }; offers_delivery: boolean; offers_pickup: boolean; accepts_scheduled: boolean; address: string | null } | null;
    cities: string[];
    codLimit: number;
    phone: string;
    splitTender: boolean;
    splitBill: number;
    charity: { name: string; step: number } | null;
    company: { company: string; left_today_zig: number | null } | null;
}

const METHOD_META: Record<string, { icon: typeof Smartphone; hint: string }> = {
    ecocash: { icon: Smartphone, hint: 'Approve the prompt on your phone' },
    innbucks: { icon: Smartphone, hint: 'Approve in the InnBucks app' },
    onemoney: { icon: Smartphone, hint: 'Approve the prompt on your phone' },
    card: { icon: CreditCard, hint: 'Visa or Mastercard via Paynow' },
    wallet: { icon: Wallet, hint: '' },
    cash: { icon: Banknote, hint: 'USD or ZiG. Your driver has change, or we’ll credit it to your wallet' },
    company: { icon: Building2, hint: '' },
};

export default function Checkout(p: Props) {
    const { zigPerUsd } = usePage<SiteProps>().props;
    const t = useT();
    const browser = useCart();
    const [server, setServer] = useState<ServerCart>(p.cart);
    const [syncing, setSyncing] = useState(false);
    const [addrOpen, setAddrOpen] = useState(false);
    const [promo, setPromo] = useState(p.cart.voucher?.code ?? browser.promo ?? '');
    const [tipPct, setTipPct] = useState<number | 'custom'>(p.tipPresets[1] ?? 0);
    const [customTip, setCustomTip] = useState('');
    const [when, setWhen] = useState<'asap' | 'later'>(p.store?.availability.is_open === false ? 'later' : 'asap');

    const form = useForm({
        fulfilment: p.store?.offers_delivery === false ? 'pickup' : 'delivery',
        address_id: p.addresses.find((a) => a.is_default)?.id ?? p.addresses[0]?.id ?? null,
        payment_method: p.methods.includes('ecocash') ? 'ecocash' : p.methods[0],
        phone: p.phone?.replace('+263', '0') ?? '',
        notes: '',
        tip: 0,
        scheduled_for: '',
        dropoff: 'hand_to_me',
        use_wallet: false as boolean,
        cash_part: '',
        prescription: '',
        split_with: [] as { name: string; phone: string; amount: string }[],
        round_up: false as boolean,
        no_cutlery: true as boolean,
    });
    const subtotal = server.totals.subtotal.zig;
    const tip = tipPct === 'custom' ? Number(customTip) || 0 : Math.round(subtotal * (tipPct / 100));

    // 1. push the browser basket to the server cart (prices/availability re-checked server-side)
    useEffect(() => {
        if (!browser.vendor || !browser.lines.length) return;
        setSyncing(true);
        fetch('/checkout/sync', { method: 'POST', headers: headers(), body: JSON.stringify({ vendor_id: browser.vendor.id, promo: browser.promo, lines: browser.lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, variant: l.variant, modifiers: l.modifiers, notes: l.notes })) }) })
            .then(async (r) => (r.ok ? setServer(await r.json()) : toast.error((await r.json()).message ?? 'Some items are no longer available.')))
            .finally(() => setSyncing(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [browser.lines.length, browser.vendor?.id]);

    // 2. live quote when address / fulfilment / tip / promo change
    const quote = useCallback(
        (withPromo?: string) => {
            fetch('/checkout/quote', { method: 'POST', headers: headers(), body: JSON.stringify({ fulfilment: form.data.fulfilment, address_id: form.data.address_id, tip, ...(withPromo !== undefined ? { promo: withPromo } : {}) }) })
                .then(async (r) => {
                    const d = await r.json();
                    if (r.ok) setServer(d);
                    else toast.error(d.message);
                    if (withPromo !== undefined) {
                        browserCart.setPromo(r.ok && withPromo ? withPromo : undefined);
                        if (r.ok && withPromo) toast.success('Promo applied 🎉');
                    }
                });
        },
        [form.data.fulfilment, form.data.address_id, tip],
    );
    useEffect(() => {
        const t = setTimeout(() => quote(), 250);
        return () => clearTimeout(t);
    }, [quote]);

    const totals = server.tip_totals ?? server.totals;
    const baseTotal = totals.total.zig;
    const step = p.charity?.step ?? 0;
    const donation = form.data.round_up && step ? Math.round((Math.ceil(baseTotal / step) * step - baseTotal) * 100) / 100 : 0;
    const total = baseTotal + donation;
    const walletPart = form.data.use_wallet && form.data.payment_method !== 'wallet' ? Math.min(p.wallet.zig, total) : 0;
    const online = ['ecocash', 'onemoney', 'innbucks', 'card'].includes(form.data.payment_method);
    const cashPart = p.splitTender && online && form.data.fulfilment === 'delivery' ? Math.min(Number(form.data.cash_part) || 0, Math.max(0, total - walletPart - 1)) : 0;
    const splitOk = p.splitBill > 0 && ['ecocash', 'onemoney', 'innbucks'].includes(form.data.payment_method);
    const friends = splitOk ? form.data.split_with.filter((f) => Number(f.amount) > 0 && f.phone.replace(/\D/g, '').length >= 9) : [];
    const friendsTotal = friends.reduce((s, f) => s + Number(f.amount), 0);
    const due = total - walletPart - cashPart - friendsTotal;
    const [uploading, setUploading] = useState(false);
    const uploadPrescription = async (file: File) => {
        setUploading(true);
        const fd = new FormData();
        fd.append('photo', file);
        const r = await fetch('/checkout/prescription', { method: 'POST', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': headers()['X-XSRF-TOKEN'] }, body: fd });
        const d = await r.json().catch(() => ({}));
        setUploading(false);
        if (r.ok) { form.setData('prescription', d.token); toast.success('Prescription added'); } else toast.error(d.message ?? 'Upload failed');
    };
    const evenSplit = () => {
        const people = form.data.split_with.length + 1;
        const each = Math.floor(((total - walletPart - cashPart) / people) * 100) / 100;
        form.setData('split_with', form.data.split_with.map((f) => ({ ...f, amount: String(each) })));
    };
    const slots = scheduleSlots(p.scheduleDays);
    const canPay = server.items.length > 0 && (!server.needs_prescription || !!form.data.prescription) && due > 0 && (form.data.fulfilment === 'pickup' || form.data.address_id) && (when === 'asap' ? p.store?.availability.is_open !== false : form.data.scheduled_for);

    const place = () => {
        form.transform((d) => ({ ...d, tip, cash_part: cashPart || null, split_with: friends.length ? friends : null, prescription: d.prescription || null, scheduled_for: when === 'later' ? d.scheduled_for : null }));
        form.post('/checkout', { onSuccess: () => browserCart.clear(), preserveScroll: true });
    };

    if (!server.items.length && !syncing && !browser.lines.length) {
        return (
            <SiteLayout hideCart>
                <div className="mx-auto max-w-md py-24 text-center">
                    <div className="text-5xl">🛍️</div>
                    <h1 className="mt-4 text-2xl font-bold">Your basket is empty</h1>
                    <Button variant="dark" className="mt-6 rounded-full" asChild><Link href="/stores">Find something tasty</Link></Button>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout hideCart>
            <Head title="Checkout · Zvino" />
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[1fr_400px]">
                <div className="grid content-start gap-6">
                    <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">{t('Checkout')}</h1>

                    {/* Fulfilment */}
                    <Block title={t('How do you want it?')}>
                        <div className="grid grid-cols-2 gap-2">
                            {p.store?.offers_delivery !== false && <Tile active={form.data.fulfilment === 'delivery'} onClick={() => form.setData('fulfilment', 'delivery')} icon={Bike} title={t('Delivery')} sub={server.eta_minutes ? `${server.eta_minutes[0]}–${server.eta_minutes[1]} min` : ''} />}
                            {p.store?.offers_pickup && <Tile active={form.data.fulfilment === 'pickup'} onClick={() => form.setData('fulfilment', 'pickup')} icon={Footprints} title={t('Pickup')} sub="No delivery fee" />}
                        </div>
                        {form.data.fulfilment === 'pickup' && p.store?.address && <p className="text-muted-foreground mt-3 text-sm">Collect from {server.vendor?.name}, {p.store.address}</p>}
                    </Block>

                    {form.data.fulfilment === 'delivery' && (
                        <Block title={t('Delivery address')} action={<button onClick={() => setAddrOpen(true)} className="flex items-center gap-1 text-sm font-semibold"><Plus className="size-4" /> New address</button>}>
                            {p.addresses.length === 0 ? (
                                <button onClick={() => setAddrOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-left"><MapPin className="size-5" /><span className="font-semibold">Add your delivery address</span></button>
                            ) : (
                                <div className="grid gap-2">
                                    {p.addresses.map((a) => (
                                        <button key={a.id} onClick={() => form.setData('address_id', a.id)} className={cn('flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition', form.data.address_id === a.id ? 'border-[#111412] dark:border-white' : 'border-transparent bg-neutral-50 dark:bg-white/5')}>
                                            <Home className="mt-0.5 size-5 shrink-0" />
                                            <span className="min-w-0 flex-1"><span className="block font-semibold">{a.label}</span><span className="text-muted-foreground block text-sm">{a.line1}{a.suburb && `, ${a.suburb}`}, {a.city}</span>{a.landmark && <span className="text-muted-foreground block text-xs">📍 {a.landmark}</span>}</span>
                                            {form.data.address_id === a.id && <Check className="size-5" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {server.distance_km && <p className="text-muted-foreground mt-3 text-xs">{server.distance_km} km from the store</p>}
                            {server.batch && <div className="mt-3 rounded-xl bg-[#e8f3ee] px-4 py-3 text-sm text-[#0b6e4f]">🚐 <b>{server.batch.zone} run</b>: leaves {new Date(server.batch.departs_at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}, arrives about {new Date(server.batch.arrives_at).toLocaleString('en-ZW', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.</div>}
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Tile small active={form.data.dropoff === 'hand_to_me'} onClick={() => form.setData('dropoff', 'hand_to_me')} title="Hand it to me" />
                                <Tile small active={form.data.dropoff === 'leave_at_door'} onClick={() => form.setData('dropoff', 'leave_at_door')} title="Leave at gate / door" sub="Driver sends a photo" />
                            </div>
                        </Block>
                    )}

                    <Block title={t('When?')}>
                        <div className="grid grid-cols-2 gap-2">
                            <Tile active={when === 'asap'} disabled={p.store?.availability.is_open === false} onClick={() => setWhen('asap')} icon={Zap} title={t('As soon as possible')} sub={p.store?.availability.is_open === false ? 'Store is closed now' : ''} />
                            {p.scheduleDays > 0 && p.store?.accepts_scheduled && <Tile active={when === 'later'} onClick={() => setWhen('later')} icon={CalendarClock} title={t('Schedule for later')} sub={`Up to ${p.scheduleDays} days ahead`} />}
                        </div>
                        {when === 'later' && (
                            <Select className="mt-3 h-12" value={form.data.scheduled_for} onChange={(e) => form.setData('scheduled_for', e.target.value)}>
                                <option value="">Choose a time</option>
                                {slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </Select>
                        )}
                        {form.errors.scheduled_for && <p className="mt-2 text-sm text-[#c8102e]">{form.errors.scheduled_for}</p>}
                    </Block>

                    <Block title={t('Payment')}>
                        <div className="grid gap-2">
                            {p.methods.map((m) => {
                                const meta = METHOD_META[m];
                                const disabled = (m === 'wallet' && p.wallet.zig < total) || (m === 'cash' && due > p.codLimit);
                                return (
                                    <button key={m} disabled={disabled} onClick={() => form.setData('payment_method', m)} className={cn('flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition disabled:opacity-45', form.data.payment_method === m ? 'border-[#111412] dark:border-white' : 'border-transparent bg-neutral-50 dark:bg-white/5')}>
                                        <span className="flex size-10 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/10"><meta.icon className="size-5" /></span>
                                        <span className="flex-1"><span className="block font-semibold">{m === 'card' ? 'Visa / Mastercard' : m === 'wallet' ? 'Zvino wallet' : m === 'cash' ? 'Cash on delivery' : m === 'company' ? `${p.company?.company ?? 'Company'} account` : label(m)}</span>
                                            <span className="text-muted-foreground block text-xs">{m === 'company' ? (p.company?.left_today_zig != null ? `${zig(p.company.left_today_zig)} left today` : 'Billed to your company') : m === 'wallet' ? `Balance ${zig(p.wallet.zig)}` : m === 'cash' && due > p.codLimit ? `Not available over ${zig(p.codLimit)}` : meta.hint}</span></span>
                                        {form.data.payment_method === m && <Check className="size-5" />}
                                    </button>
                                );
                            })}
                        </div>
                        {p.splitTender && p.wallet.zig > 0 && form.data.payment_method !== 'wallet' && (
                            <div className="mt-3 grid"><Toggle checked={form.data.use_wallet} onChange={(v) => form.setData('use_wallet', v)} icon={Wallet} title={`Use my wallet balance (${zig(p.wallet.zig)})`} sub={walletPart > 0 ? `${zig(walletPart)} from wallet, ${zig(due)} by ${form.data.payment_method === 'cash' ? 'cash' : label(form.data.payment_method)}` : 'Pay part with your wallet, the rest another way'} /></div>
                        )}
                        {p.splitTender && online && form.data.fulfilment === 'delivery' && methodsHaveCash(p.methods) && (
                            <div className="mt-3 rounded-2xl bg-neutral-50 p-4 dark:bg-white/5">
                                <label className="flex items-center gap-2 text-sm font-semibold"><Banknote className="size-4" /> Pay part in cash? <span className="text-muted-foreground font-normal">(optional)</span></label>
                                <Input className="mt-2 h-11 w-48" type="number" min={0} prefix="ZiG" value={form.data.cash_part} onChange={(e) => form.setData('cash_part', e.target.value)} placeholder="0" />
                                {cashPart > 0 && <p className="text-muted-foreground mt-2 text-xs">Hand {zig(cashPart)} (≈ {usd(cashPart / zigPerUsd)}) to your driver, the rest {zig(due)} by {form.data.payment_method === 'card' ? 'card' : label(form.data.payment_method)}.</p>}
                            </div>
                        )}
                        {splitOk && (
                            <div className="mt-3 rounded-2xl bg-neutral-50 p-4 dark:bg-white/5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold">Split the bill with friends</span>
                                    <span className="flex gap-3 text-sm">
                                        {form.data.split_with.length > 0 && <button type="button" onClick={evenSplit} className="font-semibold underline">Split evenly</button>}
                                        {form.data.split_with.length < p.splitBill && <button type="button" onClick={() => form.setData('split_with', [...form.data.split_with, { name: '', phone: '', amount: '' }])} className="flex items-center gap-1 font-semibold"><Plus className="size-4" /> Add friend</button>}
                                    </span>
                                </div>
                                {form.data.split_with.map((f, i) => (
                                    <div key={i} className="mt-2 grid grid-cols-[1fr_1fr_110px_auto] gap-2">
                                        <Input className="h-11" placeholder="Name" value={f.name} onChange={(e) => form.setData('split_with', form.data.split_with.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                                        <Input className="h-11" inputMode="tel" placeholder="077 123 4567" value={f.phone} onChange={(e) => form.setData('split_with', form.data.split_with.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
                                        <Input className="h-11" type="number" placeholder="ZiG" value={f.amount} onChange={(e) => form.setData('split_with', form.data.split_with.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                                        <button type="button" aria-label="Remove" onClick={() => form.setData('split_with', form.data.split_with.filter((_, j) => j !== i))} className="text-muted-foreground px-2">✕</button>
                                    </div>
                                ))}
                                {friends.length > 0 && <p className="text-muted-foreground mt-2 text-xs">Each friend gets a {label(form.data.payment_method)} prompt for their share. Your order goes to the restaurant once everyone has paid. You pay {zig(due)}.</p>}
                            </div>
                        )}
                        {['ecocash', 'onemoney', 'innbucks'].includes(form.data.payment_method) && (
                            <div className="mt-4"><label className="text-sm font-semibold">{label(form.data.payment_method)} number</label><Input className="mt-1.5 h-12" inputMode="tel" value={form.data.phone} onChange={(e) => form.setData('phone', e.target.value)} placeholder="077 123 4567" /></div>
                        )}
                    </Block>

                    {p.tipPresets.length > 0 && form.data.fulfilment === 'delivery' && (
                        <Block title={t('Tip your driver')} action={<span className="text-muted-foreground text-xs">{t('100% goes to them')}</span>}>
                            <div className="flex flex-wrap gap-2">
                                {[0, ...p.tipPresets].map((t) => <button key={t} onClick={() => setTipPct(t)} className={cn('h-11 rounded-full px-5 text-sm font-semibold', tipPct === t ? 'bg-[#111412] text-white dark:bg-white dark:text-black' : 'bg-muted dark:bg-white/10')}>{t === 0 ? 'Not now' : `${t}% · ${zig(Math.round(subtotal * t / 100))}`}</button>)}
                                <button onClick={() => setTipPct('custom')} className={cn('h-11 rounded-full px-5 text-sm font-semibold', tipPct === 'custom' ? 'bg-[#111412] text-white' : 'bg-muted dark:bg-white/10')}>Other</button>
                            </div>
                            {tipPct === 'custom' && <Input className="mt-3 h-12 w-48" type="number" prefix="ZiG" value={customTip} onChange={(e) => setCustomTip(e.target.value)} />}
                        </Block>
                    )}

                    {server.needs_prescription && (
                        <Block title="Prescription">
                            <p className="text-muted-foreground text-sm">Your basket has prescription medicine. Add a clear photo of your prescription. The pharmacist checks it before accepting your order (you’re refunded in full if it’s declined).</p>
                            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed p-4">
                                {uploading ? <Loader2 className="size-5 animate-spin" /> : form.data.prescription ? <Check className="size-5 text-[#0b6e4f]" /> : <Plus className="size-5" />}
                                <span className="font-semibold">{form.data.prescription ? 'Prescription added. Tap to replace' : 'Add prescription photo'}</span>
                                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPrescription(e.target.files[0])} />
                            </label>
                            {form.errors.prescription && <p className="mt-2 text-sm text-[#c8102e]">{form.errors.prescription}</p>}
                        </Block>
                    )}

                    <Block title={t('Extras')}>
                        <div className="grid gap-2">
                            <Toggle checked={form.data.no_cutlery} onChange={(v) => form.setData('no_cutlery', v)} icon={Leaf} title={t('No cutlery or straws')} sub={t('Less plastic. Thank you!')} />
                            {p.charity && (
                                <Toggle checked={form.data.round_up} onChange={(v) => form.setData('round_up', v)} icon={Heart} title={`Round up for ${p.charity.name}`} sub={donation > 0 || !form.data.round_up ? `Add ${zig(form.data.round_up ? donation : Math.round((Math.ceil(baseTotal / step) * step - baseTotal) * 100) / 100)}. Every cent goes to the charity` : 'Your total is already round'} />
                            )}
                        </div>
                    </Block>

                    <Block title={t('Notes for the restaurant')}>
                        <Textarea value={form.data.notes} onChange={(e) => form.setData('notes', e.target.value)} placeholder="Allergies, extra napkins…" />
                    </Block>
                </div>

                {/* Summary */}
                <aside className="lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-3xl border p-6">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold">{server.vendor?.name}</h2>
                            {syncing && <Loader2 className="size-4 animate-spin" />}
                        </div>
                        <ul className="mt-4 grid gap-3 border-b pb-4 text-sm">
                            {server.items.map((i) => (
                                <li key={i.id} className="flex gap-3"><span className="tabular font-semibold">{i.quantity}×</span><span className="flex-1">{i.name}{(i.options?.variant || i.options?.modifiers?.length) && <span className="text-muted-foreground block text-xs">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(' · ')}</span>}</span><span className="tabular">{zig(i.line_total.zig)}</span></li>
                            ))}
                        </ul>
                        <form onSubmit={(e) => { e.preventDefault(); quote(promo); }} className="mt-4 flex gap-2">
                            <div className="relative flex-1"><Tag className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" /><input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder={t('Promo code')} className="bg-muted h-11 w-full rounded-xl pr-3 pl-9 font-mono text-sm uppercase outline-none dark:bg-white/10" /></div>
                            <Button variant="outline" className="h-11 rounded-xl">{server.voucher ? 'Applied ✓' : t('Apply')}</Button>
                        </form>
                        <dl className="mt-5 grid gap-2 text-sm">
                            <Row l={t('Subtotal')} v={totals.subtotal.zig} />
                            {form.data.fulfilment === 'delivery' && <Row l={<>Delivery{server.surge && <span className="ml-1 text-xs text-[#c99412]">({server.surge.multiplier}× {server.surge.reason ?? 'busy'})</span>}</>} v={totals.delivery.zig} free={totals.delivery.zig === 0} />}
                            <Row l={t('Service fee')} v={totals.service.zig} />
                            {totals.small_order.zig > 0 && <Row l="Small order fee" v={totals.small_order.zig} />}
                            {totals.discount.zig > 0 && <Row l={server.deal ?? 'Promo'} v={-totals.discount.zig} green />}
                            {totals.tip.zig > 0 && <Row l="Driver tip" v={totals.tip.zig} />}
                            {donation > 0 && <Row l={`Donation · ${p.charity?.name}`} v={donation} />}
                            {totals.member_savings.zig > 0 && <div className="rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-medium text-[#0b6e4f]">Zvino+ saved you {zig(totals.member_savings.zig)} 🎉</div>}
                        </dl>
                        <div className="mt-4 flex items-end justify-between border-t pt-4">
                            <span className="font-bold">{t('Total')}</span>
                            <span className="text-right"><span className="tabular block text-2xl font-extrabold tracking-tight">{zig(total)}</span><span className="tabular text-muted-foreground text-sm">{usd(totals.total.usd || total / zigPerUsd)} · VAT incl.</span></span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-right text-[11px]">Rate today: 1 USD = {zigPerUsd} ZiG</p>
                        {(walletPart > 0 || cashPart > 0 || friendsTotal > 0) && (
                            <dl className="bg-muted mt-3 grid gap-1 rounded-xl p-3 text-sm dark:bg-white/5">
                                {walletPart > 0 && <Row l="From wallet" v={-walletPart} green />}
                                {cashPart > 0 && <Row l="Cash to driver" v={-cashPart} />}
                                {friendsTotal > 0 && <Row l={`Friends (${friends.length})`} v={-friendsTotal} />}
                                <div className="flex justify-between font-semibold"><dt>To pay now</dt><dd className="tabular">{zig(due)}</dd></div>
                            </dl>
                        )}
                        {Object.values(form.errors).length > 0 && <div className="mt-4 rounded-xl bg-[#fdecee] p-3 text-sm text-[#c8102e]">{Object.values(form.errors)[0]}</div>}
                        <Button variant="dark" className="mt-5 h-14 w-full rounded-full text-base" disabled={!canPay || form.processing || syncing} onClick={place}>
                            {form.processing ? <Loader2 className="size-5 animate-spin" /> : `${t('Place order')} · ${zig(due)}`}
                        </Button>
                        {!canPay && <p className="text-muted-foreground mt-2 text-center text-xs">{form.data.fulfilment === 'delivery' && !form.data.address_id ? 'Add a delivery address to continue' : when === 'later' && !form.data.scheduled_for ? 'Pick a delivery time' : ''}</p>}
                    </div>
                </aside>
            </div>
            <AddressModal open={addrOpen} onClose={() => setAddrOpen(false)} cities={p.cities} />
        </SiteLayout>
    );
}

function methodsHaveCash(methods: string[]) {
    return methods.includes('cash');
}

function headers() {
    return { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '') };
}

function scheduleSlots(days: number) {
    const out: { value: string; label: string }[] = [];
    const start = new Date(Date.now() + 45 * 60000);
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
    for (let t = start.getTime(); t < Date.now() + days * 864e5; t += 30 * 60000) {
        const d = new Date(t);
        if (d.getHours() < 7 || d.getHours() > 22) continue;
        const pad = (n: number) => String(n).padStart(2, '0');
        out.push({ value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`, label: d.toLocaleString('en-ZW', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) });
    }
    return out;
}

function Block({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-3xl border p-6">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold tracking-tight">{title}</h2>{action}</div>
            {children}
        </section>
    );
}

function Tile({ active, onClick, icon: Icon, title, sub, disabled, small }: { active: boolean; onClick: () => void; icon?: typeof Bike; title: string; sub?: string; disabled?: boolean; small?: boolean }) {
    return (
        <button type="button" disabled={disabled} onClick={onClick} className={cn('flex items-center gap-3 rounded-2xl border-2 text-left transition disabled:opacity-40', small ? 'p-3' : 'p-4', active ? 'border-[#111412] dark:border-white' : 'border-transparent bg-neutral-50 dark:bg-white/5')}>
            {Icon && <Icon className="size-5 shrink-0" />}
            <span><span className={cn('block font-semibold', small && 'text-sm')}>{title}</span>{sub && <span className="text-muted-foreground block text-xs">{sub}</span>}</span>
        </button>
    );
}

function Toggle({ checked, onChange, icon: Icon, title, sub }: { checked: boolean; onChange: (v: boolean) => void; icon: typeof Bike; title: string; sub?: string }) {
    return (
        <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-center gap-4 rounded-2xl bg-neutral-50 p-4 text-left dark:bg-white/5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-white/10"><Icon className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>{sub && <span className="text-muted-foreground block text-xs">{sub}</span>}</span>
            <span className={cn('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-[#0b6e4f]' : 'bg-neutral-300 dark:bg-white/20')}><span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} /></span>
        </button>
    );
}

function Row({ l, v, free, green }: { l: React.ReactNode; v: number; free?: boolean; green?: boolean }) {
    return <div className="flex justify-between"><dt className="text-muted-foreground">{l}</dt><dd className={cn('tabular', green && 'font-semibold text-[#0b6e4f]')}>{free ? <span className="font-semibold text-[#0b6e4f]">Free</span> : v < 0 ? `−${zig(-v)}` : zig(v)}</dd></div>;
}


import { Button } from '@/components/ui/button';
import { Modal } from '@/components/z';
import { cart } from '@/lib/cart';
import { usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Item, type Money } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Bike, Clock, Minus, Plus, Star, Tag } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';

export interface StoreCardData {
    id: number;
    name: string;
    slug: string;
    cuisine: string | null;
    logo: string | null;
    cover: string | null;
    rating: number;
    eta_minutes: [number, number];
    delivery_fee: Money;
    min_order: Money;
    is_featured: boolean;
    has_offers: boolean;
    city: string;
    availability?: { is_open: boolean; reason: string | null; is_busy: boolean; power_out: boolean; next_open_at: string | null };
}

export type MenuItem = Item & {
    is_popular: boolean;
    dietary: string[];
    calories: number | null;
    vendor?: { id: number; name: string; slug: string };
    modifier_groups?: { id: number; name: string; min: number; max: number; required: boolean; options: { id: number; name: string; price_delta: Money }[] }[];
};

const GRADIENTS = ['from-[#0b6e4f] to-[#073e2c]', 'from-[#111412] to-[#2b302d]', 'from-[#c99412] to-[#8a6508]', 'from-[#c8102e] to-[#7a0a1c]'];

export function Cover({ src, seed = 0, className, children }: { src: string | null; seed?: number; className?: string; children?: ReactNode }) {
    return src ? (
        <div className={cn('relative overflow-hidden bg-neutral-100', className)}>
            <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
            {children}
        </div>
    ) : (
        <div className={cn('relative overflow-hidden bg-gradient-to-br', GRADIENTS[seed % GRADIENTS.length], className)}>
            <svg className="absolute -right-6 -bottom-6 size-40 text-white/10" viewBox="0 0 24 24" fill="currentColor"><path d="M3 11h18a9 9 0 0 1-18 0Zm9-8a1 1 0 0 1 1 1v1.06A7 7 0 0 1 19.93 10H4.07A7 7 0 0 1 11 5.06V4a1 1 0 0 1 1-1Z" /></svg>
            {children}
        </div>
    );
}

export function StoreCard({ s, compact = false }: { s: StoreCardData; compact?: boolean }) {
    const closed = s.availability && !s.availability.is_open;
    return (
        <Link href={`/store/${s.slug}`} className="group block">
            <Cover src={s.cover} seed={s.id} className={cn('rounded-2xl', compact ? 'aspect-[16/10]' : 'aspect-[16/9]')}>
                {closed && <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">{s.availability?.reason === 'paused' ? 'Paused' : 'Closed'}{s.availability?.next_open_at && ` · opens ${new Date(s.availability.next_open_at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}`}</div>}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    {s.has_offers && <span className="flex items-center gap-1 rounded-full bg-[#c8102e] px-2.5 py-1 text-[11px] font-bold text-white"><Tag className="size-3" />Offers</span>}
                    {s.delivery_fee.zig === 0 && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#111412]">Free delivery</span>}
                    {s.availability?.power_out && <span className="rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-black">⚡ Limited menu</span>}
                </div>
                {s.logo && <img src={s.logo} alt="" className="absolute bottom-3 left-3 size-11 rounded-xl border-2 border-white object-cover shadow" />}
            </Cover>
            <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate text-[16px] font-bold tracking-tight">{s.name}</h3>
                    <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[13px]">
                        <Bike className="size-3.5" />{s.delivery_fee.zig === 0 ? 'Free' : zig(s.delivery_fee.zig)}<span>·</span><Clock className="size-3.5" />{s.eta_minutes[0]}–{s.eta_minutes[1]} min
                    </p>
                </div>
                {s.rating > 0 && <span className="bg-muted flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold dark:bg-white/10"><Star className="size-3.5 fill-current" />{s.rating.toFixed(1)}</span>}
            </div>
        </Link>
    );
}

export function DishCard({ i, onClick, showStore = false }: { i: MenuItem; onClick: () => void; showStore?: boolean }) {
    const price = i.special_price?.zig ?? i.price.zig;
    return (
        <button onClick={onClick} disabled={!i.is_available} className="group flex w-full gap-4 rounded-2xl border p-4 text-left transition hover:border-[#111412]/25 hover:shadow-lg disabled:opacity-50 dark:hover:border-white/25">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <h4 className="font-bold tracking-tight">{i.name}</h4>
                    {i.is_popular && <span className="rounded bg-[#111412] px-1.5 py-0.5 text-[10px] font-bold text-white uppercase dark:bg-white dark:text-black">Popular</span>}
                </div>
                {showStore && i.vendor && <p className="text-muted-foreground text-xs">{i.vendor.name}</p>}
                {i.description && <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px] leading-relaxed">{i.description}</p>}
                <p className="mt-2 flex items-baseline gap-2">
                    <span className={cn('tabular font-bold', i.special_price && 'text-[#c8102e]')}>{zig(price)}</span>
                    {i.special_price && <span className="tabular text-muted-foreground text-[13px] line-through">{zig(i.price.zig)}</span>}
                    {!i.is_available && <span className="text-muted-foreground text-xs font-medium">Sold out</span>}
                </p>
                {i.dietary.length > 0 && <p className="text-muted-foreground mt-1 text-[11px] tracking-wide uppercase">{i.dietary.map((d) => d.replace('_', ' ')).join(' · ')}</p>}
            </div>
            <div className="relative shrink-0">
                {i.image ? <img src={i.image} alt="" loading="lazy" className="size-28 rounded-xl object-cover" /> : <div className="bg-muted size-28 rounded-xl dark:bg-white/5" />}
                <span className="absolute right-2 bottom-2 flex size-9 items-center justify-center rounded-full bg-white text-[#111412] shadow-md transition group-hover:scale-110"><Plus className="size-5" /></span>
            </div>
        </button>
    );
}

/** Item details with sizes, add-on groups (min/max), notes and quantity. Adds to the browser basket. */
export function ItemModal({ item, store, onClose }: { item: MenuItem; store: { id: number; name: string; slug: string; min_order: Money }; onClose: () => void }) {
    const { zigPerUsd } = usePage<{ zigPerUsd: number }>().props;
    const [variant, setVariant] = useState<string | null>(item.variants[0]?.name ?? null);
    const [mods, setMods] = useState<string[]>([]);
    const [qty, setQty] = useState(1);
    const [notes, setNotes] = useState('');
    const groups = item.modifier_groups ?? [];
    const base = item.special_price?.zig ?? item.price.zig;
    const unit = useMemo(
        () => base + (item.variants.find((v) => v.name === variant)?.price_delta_zig ?? 0) + mods.reduce((s, m) => s + (groups.flatMap((g) => g.options).find((o) => o.name === m)?.price_delta.zig ?? 0), 0),
        [base, variant, mods, item, groups],
    );
    const missing = groups.find((g) => g.options.filter((o) => mods.includes(o.name)).length < g.min);

    const toggle = (g: (typeof groups)[number], name: string) => {
        const names = g.options.map((o) => o.name);
        const picked = mods.filter((m) => names.includes(m));
        if (mods.includes(name)) setMods(mods.filter((m) => m !== name));
        else if (g.max === 1) setMods([...mods.filter((m) => !names.includes(m)), name]);
        else if (picked.length < g.max) setMods([...mods, name]);
    };

    const add = (replace = false) => {
        const ok = cart.add({ id: store.id, name: store.name, slug: store.slug, min_order_zig: store.min_order.zig }, { item_id: item.id, name: item.name, image: item.image, unit_zig: unit, variant, modifiers: mods, notes: notes || undefined }, qty, replace);
        if (!ok) {
            if (confirm(`Your basket has items from another store. Start a new basket from ${store.name}?`)) add(true);
            return;
        }
        toast.success(`${qty}× ${item.name} added`, { action: { label: 'View basket', onClick: () => window.dispatchEvent(new Event('zvino:open-cart')) } });
        onClose();
    };

    return (
        <Modal open onClose={onClose} size="md" title={item.name}
            footer={
                <div className="flex w-full items-center gap-3">
                    <div className="bg-muted flex items-center rounded-full dark:bg-white/10">
                        <button onClick={() => setQty(Math.max(1, qty - 1))} className="flex size-12 items-center justify-center" aria-label="Less"><Minus className="size-4" /></button>
                        <span className="tabular w-6 text-center font-bold">{qty}</span>
                        <button onClick={() => setQty(qty + 1)} className="flex size-12 items-center justify-center" aria-label="More"><Plus className="size-4" /></button>
                    </div>
                    <Button variant="dark" className="h-12 flex-1 rounded-full text-[15px]" disabled={!!missing} onClick={() => add()}>
                        {missing ? `Choose ${missing.name.toLowerCase()}` : `Add ${qty} · ${zig(unit * qty)}`}
                    </Button>
                </div>
            }>
            <div className="-mx-6 -mt-2 grid max-h-[60vh] gap-5 overflow-y-auto px-6">
                {item.image && <img src={item.image} alt="" className="aspect-[16/9] w-full rounded-xl object-cover" />}
                {item.description && <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>}
                <p className="tabular text-sm"><b>{zig(base)}</b> <span className="text-muted-foreground">· {usd(base / zigPerUsd)}</span>{item.calories && <span className="text-muted-foreground"> · {item.calories} kcal</span>}</p>
                {item.variants.length > 0 && (
                    <fieldset>
                        <legend className="mb-2 flex w-full items-center justify-between"><span className="font-bold">Size</span><span className="bg-muted rounded px-2 py-0.5 text-[11px] font-semibold">Required</span></legend>
                        <div className="grid gap-2">{item.variants.map((v) => <Choice key={v.name} active={variant === v.name} onClick={() => setVariant(v.name)} label={v.name} extra={v.price_delta_zig ? `+${zig(v.price_delta_zig)}` : ''} radio />)}</div>
                    </fieldset>
                )}
                {groups.map((g) => (
                    <fieldset key={g.id}>
                        <legend className="mb-2 flex w-full items-center justify-between">
                            <span><span className="font-bold">{g.name}</span><span className="text-muted-foreground ml-2 text-xs">{g.max === 1 ? 'Choose 1' : `Choose up to ${g.max}`}</span></span>
                            {g.required && <span className={cn('rounded px-2 py-0.5 text-[11px] font-semibold', missing?.id === g.id ? 'bg-[#c8102e] text-white' : 'bg-muted')}>Required</span>}
                        </legend>
                        <div className="grid gap-2">{g.options.map((o) => <Choice key={o.id} active={mods.includes(o.name)} onClick={() => toggle(g, o.name)} label={o.name} extra={o.price_delta.zig ? `+${zig(o.price_delta.zig)}` : ''} radio={g.max === 1} />)}</div>
                    </fieldset>
                ))}
                <fieldset>
                    <legend className="mb-2 font-bold">Special instructions</legend>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="e.g. no onions, extra spicy" className="bg-muted min-h-[72px] w-full rounded-xl p-3 text-sm outline-none dark:bg-white/5" />
                </fieldset>
            </div>
        </Modal>
    );
}

function Choice({ active, onClick, label, extra, radio }: { active: boolean; onClick: () => void; label: string; extra: string; radio?: boolean }) {
    return (
        <button type="button" onClick={onClick} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition', active ? 'border-[#111412] bg-[#111412]/[0.03] dark:border-white' : 'hover:border-[#111412]/30')}>
            <span className={cn('flex size-5 shrink-0 items-center justify-center border-2', radio ? 'rounded-full' : 'rounded-md', active ? 'border-[#111412] bg-[#111412] dark:border-white dark:bg-white' : 'border-neutral-300')}>{active && <span className={cn('bg-white dark:bg-black', radio ? 'size-2 rounded-full' : 'size-2.5 rounded-sm')} />}</span>
            <span className="flex-1 font-medium">{label}</span>
            {extra && <span className="tabular text-muted-foreground">{extra}</span>}
        </button>
    );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('mx-auto max-w-7xl px-4 md:px-6', className)}>
            <div className="mb-5 flex items-end justify-between gap-4">
                <h2 className="text-[22px] font-extrabold tracking-[-0.03em] md:text-[26px]">{title}</h2>
                {action}
            </div>
            {children}
        </section>
    );
}

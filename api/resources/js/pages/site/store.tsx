import { Button } from '@/components/ui/button';
import { Cover, DishCard, ItemModal, closedLabel, type MenuItem } from '@/components/site';
import { Modal } from '@/components/z';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { cart } from '@/lib/cart';
import { timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Money } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Bike, Clock, Heart, Info, MapPin, Search, Share2, Star, Users, Zap } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Props {
    seo: { title: string };
    store: {
        id: number; name: string; slug: string; cuisine: string | null; description: string | null; logo: string | null; cover: string | null; city: string; address: string | null;
        rating: number; rating_count: number; eta_minutes: [number, number]; delivery_fee: Money; min_order: Money; price_level: number; power_out: boolean;
        offers_delivery: boolean; offers_pickup: boolean; accepts_scheduled: boolean;
        availability: { is_open: boolean; reason: string | null; is_busy: boolean; prep_minutes: number; next_open_at: string | null };
        hours: { weekday: number; opens_at: string; closes_at: string }[];
        zone_fee: { base: number; free_km: number; per_km: number } | null;
        distance_km?: number | null;
    };
    menu: { id: number; name: string; items: MenuItem[] }[];
    popular: MenuItem[];
    reviews: { id: number; rating: number; comment: string; reply: string | null; author: string; at: string }[];
    isFavorite: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function StorePage({ seo, store: s, menu, popular, reviews, isFavorite, deals = [] }: Props & { deals?: { id: number; headline: string; live: boolean }[] }) {
    const { auth, flash } = usePage<SiteProps & { flash: { reorder?: { item_id: number; quantity: number; variant: string | null; modifiers: string[] }[] } }>().props;
    const [item, setItem] = useState<MenuItem | null>(null);
    const [q, setQ] = useState('');
    const [info, setInfo] = useState(false);
    const [active, setActive] = useState<number | null>(menu[0]?.id ?? null);
    const refs = useRef<Record<number, HTMLElement | null>>({});
    const storeRef = { id: s.id, name: s.name, slug: s.slug, min_order: s.min_order };
    const all = useMemo(() => menu.flatMap((c) => c.items), [menu]);
    const specials = useMemo(() => all.filter((i) => i.special_price && i.is_available).slice(0, 12), [all]);
    const closedText = closedLabel(s.availability as never);

    // "Order again" from account: refill the basket.
    useEffect(() => {
        if (!flash?.reorder?.length) return;
        flash.reorder.forEach((r) => {
            const it = all.find((i) => i.id === r.item_id);
            if (it?.is_available) cart.add({ id: s.id, name: s.name, slug: s.slug, min_order_zig: s.min_order.zig }, { item_id: it.id, name: it.name, image: it.image, unit_zig: it.special_price?.zig ?? it.price.zig, variant: r.variant, modifiers: r.modifiers ?? [] }, r.quantity, true);
        });
        toast.success('Your usual is in the basket', { action: { label: 'View', onClick: () => window.dispatchEvent(new Event('zvino:open-cart')) } });
    }, [flash?.reorder]);

    useEffect(() => {
        const obs = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.getAttribute('data-cat')))), { rootMargin: '-140px 0px -60% 0px' });
        Object.values(refs.current).forEach((el) => el && obs.observe(el));
        return () => obs.disconnect();
    }, [menu]);

    const filtered = q ? menu.map((c) => ({ ...c, items: c.items.filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(q.toLowerCase())) })).filter((c) => c.items.length) : menu;
    const closed = !s.availability.is_open;
    const today = new Date().getDay();

    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: s.name, url });
            else {
                await navigator.clipboard.writeText(url);
                toast.success('Link copied');
            }
        } catch {
            /* cancelled */
        }
    };

    return (
        <SiteLayout>
            <Head title={seo.title} />
            <div className="mx-auto max-w-7xl px-0 md:px-6 md:pt-6">
                <Cover src={s.cover} seed={s.id} className="aspect-[16/7] md:aspect-[16/5] md:rounded-3xl">
                    <div className={cn('absolute inset-0 bg-gradient-to-t from-black/50 to-transparent', closedText && 'bg-black/40')} />
                    {closedText && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#222222] bg-white px-5 py-2 text-[15px] whitespace-nowrap text-[#222222] shadow-lg"><b>{closedText.split(':')[0]}</b>{closedText.includes(':') ? `:${closedText.split(':').slice(1).join(':')}` : ''}</span>}
                    <div className="absolute top-4 right-4 flex gap-2">
                        <button onClick={share} className="flex size-10 items-center justify-center rounded-full bg-white/95 text-[#222222] shadow" aria-label="Share"><Share2 className="size-4" /></button>
                        {auth?.user && <button onClick={() => router.post(`/store/${s.id}/favorite`, {}, { preserveScroll: true })} className="flex size-10 items-center justify-center rounded-full bg-white/95 text-[#222222] shadow" aria-label="Favourite"><Heart className={cn('size-4', isFavorite && 'fill-[var(--color-zred)] text-zred')} /></button>}
                    </div>
                </Cover>
            </div>

            <div className="mx-auto max-w-7xl px-4 md:px-6">
                <div className="relative -mt-10 flex flex-wrap items-end gap-5 md:-mt-12">
                    {s.logo ? <img src={s.logo} alt="" className="size-20 rounded-2xl border-4 border-white object-cover shadow-lg md:size-24 dark:border-[#0c0e0d]" /> : <div className="flex size-20 items-center justify-center rounded-2xl border-4 border-white bg-[#222222] text-3xl font-extrabold text-white shadow-lg md:size-24 dark:border-[#0c0e0d]">{s.name[0]}</div>}
                </div>
                <div className="mt-4 grid gap-8 lg:grid-cols-[1fr_340px]">
                    <div className="min-w-0">
                        <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.04em] md:text-[40px]">{s.name}</h1>
                        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                            {s.rating_count > 0 && <span className="text-foreground flex items-center gap-1 font-bold"><Star className="size-4 fill-current" />{s.rating.toFixed(1)} <span className="text-muted-foreground font-normal">({s.rating_count}+)</span></span>}
                            <span>{s.cuisine}</span><span>·</span><span>{'$'.repeat(s.price_level)}</span><span>·</span><span>{s.distance_km != null ? `${s.distance_km} km away` : s.city}</span>
                            <button onClick={() => setInfo(true)} className="text-brand-700 dark:text-brand font-semibold hover:underline">More info</button>
                        </div>
                        {s.description && <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">{s.description}</p>}

                        <div className="mt-5 flex flex-wrap gap-2">
                            <Pill icon={Clock}>{s.eta_minutes[0]}–{s.eta_minutes[1]} min</Pill>
                            <Pill icon={Bike}>{s.delivery_fee.zig === 0 ? 'Free delivery' : s.zone_fee ? `From ${zig(s.zone_fee.base)} delivery` : `${zig(s.delivery_fee.zig)} delivery`}</Pill>
                            {s.min_order.zig > 0 && <Pill icon={Info}>{zig(s.min_order.zig)} minimum</Pill>}
                            {s.offers_pickup && <Pill icon={MapPin}>Pickup available</Pill>}
                            {auth?.user && <Pill icon={Users} onClick={() => router.post(`/store/${s.id}/group`, {})}>Group order</Pill>}
                        </div>

                        {deals.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-2">
                                {deals.map((d) => <span key={d.id} className={cn('rounded-full px-4 py-2 text-sm font-semibold', d.live ? 'bg-brand-50 text-brand-600' : 'bg-neutral-100 text-neutral-600 dark:bg-white/5')}>🏷️ {d.headline}{!d.live && ' · later today'}</span>)}
                            </div>
                        )}
                        {closed && <div className="mt-5 rounded-2xl bg-neutral-100 px-5 py-4 text-sm dark:bg-white/5"><b>Closed right now.</b> {s.availability.next_open_at ? `Opens ${new Date(s.availability.next_open_at).toLocaleString('en-ZW', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}.` : ''} {s.accepts_scheduled && 'You can still order and schedule delivery for later.'}</div>}
                        {s.availability.is_busy && !closed && <div className="mt-5 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900">This kitchen is busy, so orders are taking a little longer than usual.</div>}
                        {s.power_out && <div className="mt-5 flex items-center gap-2 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900"><Zap className="size-4" /> Load-shedding: some items are temporarily unavailable.</div>}

                        <div className="relative mt-6 sm:hidden"><Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${s.name}`} className="bg-muted h-12 w-full rounded-full pr-4 pl-11 text-[15px] outline-none dark:bg-white/10" /></div>

                        {/* Category nav */}
                        <nav className="sticky top-16 z-20 -mx-4 mt-8 border-b bg-white/95 px-4 backdrop-blur md:top-[72px] md:mx-0 md:px-0 dark:bg-[#0c0e0d]/95">
                            <div className="flex items-center gap-4">
                                <div className="scroll-quiet flex flex-1 gap-6 overflow-x-auto">
                                    {menu.map((c) => (
                                        <button key={c.id} onClick={() => refs.current[c.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className={cn('shrink-0 border-b-2 py-4 text-[15px] font-semibold transition', active === c.id ? 'border-[#222222] dark:border-white' : 'text-muted-foreground border-transparent')}>{c.name}</button>
                                    ))}
                                </div>
                                <div className="relative hidden sm:block"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${s.name}`} className="bg-muted h-10 w-52 rounded-full pr-3 pl-9 text-sm outline-none dark:bg-white/10" /></div>
                            </div>
                        </nav>

                        {popular.length > 0 && !q && (
                            <section className="mt-8">
                                <h2 className="mb-4 text-[22px] font-extrabold tracking-tight">Highlights</h2>
                                <div className="scroll-quiet -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                                    {popular.map((i) => (
                                        <button key={i.id} onClick={() => setItem(i)} className="group w-48 shrink-0 text-left">
                                            {i.image ? <img src={i.image} alt="" className="aspect-square w-full rounded-2xl object-cover" /> : <div className="bg-muted aspect-square w-full rounded-2xl dark:bg-white/5" />}
                                            <div className="mt-2 line-clamp-1 text-sm font-bold">{i.name}</div>
                                            <div className="tabular text-sm">{zig(i.special_price?.zig ?? i.price.zig)}{i.special_price && <span className="text-muted-foreground ml-1.5 text-xs line-through">{zig(i.price.zig)}</span>}</div>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {specials.length > 0 && !q && (
                            <section className="mt-10">
                                <h2 className="mb-4 text-[22px] font-extrabold tracking-tight">Specials 🔥</h2>
                                <div className="scroll-quiet -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                                    {specials.map((i) => (
                                        <button key={i.id} onClick={() => setItem(i)} className="group w-48 shrink-0 text-left">
                                            <span className="relative block">
                                                {i.image ? <img src={i.image} alt="" className="aspect-square w-full rounded-2xl object-cover" /> : <span className="bg-muted block aspect-square w-full rounded-2xl dark:bg-white/5" />}
                                                <span className="absolute top-2 left-2 rounded-full bg-[var(--color-zred)] px-2.5 py-1 text-[11px] font-bold text-white">Special</span>
                                            </span>
                                            <span className="mt-2 line-clamp-1 block text-sm font-bold">{i.name}</span>
                                            <span className="tabular text-zred block text-sm font-semibold">{zig(i.special_price!.zig)} <span className="text-muted-foreground ml-1 text-xs font-normal line-through">{zig(i.price.zig)}</span></span>
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {filtered.map((c) => (
                            <section key={c.id} ref={(el) => { refs.current[c.id] = el; }} data-cat={c.id} className="scroll-mt-36 pt-10">
                                <h2 className="mb-4 text-[22px] font-extrabold tracking-tight">{c.name}</h2>
                                <div className="grid gap-4 xl:grid-cols-2">{c.items.map((i) => <DishCard key={i.id} i={i} onClick={() => setItem(i)} />)}</div>
                            </section>
                        ))}
                        {filtered.length === 0 && <p className="text-muted-foreground py-16 text-center">No dishes match “{q}”.</p>}

                        {reviews.length > 0 && (
                            <section className="mt-16">
                                <h2 className="mb-4 text-[22px] font-extrabold tracking-tight">What people say</h2>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {reviews.map((r) => (
                                        <figure key={r.id} className="rounded-2xl border p-5">
                                            <div className="flex items-center justify-between"><span className="font-semibold">{r.author}</span><span className="flex">{Array.from({ length: 5 }, (_, k) => <Star key={k} className={cn('size-3.5', k < r.rating ? 'fill-[var(--color-gold)] text-gold' : 'text-neutral-300')} />)}</span></div>
                                            <blockquote className="mt-2 text-[15px] leading-relaxed">“{r.comment}”</blockquote>
                                            <figcaption className="text-muted-foreground mt-2 text-xs">{timeAgo(r.at)}</figcaption>
                                            {r.reply && <p className="bg-muted mt-3 rounded-lg px-3 py-2 text-sm dark:bg-white/5"><b>{s.name}:</b> {r.reply}</p>}
                                        </figure>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="hidden lg:block">
                        <div className="sticky top-28 grid gap-4">
                            <div className="rounded-2xl border p-5">
                                <h3 className="font-bold">Opening hours</h3>
                                <ul className="mt-3 grid gap-1.5 text-sm">
                                    {DAYS.map((d, i) => {
                                        const slots = s.hours.filter((h) => h.weekday === i);
                                        return <li key={d} className={cn('flex justify-between', i === today && 'font-bold')}><span>{d}</span><span className="tabular">{slots.length ? slots.map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`).join(', ') : 'Closed'}</span></li>;
                                    })}
                                </ul>
                            </div>
                            {s.address && <div className="rounded-2xl border p-5 text-sm"><h3 className="mb-1 font-bold">Address</h3><p className="text-muted-foreground">{s.address}, {s.city}</p></div>}
                            {s.zone_fee && <div className="rounded-2xl border p-5 text-sm"><h3 className="mb-1 font-bold">Delivery fee</h3><p className="text-muted-foreground">{zig(s.zone_fee.base)} for the first {s.zone_fee.free_km} km, then {zig(s.zone_fee.per_km)} per km. Zvino+ members get free delivery.</p><Link href="/plus" className="mt-2 inline-block font-semibold hover:underline">Learn about Zvino+ →</Link></div>}
                            {!auth?.user && <Button variant="dark" className="h-12 rounded-full" asChild><Link href="/signin">Sign in to save favourites</Link></Button>}
                        </div>
                    </aside>
                </div>
            </div>
            {item && <ItemModal item={item} store={storeRef} onClose={() => setItem(null)} />}
            <Modal open={info} onClose={() => setInfo(false)} title={s.name} description={[s.cuisine, s.address && `${s.address}, ${s.city}`].filter(Boolean).join(' · ')} footer={<Button onClick={() => setInfo(false)}>Close</Button>}>
                <div className="grid max-h-[60vh] gap-4 overflow-y-auto text-sm">
                    {s.description && <p className="text-muted-foreground leading-relaxed">{s.description}</p>}
                    <div>
                        <h3 className="mb-2 font-bold">Opening hours</h3>
                        <ul className="grid gap-1.5">
                            {DAYS.map((d, i) => {
                                const slots = s.hours.filter((h) => h.weekday === i);
                                return <li key={d} className={cn('flex justify-between', i === today && 'font-bold')}><span>{d}</span><span className="tabular">{slots.length ? slots.map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`).join(', ') : 'Closed'}</span></li>;
                            })}
                        </ul>
                    </div>
                    {s.zone_fee && <p className="text-muted-foreground">Delivery: {zig(s.zone_fee.base)} for the first {s.zone_fee.free_km} km, then {zig(s.zone_fee.per_km)} per km.</p>}
                    {s.min_order.zig > 0 && <p className="text-muted-foreground">Minimum order {zig(s.min_order.zig)}.</p>}
                </div>
            </Modal>
        </SiteLayout>
    );
}

function Pill({ icon: Icon, children, onClick }: { icon: typeof Clock; children: React.ReactNode; onClick?: () => void }) {
    const C = onClick ? 'button' : 'span';
    return <C onClick={onClick} className={cn('bg-muted inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium dark:bg-white/10', onClick && 'hover:bg-neutral-200')}><Icon className="size-4" />{children}</C>;
}

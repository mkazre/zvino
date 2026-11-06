import { Cover, DishCard, StoreCard, type MenuItem, type StoreCardData } from '@/components/site';
import { StoreBadges } from '@/components/store-badges';
import { Button } from '@/components/ui/button';
import { type SiteProps } from '@/layouts/site-layout';
import { type Payload } from '@/lib/blocks';
import { cn } from '@/lib/utils';
import { Link, router, usePage } from '@inertiajs/react';
import {
    ArrowRight, Bike, Check, ChevronLeft, ChevronRight, Clock, Copy, CreditCard, Flame, Gift, Heart, Home, Leaf, MapPin, MessageCircle, Package, Percent, Search, ShieldCheck,
    Smartphone, Sparkles, Star, Store, Truck, Users, UtensilsCrossed, Wallet, Zap, type LucideIcon,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';

export interface HomeBlockData {
    id: number;
    type: string;
    title: string | null;
    subtitle: string | null;
    cta_label: string | null;
    link_to: string | null;
    payload: Payload | null;
    data?: unknown;
}

export const ICONS: Record<string, LucideIcon> = {
    bike: Bike, 'map-pin': MapPin, smartphone: Smartphone, wallet: Wallet, clock: Clock, shield: ShieldCheck, star: Star, gift: Gift, utensils: UtensilsCrossed, store: Store,
    truck: Truck, heart: Heart, zap: Zap, leaf: Leaf, percent: Percent, chat: MessageCircle, search: Search, package: Package, users: Users, sparkles: Sparkles, flame: Flame,
    check: Check, card: CreditCard, home: Home,
};

/** App-style links ("specials", "vendor/12", "rewards") and site paths → website URLs. */
export const linkFor = (to: string | null | undefined) =>
    !to ? '/stores' : /^https?:\/\//.test(to) ? to : to.startsWith('vendor/') ? '/stores' : to === 'rewards' ? '/account?tab=wallet' : to === 'specials' ? '/stores?offers=1' : to.startsWith('/') ? to : `/${to}`;

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const num = (v: unknown, d: number) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !isNaN(Number(v)) ? Number(v) : d);
const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

const hexA = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
    return `#${full}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;
};

/** Overlay CSS from ov_* keys (also used by the builder preview). */
export function overlayCss(p: Payload): string | null {
    const type = str(p.ov_type, 'none');
    if (type === 'none') return null;
    const from = str(p.ov_from, '#000000');
    const to = str(p.ov_to, from);
    const o = num(p.ov_opacity, 0.55);
    if (type === 'solid') return hexA(from, o);
    const dir = str(p.ov_direction, 'to_top');
    if (dir === 'radial') return `radial-gradient(ellipse at center, ${hexA(from, o * 0.2)} 0%, ${hexA(to, o)} 100%)`;
    const css = { to_top: 'to top', to_bottom: 'to bottom', to_right: 'to right', to_left: 'to left', diagonal: '135deg' }[dir] ?? 'to top';
    return `linear-gradient(${css}, ${hexA(from, o)} 0%, ${hexA(to, o * 0.35)} 60%, ${hexA(to, 0)} 100%)`;
}

export function backgroundCss(p: Payload): CSSProperties {
    switch (str(p.bg_type, 'none')) {
        case 'color':
            return { backgroundColor: str(p.bg_color, '#F7F7F5') };
        case 'gradient':
            return { backgroundImage: `linear-gradient(${num(p.bg_angle, 135)}deg, ${str(p.bg_from, '#17C74A')}, ${str(p.bg_to, '#108B34')})` };
        case 'image':
            return p.bg_image ? { backgroundColor: str(p.bg_color, '#1c1c1c'), backgroundImage: `url("${str(p.bg_image)}")`, backgroundSize: 'cover', backgroundPosition: str(p.bg_position, 'center') } : { backgroundColor: str(p.bg_color, '#1c1c1c') };
        default:
            return {};
    }
}

const hasBg = (p: Payload) => ['color', 'gradient', 'image'].includes(str(p.bg_type));
const toneClass = (p: Payload, fallback: 'light' | 'dark' | 'inherit' = 'inherit') => {
    const t = str(p.text_tone, 'auto');
    const eff = t === 'auto' ? (p.bg_type === 'image' ? 'light' : fallback) : t;
    return eff === 'light' ? 'text-white' : eff === 'dark' ? 'text-[#222222]' : '';
};
const PAD_OUT = { none: 'mt-0', sm: 'mt-6', md: 'mt-14', lg: 'mt-24' } as const;
const PAD_IN = { none: 'p-0', sm: 'p-5 md:p-6', md: 'p-7 md:p-12', lg: 'p-10 md:p-20' } as const;
const RADIUS = { none: 'rounded-none', md: 'rounded-2xl', xl: 'rounded-[28px]' } as const;

/** Wraps a block: spacing, width, background, overlay, text colour, alignment and device visibility. */
function Shell({ p, children, className, inner }: { p: Payload; children: ReactNode; className?: string; inner?: string }) {
    const pad = (str(p.pad, 'md') as keyof typeof PAD_OUT) in PAD_OUT ? (str(p.pad, 'md') as keyof typeof PAD_OUT) : 'md';
    const full = p.width === 'full';
    const bg = hasBg(p);
    const overlay = p.bg_type === 'image' ? overlayCss(p) : null;
    const radius = full ? 'rounded-none' : RADIUS[(str(p.radius, 'xl') as keyof typeof RADIUS)] ?? RADIUS.xl;
    const hide = p.hide_on === 'mobile' ? 'hidden md:block' : p.hide_on === 'desktop' ? 'md:hidden' : '';
    const style: CSSProperties = { ...backgroundCss(p), ...(p.text_tone === 'custom' && p.text_color ? { color: str(p.text_color) } : {}) };
    const body = <div className={cn('relative', p.align === 'center' && 'text-center', inner)}>{children}</div>;

    if (!bg) return <section className={cn(PAD_OUT[pad], hide, 'mx-auto max-w-7xl px-4 md:px-6', className)} style={style}>{body}</section>;
    const box = (
        <div className={cn('relative overflow-hidden', radius, PAD_IN[pad === 'none' ? 'sm' : pad], toneClass(p))} style={style}>
            {overlay && <div className="pointer-events-none absolute inset-0" style={{ background: overlay }} />}
            {full ? <div className="mx-auto max-w-7xl px-4 md:px-6">{body}</div> : body}
        </div>
    );
    return <section className={cn(PAD_OUT[pad], hide, !full && 'mx-auto max-w-7xl px-4 md:px-6', className)}>{box}</section>;
}

function Heading({ b, dark = false }: { b: HomeBlockData; dark?: boolean }) {
    if (!b.title && !b.subtitle && !b.cta_label) return null;
    const center = b.payload?.align === 'center';
    return (
        <div className={cn('mb-5 flex gap-4', center ? 'flex-col items-center' : 'items-end justify-between')}>
            <div className="min-w-0">
                {b.title && <h2 className="text-[22px] font-extrabold tracking-[-0.03em] md:text-[26px]">{b.title}</h2>}
                {b.subtitle && <p className={cn('mt-1 max-w-2xl text-[15px]', dark ? 'text-white/70' : 'opacity-70', center && 'mx-auto')}>{b.subtitle}</p>}
            </div>
            {b.cta_label && <Link href={linkFor(b.link_to)} className="flex shrink-0 items-center gap-1 text-sm font-semibold hover:underline">{b.cta_label} <ArrowRight className="size-4" /></Link>}
        </div>
    );
}

const gridCols = (n: unknown, max = 4) => {
    const c = Math.min(max, Math.max(2, num(n, 3)));
    return { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5', 6: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6' }[c];
};

function Rail({ children }: { children: ReactNode }) {
    return <div className="scroll-quiet -mx-4 flex snap-x scroll-px-4 gap-5 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0 [&>*]:w-[78%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-[45%] lg:[&>*]:w-[calc(25%-15px)]">{children}</div>;
}

function Stores({ b, stores }: { b: HomeBlockData; stores: StoreCardData[] }) {
    const p = b.payload ?? {};
    if (!stores.length) return null;
    return (
        <Shell p={p}>
            <Heading b={b} dark={toneClass(p) === 'text-white'} />
            {p.layout === 'rail' ? <Rail>{stores.map((s) => <StoreCard key={s.id} s={s} compact />)}</Rail> : <div className={cn('grid gap-x-5 gap-y-8', gridCols(p.columns))}>{stores.map((s) => <StoreCard key={s.id} s={s} compact={num(p.columns, 4) >= 4} />)}</div>}
        </Shell>
    );
}

function Dishes({ b, items, onItem }: { b: HomeBlockData; items: MenuItem[]; onItem: (i: MenuItem) => void }) {
    const p = b.payload ?? {};
    if (!items.length) return null;
    return (
        <Shell p={p}>
            <Heading b={b} dark={toneClass(p) === 'text-white'} />
            {p.layout === 'rail' ? <Rail>{items.map((i) => <DishCard key={i.id} i={i} showStore onClick={() => onItem(i)} />)}</Rail> : <div className={cn('grid gap-4', gridCols(p.columns, 3))}>{items.map((i) => <DishCard key={i.id} i={i} showStore onClick={() => onItem(i)} />)}</div>}
        </Shell>
    );
}

function CtaButton({ label, href, styleName = 'brand', className }: { label: string; href: string; styleName?: string; className?: string }) {
    const ext = /^https?:/.test(href);
    const cls = cn('h-12 rounded-full px-6 text-[15px]', styleName === 'dark' && 'bg-[#1c1c1c] text-white hover:bg-black', styleName === 'light' && 'bg-white text-[#222222] hover:bg-white/90', className);
    return <Button asChild className={cls}>{ext ? <a href={href} target="_blank" rel="noreferrer">{label} <ArrowRight /></a> : <Link href={href}>{label} <ArrowRight /></Link>}</Button>;
}

function Hero({ b }: { b: HomeBlockData }) {
    const { site } = usePage<SiteProps>().props;
    const p = b.payload ?? {};
    const data = (b.data ?? {}) as { stores?: StoreCardData[]; stats?: { stores: number } };
    const [q, setQ] = useState('');
    // Older heroes only had payload.background (the app colour): treat as the classic dark look.
    const type = str(p.bg_type, 'default');
    const bgStyle: CSSProperties = type === 'default' ? { backgroundColor: str(p.background, '#1c1c1c') } : backgroundCss(p);
    const overlay = type === 'image' || type === 'default' ? overlayCss(p) : null;
    const light = toneClass({ ...p, text_tone: p.text_tone ?? 'light' }, 'light') !== 'text-[#222222]';
    const minH = { '60': 'md:min-h-[60vh]', '80': 'md:min-h-[80vh]', '100': 'min-h-[100svh]' }[str(p.min_height, 'auto')] ?? '';
    const cards = p.show_store_cards !== false ? (data.stores ?? []).slice(0, 4) : [];
    const center = p.align === 'center';

    return (
        <section className={cn('relative -mt-[112px] overflow-hidden pt-[112px] md:-mt-[72px] md:pt-[72px]', light ? 'text-white' : 'text-[#222222]', minH, p.hide_on === 'mobile' && 'hidden md:block', p.hide_on === 'desktop' && 'md:hidden')} style={{ ...bgStyle, ...(p.text_tone === 'custom' && p.text_color ? { color: str(p.text_color) } : {}) }}>
            {type === 'default' && !p.bg_image && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(23,199,74,0.32),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(253,229,0,0.16),transparent_55%)]" />}
            {overlay && <div className="pointer-events-none absolute inset-0" style={{ background: overlay }} />}
            <div className={cn('relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:px-6 md:py-24', cards.length && !center ? 'md:grid-cols-[1.1fr_1fr]' : '', center && 'text-center')}>
                <div className={cn(center && 'mx-auto max-w-3xl')}>
                    <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur', light ? 'bg-white/10' : 'bg-black/5')}><span className="bg-brand size-1.5 rounded-full" />{str(p.eyebrow) || `Now delivering in ${site.cities.join(' & ')}`}</span>
                    <h1 className="mt-5 text-[44px] leading-[1.02] font-extrabold tracking-[-0.045em] md:text-[68px]">{b.title ?? 'Your favourite food,'}{str(p.accent_text) && <><br /><span className="text-brand">{str(p.accent_text)}</span></>}</h1>
                    {b.subtitle && <p className={cn('mt-5 max-w-md text-lg', light ? 'text-white/75' : 'text-[#222222]/70', center && 'mx-auto')}>{b.subtitle}</p>}
                    {p.show_search !== false && site.platform_mode === 'marketplace' && (
                        <form onSubmit={(e) => { e.preventDefault(); router.get('/stores', { q, city: site.city ?? undefined }); }} className={cn('mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-lg sm:flex-row', center && 'mx-auto')}>
                            <div className="flex flex-1 items-center gap-3 px-3 text-[#222222]">
                                <Search className="size-5 text-neutral-400" />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sadza, pizza, braai, groceries…" className="h-12 w-full bg-transparent text-[15px] outline-none" aria-label="Search food" />
                            </div>
                            <select value={site.city ?? ''} onChange={(e) => router.post('/city', { city: e.target.value }, { preserveScroll: true })} className="h-12 rounded-xl bg-neutral-100 px-3 text-sm font-medium text-[#222222] outline-none" aria-label="City">
                                <option value="" disabled>City</option>
                                {site.cities.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            <Button type="submit" className="h-12 rounded-xl px-6 text-[15px]">Find food</Button>
                        </form>
                    )}
                    {b.cta_label && <div className={cn('mt-6', center && 'flex justify-center')}><CtaButton label={b.cta_label} href={linkFor(b.link_to)} /></div>}
                    {p.show_stats !== false && (
                        <div className={cn('mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm', light ? 'text-white/65' : 'text-[#222222]/60', center && 'justify-center')}>
                            {data.stats && <span className="flex items-center gap-1.5"><Store className="size-4" /> {data.stats.stores}+ stores</span>}
                            <span className="flex items-center gap-1.5"><Wallet className="size-4" /> EcoCash · InnBucks · Card · Cash</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Prices in ZiG & USD</span>
                        </div>
                    )}
                </div>
                {cards.length > 0 && !center && (
                    <div className="relative hidden md:block">
                        <div className="absolute top-6 right-0 grid w-[88%] grid-cols-2 gap-4">
                            {cards.map((s, i) => (
                                <Link key={s.id} href={`/store/${s.slug}`} className={cn('group overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur', i % 2 && 'mt-10')}>
                                    <Cover src={s.cover} seed={s.id} className="aspect-[4/3]" />
                                    <div className="p-3"><div className="truncate text-sm font-bold">{s.name}</div><div className="text-xs opacity-60">{s.cuisine} · {s.eta_minutes[0]}–{s.eta_minutes[1]} min</div></div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}

function ImageBanner({ b }: { b: HomeBlockData }) {
    const p = { ...b.payload };
    const h = { sm: 'min-h-[220px]', md: 'min-h-[320px] md:min-h-[380px]', lg: 'min-h-[420px] md:min-h-[520px]' }[str(p.height, 'md')] ?? 'min-h-[320px]';
    const pos = str(p.content_pos, 'left');
    return (
        <Shell p={{ ...p, pad: p.pad ?? 'md' }} inner={cn('flex', h, pos === 'center' ? 'items-center justify-center text-center' : pos === 'bottom' ? 'items-end' : 'items-center')}>
            <div className={cn('max-w-xl', pos === 'center' && 'mx-auto')}>
                {b.title && <h2 className="text-[30px] leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[44px]">{b.title}</h2>}
                {b.subtitle && <p className="mt-3 text-lg opacity-80">{b.subtitle}</p>}
                {b.cta_label && <CtaButton className="mt-6" label={b.cta_label} href={linkFor(b.link_to)} />}
            </div>
        </Shell>
    );
}

function Carousel({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const slides = list<{ image?: string; title?: string; subtitle?: string; cta_label?: string; link?: string }>(p.slides);
    const [i, setI] = useState(0);
    const interval = num(p.interval, 5);
    useEffect(() => {
        if (!interval || slides.length < 2) return;
        const t = setInterval(() => setI((x) => (x + 1) % slides.length), interval * 1000);
        return () => clearInterval(t);
    }, [interval, slides.length]);
    if (!slides.length) return null;
    const h = { sm: 'h-[220px]', md: 'h-[300px] md:h-[380px]', lg: 'h-[380px] md:h-[500px]' }[str(p.height, 'md')] ?? 'h-[300px]';
    const radius = p.width === 'full' ? '' : (RADIUS[str(p.radius, 'xl') as keyof typeof RADIUS] ?? RADIUS.xl);
    return (
        <Shell p={{ ...p, bg_type: 'none' }} className={p.width === 'full' ? 'max-w-none px-0 md:px-0' : ''}>
            <div className={cn('relative overflow-hidden bg-[#1c1c1c] text-white', h, radius)}>
                {slides.map((s, k) => (
                    <div key={k} className={cn('absolute inset-0 transition-opacity duration-700', k === i ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={k !== i}>
                        {s.image ? <img src={s.image} alt="" className="absolute inset-0 size-full object-cover" loading={k ? 'lazy' : 'eager'} /> : <div className="from-brand absolute inset-0 bg-gradient-to-br to-[#073e2c]" />}
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, rgba(0,0,0,${num(p.overlay_strength, 0.45)}), rgba(0,0,0,${num(p.overlay_strength, 0.45) * 0.2}))` }} />
                        <div className={cn('relative flex h-full max-w-xl flex-col justify-center p-7 md:p-12', p.align === 'center' && 'mx-auto items-center text-center')}>
                            {s.title && <h2 className="text-[28px] leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[42px]">{s.title}</h2>}
                            {s.subtitle && <p className="mt-2 text-lg text-white/80">{s.subtitle}</p>}
                            {s.cta_label && <CtaButton className="mt-5" label={s.cta_label} href={linkFor(s.link)} />}
                        </div>
                    </div>
                ))}
                {slides.length > 1 && (
                    <>
                        <button type="button" aria-label="Previous slide" onClick={() => setI((i - 1 + slides.length) % slides.length)} className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 backdrop-blur hover:bg-white/35 md:flex"><ChevronLeft className="size-5" /></button>
                        <button type="button" aria-label="Next slide" onClick={() => setI((i + 1) % slides.length)} className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 backdrop-blur hover:bg-white/35 md:flex"><ChevronRight className="size-5" /></button>
                        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">{slides.map((_, k) => <button key={k} type="button" aria-label={`Slide ${k + 1}`} onClick={() => setI(k)} className={cn('h-1.5 rounded-full transition-all', k === i ? 'bg-brand w-6' : 'w-1.5 bg-white/60')} />)}</div>
                    </>
                )}
            </div>
        </Shell>
    );
}

function PromoGrid({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const tiles = list<{ title?: string; subtitle?: string; cta_label?: string; link?: string; image?: string; color?: string; tone?: string }>(p.tiles);
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className={cn('grid gap-4', gridCols(p.columns))}>
                {tiles.map((t, k) => (
                    <Link key={k} href={linkFor(t.link)} className={cn('group relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-3xl p-7 md:p-8', t.tone === 'dark' ? 'text-[#222222]' : 'text-white')} style={{ backgroundColor: t.color || '#222222' }}>
                        {t.image && <><img src={t.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/0" /></>}
                        <div className={cn('relative', t.image && 'text-white')}>
                            {t.title && <h3 className="text-[26px] leading-tight font-extrabold tracking-tight md:text-3xl">{t.title}</h3>}
                            {t.subtitle && <p className="mt-2 max-w-sm opacity-75">{t.subtitle}</p>}
                            {t.cta_label && <span className="mt-5 inline-flex items-center gap-1.5 font-semibold">{t.cta_label} <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>}
                        </div>
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

function CuisineTiles({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const tiles = list<{ label?: string; image?: string; query?: string }>(p.tiles);
    const shape = str(p.shape, 'square');
    const cols = { '3': 'grid-cols-3', '4': 'grid-cols-2 sm:grid-cols-4', '5': 'grid-cols-3 sm:grid-cols-5', '6': 'grid-cols-3 sm:grid-cols-6' }[str(p.columns, '4')] ?? 'grid-cols-2 sm:grid-cols-4';
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className={cn('grid gap-3 md:gap-4', cols)}>
                {tiles.map((t, k) => (
                    <Link key={k} href={`/stores?q=${encodeURIComponent(t.query || t.label || '')}`} className={cn('group flex flex-col gap-2', shape === 'circle' && 'items-center')}>
                        <Cover src={t.image ?? null} seed={k} className={cn(shape === 'circle' ? 'aspect-square w-full max-w-[140px] rounded-full' : shape === 'wide' ? 'aspect-[16/10] rounded-2xl' : 'aspect-square rounded-2xl')}>
                            {shape !== 'circle' && <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent p-3"><span className="text-[15px] font-bold text-white">{t.label}</span></div>}
                        </Cover>
                        {shape === 'circle' && <span className="text-sm font-semibold">{t.label}</span>}
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

function Countdown({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const end = p.ends_at_deal ? new Date(str(p.ends_at_deal)).getTime() : 0;
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);
    const left = Math.max(0, end - now);
    if (end && !left && p.hide_when_over) return null;
    const parts = [Math.floor(left / 86400000), Math.floor((left / 3600000) % 24), Math.floor((left / 60000) % 60), Math.floor((left / 1000) % 60)];
    return (
        <Shell p={{ bg_type: 'color', bg_color: '#DF302D', text_tone: 'light', ...p }} inner="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
                {b.title && <h2 className="text-[26px] leading-tight font-extrabold tracking-tight md:text-[34px]">{b.title}</h2>}
                {b.subtitle && <p className="mt-1 opacity-80">{end && !left ? str(p.over_text, 'This deal has ended.') : b.subtitle}</p>}
            </div>
            <div className={cn('flex flex-wrap items-center gap-4', p.align === 'center' && 'justify-center')}>
                {end > 0 && left > 0 && (
                    <div className="flex gap-2" aria-label="Time left">
                        {parts.map((v, k) => (k === 0 && v === 0 ? null : <div key={k} className="min-w-16 rounded-2xl bg-black/20 px-3 py-2 text-center"><div className="tabular text-2xl font-extrabold">{String(v).padStart(2, '0')}</div><div className="text-[10px] font-semibold tracking-wide uppercase opacity-70">{['days', 'hrs', 'min', 'sec'][k]}</div></div>))}
                    </div>
                )}
                {b.cta_label && (!end || left > 0) && <CtaButton label={b.cta_label} href={linkFor(b.link_to)} styleName="light" />}
            </div>
        </Shell>
    );
}

function PromoCode({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const code = str(p.code);
    const [copied, setCopied] = useState(false);
    return (
        <Shell p={{ bg_type: 'color', bg_color: '#FFFBD9', text_tone: 'dark', ...p }} inner="flex flex-col gap-5 md:flex-row md:items-center">
            {str(p.badge) && <div className="flex size-24 shrink-0 items-center justify-center rounded-full border-4 border-dashed border-current text-center text-lg leading-tight font-extrabold">{str(p.badge)}</div>}
            <div className="min-w-0 flex-1">
                {b.title && <h2 className="text-[24px] leading-tight font-extrabold tracking-tight md:text-[30px]">{b.title}</h2>}
                {b.subtitle && <p className="mt-1 opacity-75">{b.subtitle}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {code && (
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); toast.success(`Code ${code} copied`); }} className="flex h-12 items-center gap-2 rounded-full border-2 border-dashed border-current px-5 font-mono text-lg font-bold tracking-wider">
                        {code} {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </button>
                )}
                {b.cta_label && <CtaButton label={b.cta_label} href={linkFor(b.link_to)} styleName="dark" />}
            </div>
        </Shell>
    );
}

function AppDownload({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const points = str(p.points).split('\n').map((s) => s.trim()).filter(Boolean);
    return (
        <Shell p={{ bg_type: 'color', bg_color: '#1C1C1C', text_tone: 'light', ...p }} inner={cn('grid items-center gap-8', p.image && 'md:grid-cols-[1.2fr_1fr]')}>
            <div className={cn(p.align === 'center' && 'mx-auto')}>
                {b.title && <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.03em] md:text-[38px]">{b.title}</h2>}
                {b.subtitle && <p className="mt-2 max-w-lg opacity-75">{b.subtitle}</p>}
                {points.length > 0 && <ul className={cn('mt-5 grid gap-2', p.align === 'center' && 'justify-center')}>{points.map((x) => <li key={x} className="flex items-center gap-2"><Check className="text-brand size-4 shrink-0" />{x}</li>)}</ul>}
                <StoreBadges className={cn('mt-6', p.align === 'center' && 'justify-center')} />
            </div>
            {str(p.image) && <img src={str(p.image)} alt="" loading="lazy" className="mx-auto max-h-[420px] w-auto object-contain" />}
        </Shell>
    );
}

function IconCards({ b, items, numbered = false, card = 'filled' }: { b: HomeBlockData; items: { icon?: string; title?: string; text?: string }[]; numbered?: boolean; card?: string }) {
    const p = b.payload ?? {};
    const dark = toneClass(p) === 'text-white';
    return (
        <Shell p={p}>
            <Heading b={b} dark={dark} />
            <div className={cn('grid gap-4', gridCols(p.columns))}>
                {items.map((s, k) => {
                    const I = ICONS[s.icon ?? ''] ?? Sparkles;
                    return (
                        <div key={k} className={cn('rounded-3xl p-7', card === 'border' && 'border', card === 'filled' && (dark ? 'bg-white/10' : 'bg-muted dark:bg-white/5'), card === 'plain' && 'p-2', p.align === 'center' && 'text-center')}>
                            <span className={cn('relative inline-flex size-12 items-center justify-center rounded-2xl shadow-sm', dark ? 'bg-white/15' : 'bg-white dark:bg-white/10')}>
                                <I className="size-6" />
                                {numbered && <span className="bg-brand absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold text-black">{k + 1}</span>}
                            </span>
                            {s.title && <h3 className="mt-5 text-lg font-bold tracking-tight">{s.title}</h3>}
                            {s.text && <p className={cn('mt-1.5 text-[15px] leading-relaxed', dark ? 'text-white/70' : 'text-muted-foreground')}>{s.text}</p>}
                        </div>
                    );
                })}
            </div>
        </Shell>
    );
}

function Testimonials({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const quotes = list<{ quote?: string; name?: string; role?: string; rating?: number; avatar?: string }>(p.quotes);
    const dark = toneClass(p) === 'text-white';
    const cards = quotes.map((q, k) => (
        <figure key={k} className={cn('flex h-full flex-col rounded-3xl p-6', dark ? 'bg-white/10' : 'border bg-white dark:bg-white/5')}>
            {num(q.rating, 0) > 0 && <div className="text-gold flex gap-0.5">{Array.from({ length: num(q.rating, 0) }, (_, i) => <Star key={i} className="size-4 fill-current" />)}</div>}
            <blockquote className="mt-3 flex-1 text-[15px] leading-relaxed">“{q.quote}”</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
                {q.avatar ? <img src={q.avatar} alt="" className="size-10 rounded-full object-cover" /> : <span className="bg-brand/20 flex size-10 items-center justify-center rounded-full font-bold">{(q.name ?? '?').charAt(0)}</span>}
                <span><span className="block text-sm font-bold">{q.name}</span>{q.role && <span className={cn('block text-xs', dark ? 'text-white/60' : 'text-muted-foreground')}>{q.role}</span>}</span>
            </figcaption>
        </figure>
    ));
    return (
        <Shell p={p}>
            <Heading b={b} dark={dark} />
            {p.layout === 'rail' ? <Rail>{cards}</Rail> : <div className={cn('grid gap-4', gridCols(p.columns, 3))}>{cards}</div>}
        </Shell>
    );
}

function Stats({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const d = (b.data ?? {}) as Record<string, number>;
    const items = list<{ value?: string; label?: string }>(p.items);
    const fill = (s = '') => s.replace(/\{(\w+)\}/g, (_, k) => (d[k] !== undefined ? String(d[k]) : ''));
    return (
        <Shell p={{ bg_type: 'color', bg_color: '#F7F7F5', ...p }}>
            {b.title && <h2 className={cn('mb-6 text-[22px] font-extrabold tracking-[-0.03em] md:text-[26px]', p.align === 'center' && 'text-center')}>{b.title}</h2>}
            <div className={cn('grid grid-cols-2 gap-6', items.length >= 4 ? 'md:grid-cols-4' : items.length === 3 ? 'md:grid-cols-3' : '', p.align === 'center' && 'text-center')}>
                {items.map((s, k) => <div key={k}><div className="tabular text-[34px] leading-none font-extrabold tracking-[-0.04em] md:text-[44px]">{fill(s.value)}</div><div className="mt-2 text-sm opacity-70">{s.label}</div></div>)}
            </div>
        </Shell>
    );
}

function Faq({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const items = list<{ q?: string; a?: string }>(p.items);
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className={cn('divide-y rounded-3xl border', p.align === 'center' && 'mx-auto max-w-3xl text-left')}>
                {items.map((f, k) => (
                    <details key={k} open={k === 0 && !!p.open_first} className="group px-5 py-4 md:px-6">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold"><span>{f.q}</span><ChevronRight className="size-4 shrink-0 transition group-open:rotate-90" /></summary>
                        <p className="text-muted-foreground mt-2 text-[15px] leading-relaxed whitespace-pre-line">{f.a}</p>
                    </details>
                ))}
            </div>
        </Shell>
    );
}

function embedUrl(url: string): { kind: 'iframe' | 'video'; src: string } | null {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` };
    const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vm[1]}` };
    if (/^(https?:\/\/|\/)\S+\.(mp4|webm)(\?.*)?$/i.test(url)) return { kind: 'video', src: url };
    return null;
}

function VideoBlock({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const v = embedUrl(str(p.url));
    if (!v) return null;
    const radius = RADIUS[str(p.radius, 'xl') as keyof typeof RADIUS] ?? RADIUS.xl;
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className={cn('overflow-hidden bg-black', radius, str(p.aspect) === '9/16' && 'mx-auto max-w-sm')} style={{ aspectRatio: str(p.aspect, '16/9') }}>
                {v.kind === 'iframe' ? (
                    <iframe src={v.src} title={b.title ?? 'Video'} className="size-full" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen />
                ) : (
                    <video src={v.src} poster={str(p.poster) || undefined} controls={!p.autoplay} autoPlay={!!p.autoplay} muted={!!p.autoplay} loop={!!p.autoplay} playsInline className="size-full object-cover" />
                )}
            </div>
        </Shell>
    );
}

function CtaBand({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const center = p.align !== 'left';
    return (
        <Shell p={{ bg_type: 'gradient', bg_from: '#17C74A', bg_to: '#108B34', text_tone: 'dark', ...p }} inner={cn('flex flex-col gap-5', center ? 'items-center text-center' : 'md:flex-row md:items-center md:justify-between')}>
            <div>
                {b.title && <h2 className="text-[28px] leading-tight font-extrabold tracking-[-0.03em] md:text-[40px]">{b.title}</h2>}
                {b.subtitle && <p className="mt-2 text-lg opacity-80">{b.subtitle}</p>}
            </div>
            <div className="flex flex-wrap gap-3">
                {b.cta_label && <CtaButton label={b.cta_label} href={linkFor(b.link_to)} styleName={str(p.button_style, 'dark')} />}
                {str(p.cta2_label) && <Button asChild variant="outline" className="h-12 rounded-full border-current bg-transparent px-6 text-[15px] hover:bg-white/10"><Link href={linkFor(str(p.cta2_link))}>{str(p.cta2_label)}</Link></Button>}
            </div>
        </Shell>
    );
}

function PartnerCards({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const cards = list<{ icon?: string; title?: string; text?: string; cta_label?: string; link?: string }>(p.cards);
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className={cn('grid gap-4', gridCols(p.columns))}>
                {cards.map((c, k) => {
                    const I = ICONS[c.icon ?? ''] ?? Store;
                    return (
                        <Link key={k} href={linkFor(c.link)} className="group flex flex-col gap-3 rounded-3xl border p-7 transition hover:shadow-lg">
                            <I className="size-7" />
                            <h3 className="text-xl font-bold tracking-tight">{c.title}</h3>
                            {c.text && <p className="text-muted-foreground text-sm">{c.text}</p>}
                            {c.cta_label && <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold">{c.cta_label} <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>}
                        </Link>
                    );
                })}
            </div>
        </Shell>
    );
}

function Banner({ b }: { b: HomeBlockData }) {
    const tone = str(b.payload?.tone, 'dark');
    const cls = { gold: 'bg-sun-50 text-ink', brand: 'bg-brand text-black', red: 'bg-[var(--color-zred)] text-white', dark: 'bg-[#1c1c1c] text-white' }[tone] ?? 'bg-[#1c1c1c] text-white';
    const inner = <><b>{b.title}</b> {b.subtitle}{b.cta_label && <span className="ml-2 inline-flex items-center gap-1 font-semibold underline">{b.cta_label} <ArrowRight className="size-3.5" /></span>}</>;
    return <div className={cls}><div className="mx-auto max-w-7xl px-4 py-3 text-center text-sm md:px-6">{b.cta_label ? <Link href={linkFor(b.link_to)}>{inner}</Link> : inner}</div></div>;
}

function Rewards({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const rewards = ((b.data as { rewards?: { id: number; name: string; points_cost: number }[] })?.rewards ?? []).slice(0, 3);
    return (
        <Shell p={{ bg_type: 'color', bg_color: '#FFFBD9', text_tone: 'dark', ...p }} inner="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/70 text-2xl">🎁</span>
                <div>{b.title && <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{b.title}</h2>}{b.subtitle && <p className="opacity-75">{b.subtitle}</p>}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                {rewards.map((r) => <span key={r.id} className="rounded-full bg-white/70 px-3 py-1.5 text-sm font-semibold">{r.name} · {r.points_cost} pts</span>)}
                {b.cta_label && <CtaButton label={b.cta_label} href={linkFor(b.link_to)} styleName="dark" />}
            </div>
        </Shell>
    );
}

function Categories({ b }: { b: HomeBlockData }) {
    const cats = (b.data as { id: number; name: string; icon: string | null }[]) ?? [];
    if (!cats.length) return null;
    const square = b.payload?.shape === 'square';
    return (
        <Shell p={b.payload ?? {}}>
            <Heading b={b} />
            <div className="scroll-quiet -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                {cats.map((c) => (
                    <Link key={c.id} href={`/stores?cuisine=${encodeURIComponent(c.name)}`} className="group flex w-24 shrink-0 flex-col items-center gap-2">
                        <span className={cn('bg-muted flex size-20 items-center justify-center text-3xl transition group-hover:scale-105 group-hover:bg-brand-50 dark:bg-white/10', square ? 'rounded-2xl' : 'rounded-full')}>{c.icon ?? '🍽️'}</span>
                        <span className="text-[13px] font-semibold">{c.name}</span>
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

function RichText({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const size = { sm: 'text-[15px]', md: 'text-lg', lg: 'text-xl md:text-2xl' }[str(p.size, 'md')];
    return (
        <Shell p={p}>
            <div className={cn(p.align === 'center' && 'mx-auto max-w-3xl')}>
                {b.title && <h2 className="text-[26px] font-extrabold tracking-[-0.03em] md:text-[34px]">{b.title}</h2>}
                {b.subtitle && <p className={cn('mt-3 leading-relaxed whitespace-pre-line opacity-80', size)}>{b.subtitle}</p>}
                {b.cta_label && <CtaButton className="mt-6" label={b.cta_label} href={linkFor(b.link_to)} />}
            </div>
        </Shell>
    );
}

/** Logo tiles: shops near you / popular brands. */
function LogoRail({ b, stores }: { b: HomeBlockData; stores: StoreCardData[] }) {
    const p = b.payload ?? {};
    if (!stores.length) return null;
    const ads = list<number>(p.ad_ids).map(Number);
    const circle = p.shape === 'circle';
    return (
        <Shell p={p}>
            <Heading b={b} />
            <div className="scroll-quiet -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-4 md:px-0">
                {stores.map((s) => (
                    <Link key={s.id} href={`/store/${s.slug}`} className="group flex w-[104px] shrink-0 flex-col items-center gap-2 md:w-[120px]">
                        <span className={cn('relative flex size-[104px] items-center justify-center overflow-hidden border bg-white shadow-sm transition group-hover:shadow-md md:size-[120px]', circle ? 'rounded-full' : 'rounded-[22px]')}>
                            {s.logo ? <img src={s.logo} alt="" loading="lazy" className="size-full object-cover" /> : <span className="px-2 text-center text-sm font-extrabold text-[#222222]">{s.name}</span>}
                            {s.availability && !s.availability.is_open && <span className="absolute inset-0 bg-white/45" />}
                        </span>
                        <span className="text-muted-foreground line-clamp-2 text-center text-[13px] leading-tight">{ads.includes(s.id) && <span className="font-semibold">Ad · </span>}{s.name}</span>
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

/** "All 116 restaurants near you": the full nearby list in big cards. */
function AllStores({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const d = (b.data ?? { stores: [], count: 0 }) as { stores: StoreCardData[]; count: number };
    if (!d.stores.length) return null;
    const title = (b.title ?? 'All {count} stores near you').replace('{count}', String(d.count));
    const cols = { '1': '', '2': 'md:grid-cols-2', '3': 'md:grid-cols-2 lg:grid-cols-3' }[str(p.columns, '2')] ?? 'md:grid-cols-2';
    return (
        <Shell p={p}>
            <Heading b={{ ...b, title }} />
            <div className={cn('grid gap-x-5 gap-y-8', cols)}>{d.stores.map((s) => <StoreCard key={s.id} s={s} />)}</div>
            {d.count > d.stores.length && <div className="mt-8 text-center"><Button asChild variant="outline" className="h-12 rounded-full px-6"><Link href="/stores">See all {d.count}</Link></Button></div>}
        </Shell>
    );
}

function CategoryIcons({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const tiles = list<{ label?: string; image?: string; emoji?: string; link?: string }>(p.tiles);
    const size = { sm: 'size-14', md: 'size-20', lg: 'size-24' }[str(p.size, 'md')] ?? 'size-20';
    return (
        <Shell p={p}>
            {b.title && <Heading b={b} />}
            <div className="scroll-quiet -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:gap-6 md:px-0">
                {tiles.map((t, k) => (
                    <Link key={k} href={linkFor(t.link)} className="group flex shrink-0 flex-col items-center gap-2">
                        <span className={cn('flex items-center justify-center transition group-hover:scale-105', size)}>
                            {t.image ? <img src={t.image} alt="" loading="lazy" className="size-full object-contain" /> : <span className="text-[42px] leading-none">{t.emoji || '🍽️'}</span>}
                        </span>
                        <span className="text-[14px] font-semibold whitespace-nowrap">{t.label}</span>
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

function FilterChips({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const chips = list<{ label?: string; link?: string }>(p.chips);
    return (
        <Shell p={{ ...p, pad: p.pad ?? 'sm' }}>
            <div className="scroll-quiet -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
                {chips.map((c, k) => <Link key={k} href={linkFor(c.link)} className="hover:bg-muted flex h-11 shrink-0 items-center rounded-full border-2 px-5 text-[15px] font-semibold transition">{c.label}</Link>)}
            </div>
        </Shell>
    );
}

function NoticeBanner({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const d = (b.data ?? {}) as { open?: number; total?: number; next_open_at?: string | null };
    if (p.only_when_closed && (!d.total || (d.open ?? 0) > 0)) return null;
    const opens = d.next_open_at ? new Date(d.next_open_at).toLocaleTimeString('en-ZW', { hour: 'numeric', minute: '2-digit' }) : 'soon';
    const tone = { olive: 'bg-[#3d3517] text-white', dark: 'bg-[#1c1c1c] text-white', gold: 'bg-sun-50 text-[#222222]', brand: 'bg-brand text-black' }[str(p.tone, 'olive')] ?? 'bg-[#3d3517] text-white';
    return (
        <section className={cn('mt-6', tone, p.hide_on === 'mobile' && 'hidden md:block', p.hide_on === 'desktop' && 'md:hidden')}>
            <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 md:px-6">
                {str(p.image) && <img src={str(p.image)} alt="" className="size-16 shrink-0 object-contain md:size-20" />}
                <div>
                    {b.title && <div className="text-[17px] leading-tight font-extrabold md:text-xl">{b.title.replace('{opens}', opens)}</div>}
                    {b.subtitle && <div className="mt-0.5 opacity-85">{b.subtitle.replace('{opens}', opens)}</div>}
                </div>
            </div>
        </section>
    );
}

function PromoCards({ b }: { b: HomeBlockData }) {
    const p = b.payload ?? {};
    const cards = list<{ title?: string; text?: string; cta_label?: string; link?: string; image?: string; color?: string; tone?: string }>(p.cards);
    if (!cards.length) return null;
    return (
        <Shell p={p}>
            {b.title && <Heading b={b} />}
            <div className="scroll-quiet -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:scroll-px-0 md:px-0">
                {cards.map((c, k) => (
                    <Link key={k} href={linkFor(c.link)} className={cn('relative flex aspect-[16/9] w-[86%] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-[26px] p-6 sm:w-[60%] lg:w-[calc(50%-8px)]', c.tone === 'dark' ? 'text-[#222222]' : 'text-white')} style={{ backgroundColor: c.color || '#111111' }}>
                        {c.image && <img src={c.image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />}
                        <div className="relative max-w-[60%]">
                            {c.title && <h3 className="text-[22px] leading-tight font-extrabold tracking-tight md:text-[28px]">{c.title}</h3>}
                            {c.text && <p className="mt-1.5 text-[15px] opacity-85">{c.text}</p>}
                        </div>
                        {c.cta_label && <span className="relative self-start rounded-full bg-white px-5 py-2.5 text-[15px] font-bold text-[#222222]">{c.cta_label}</span>}
                    </Link>
                ))}
            </div>
        </Shell>
    );
}

/** Renders one home block on the website. */
export function HomeBlockView({ b, onItem }: { b: HomeBlockData; onItem: (i: MenuItem) => void }) {
    const p = b.payload ?? {};
    const d = b.data;
    switch (b.type) {
        case 'order_again':
        case 'recommended':
        case 'deals_near_you': return <Stores b={b} stores={(d as StoreCardData[]) ?? []} />;
        case 'shops_near_you':
        case 'brand_logos': return <LogoRail b={b} stores={(d as StoreCardData[]) ?? []} />;
        case 'all_stores': return <AllStores b={b} />;
        case 'category_icons': return <CategoryIcons b={b} />;
        case 'filter_chips': return <FilterChips b={b} />;
        case 'notice_banner': return <NoticeBanner b={b} />;
        case 'promo_cards': return <PromoCards b={b} />;
        case 'hero': return <Hero b={b} />;
        case 'banner': return <Banner b={b} />;
        case 'categories': return <Categories b={b} />;
        case 'specials':
        case 'dish_collection': return <Dishes b={b} items={(d as MenuItem[]) ?? []} onItem={onItem} />;
        case 'vendors':
        case 'store_collection':
        case 'new_stores':
        case 'top_rated':
        case 'free_delivery': return <Stores b={b} stores={(d as StoreCardData[]) ?? []} />;
        case 'rewards': return <Rewards b={b} />;
        case 'richtext': return <RichText b={b} />;
        case 'spacer': return <div aria-hidden style={{ height: num(p.height, 32) }} className={cn('mx-auto max-w-7xl px-4 md:px-6', p.hide_on === 'mobile' && 'hidden md:block', p.hide_on === 'desktop' && 'md:hidden')}>{p.divider ? <hr className="relative top-1/2" /> : null}</div>;
        case 'image_banner': return <ImageBanner b={b} />;
        case 'carousel': return <Carousel b={b} />;
        case 'promo_grid': return <PromoGrid b={b} />;
        case 'cuisine_tiles': return <CuisineTiles b={b} />;
        case 'countdown': return <Countdown b={b} />;
        case 'promo_code': return <PromoCode b={b} />;
        case 'app_download': return <AppDownload b={b} />;
        case 'how_it_works': return <IconCards b={b} items={list(p.steps)} numbered={!!p.numbered} card="filled" />;
        case 'features': return <IconCards b={b} items={list(p.items)} card={str(p.card, 'border')} />;
        case 'testimonials': return <Testimonials b={b} />;
        case 'stats': return <Stats b={b} />;
        case 'faq': return <Faq b={b} />;
        case 'video': return <VideoBlock b={b} />;
        case 'cta_band': return <CtaBand b={b} />;
        case 'partner_cta': return <PartnerCards b={b} />;
        default: return null;
    }
}

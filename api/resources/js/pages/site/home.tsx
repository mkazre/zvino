import { Button } from '@/components/ui/button';
import { Cover, DishCard, ItemModal, Section, StoreCard, type MenuItem, type StoreCardData } from '@/components/site';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { ArrowRight, Bike, Gift, MapPin, Search, ShieldCheck, Smartphone, Store, Wallet } from 'lucide-react';
import { useState } from 'react';

interface Props {
    city: string | null;
    blocks: { id: number; type: string; title: string | null; subtitle: string | null; cta_label: string | null; link_to: string | null; payload: Record<string, unknown> | null }[];
    categories: { id: number; name: string; icon: string | null }[];
    stores: StoreCardData[];
    specials: { data: MenuItem[] };
    stats: { stores: number; cities: number };
    seo: { title: string };
}

const linkFor = (to: string | null) => (!to ? '/stores' : to.startsWith('vendor/') ? `/stores` : to === 'rewards' ? '/account?tab=wallet' : to === 'specials' ? '/stores?offers=1' : to.startsWith('/') ? to : `/${to}`);

export default function Home({ city, blocks, categories, stores, specials, stats, seo }: Props) {
    const { site } = usePage<SiteProps>().props;
    const [q, setQ] = useState('');
    const [item, setItem] = useState<MenuItem | null>(null);
    const hero = blocks.find((b) => b.type === 'hero');
    const banner = blocks.find((b) => b.type === 'banner');
    const featured = stores.filter((s) => s.is_featured);
    const storeFor = (i: MenuItem) => stores.find((s) => s.id === i.vendor_id) ?? (i.vendor ? { ...i.vendor, min_order: { zig: 0, usd: 0 } } : undefined);

    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            {/* Hero */}
            <section className="relative -mt-16 overflow-hidden bg-[#1c1c1c] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(23,199,74,0.32),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(253,229,0,0.16),transparent_55%)]" />
                <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:px-6 md:py-24">
                    <div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur"><span className="size-1.5 rounded-full bg-brand" />Now delivering in {site.cities.join(' & ')}</span>
                        <h1 className="mt-5 text-[44px] leading-[1.02] font-extrabold tracking-[-0.045em] md:text-[68px]">{hero?.title ?? 'Your favourite food,'}<br /><span className="text-brand">delivered fast.</span></h1>
                        <p className="mt-5 max-w-md text-lg text-white/70">{hero?.subtitle ?? 'Order from the best restaurants and shops near you. Pay with EcoCash, InnBucks, OneMoney or card.'}</p>
                        <form onSubmit={(e) => { e.preventDefault(); router.get('/stores', { q, city: city ?? undefined }); }} className="mt-8 flex max-w-xl flex-col gap-2 rounded-2xl bg-white p-2 sm:flex-row">
                            <div className="flex flex-1 items-center gap-3 px-3 text-[#222222]">
                                <Search className="size-5 text-neutral-400" />
                                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sadza, pizza, braai, groceries…" className="h-12 w-full bg-transparent text-[15px] outline-none" />
                            </div>
                            <select value={city ?? ''} onChange={(e) => router.post('/city', { city: e.target.value }, { preserveScroll: true })} className="h-12 rounded-xl bg-neutral-100 px-3 text-sm font-medium text-[#222222] outline-none" aria-label="City">
                                <option value="" disabled>City</option>
                                {site.cities.map((c) => <option key={c}>{c}</option>)}
                            </select>
                            <Button type="submit" className="h-12 rounded-xl px-6 text-[15px]">Find food</Button>
                        </form>
                        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
                            <span className="flex items-center gap-1.5"><Store className="size-4" /> {stats.stores}+ stores</span>
                            <span className="flex items-center gap-1.5"><Wallet className="size-4" /> EcoCash · InnBucks · Card · Cash</span>
                            <span className="flex items-center gap-1.5"><ShieldCheck className="size-4" /> Prices in ZiG & USD</span>
                        </div>
                    </div>
                    <div className="relative hidden md:block">
                        <div className="absolute top-6 right-0 grid w-[88%] grid-cols-2 gap-4">
                            {(featured.length ? featured : stores).slice(0, 4).map((s, i) => (
                                <Link key={s.id} href={`/store/${s.slug}`} className={`group overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 backdrop-blur ${i % 2 ? 'mt-10' : ''}`}>
                                    <Cover src={s.cover} seed={s.id} className="aspect-[4/3]" />
                                    <div className="p-3"><div className="truncate text-sm font-bold">{s.name}</div><div className="text-xs text-white/60">{s.cuisine} · {s.eta_minutes[0]}–{s.eta_minutes[1]} min</div></div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {banner && (
                <div className={banner.payload?.tone === 'gold' ? 'bg-sun-50 text-ink' : 'bg-[#1c1c1c] text-white'}>
                    <div className="mx-auto max-w-7xl px-4 py-3 text-center text-sm md:px-6"><b>{banner.title}</b> {banner.subtitle}</div>
                </div>
            )}

            {/* Categories */}
            {categories.length > 0 && (
                <Section title="What are you craving?" className="mt-12">
                    <div className="scroll-quiet -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                        {categories.map((c) => (
                            <Link key={c.id} href={`/stores?cuisine=${encodeURIComponent(c.name)}`} className="group flex w-24 shrink-0 flex-col items-center gap-2">
                                <span className="bg-muted flex size-20 items-center justify-center rounded-full text-3xl transition group-hover:scale-105 group-hover:bg-brand-50 dark:bg-white/10">{c.icon ?? '🍽️'}</span>
                                <span className="text-[13px] font-semibold">{c.name}</span>
                            </Link>
                        ))}
                    </div>
                </Section>
            )}

            {featured.length > 0 && (
                <Section title="Featured on Zvino" className="mt-14" action={<Link href="/stores" className="flex items-center gap-1 text-sm font-semibold hover:underline">See all <ArrowRight className="size-4" /></Link>}>
                    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">{featured.slice(0, 6).map((s) => <StoreCard key={s.id} s={s} />)}</div>
                </Section>
            )}

            {specials.data.length > 0 && (
                <Section title={<span>Today’s specials <span className="align-middle text-2xl">🔥</span></span>} className="mt-16" action={<Link href="/stores?offers=1" className="flex items-center gap-1 text-sm font-semibold hover:underline">All offers <ArrowRight className="size-4" /></Link>}>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{specials.data.slice(0, 6).map((i) => <DishCard key={i.id} i={i} showStore onClick={() => setItem(i)} />)}</div>
                </Section>
            )}

            <Section title={city ? `Popular in ${city}` : 'Popular near you'} className="mt-16" action={<Link href="/stores" className="flex items-center gap-1 text-sm font-semibold hover:underline">See all <ArrowRight className="size-4" /></Link>}>
                {stores.length === 0 ? <p className="text-muted-foreground py-10 text-center">No stores in this city yet. We’re coming soon!</p> : <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{stores.slice(0, 8).map((s) => <StoreCard key={s.id} s={s} compact />)}</div>}
            </Section>

            {/* How it works */}
            <section className="mx-auto mt-24 max-w-7xl px-4 md:px-6">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        [MapPin, 'Tell us where', 'Pin your gate on the map, add a landmark and even a voice note for your driver.'],
                        [Smartphone, 'Pay your way', 'EcoCash, InnBucks, OneMoney, Visa/Mastercard, Zvino wallet or cash on delivery.'],
                        [Bike, 'Track it live', 'Watch your driver on the map and chat with them until your food arrives.'],
                    ].map(([Icon, t, d]) => {
                        const I = Icon as typeof MapPin;
                        return (
                            <div key={String(t)} className="bg-muted rounded-3xl p-7 dark:bg-white/5">
                                <span className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-white/10"><I className="size-6" /></span>
                                <h3 className="mt-5 text-lg font-bold tracking-tight">{String(t)}</h3>
                                <p className="text-muted-foreground mt-1.5 text-[15px] leading-relaxed">{String(d)}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Growth tiles */}
            <section className="mx-auto mt-6 grid max-w-7xl gap-4 px-4 md:grid-cols-2 md:px-6">
                <Link href="/plus" className="group relative overflow-hidden rounded-3xl bg-[#222222] p-8 text-white">
                    <span className="text-sm font-bold text-brand">ZVINO+</span>
                    <h3 className="mt-2 text-3xl font-extrabold tracking-tight">Free delivery,<br />every order.</h3>
                    <p className="mt-2 max-w-xs text-white/60">Plus half-price service fees and member-only deals.</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 font-semibold">Join Zvino+ <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
                </Link>
                <Link href="/gift-cards" className="group relative overflow-hidden rounded-3xl bg-sun-50 p-8 text-ink">
                    <Gift className="size-7" />
                    <h3 className="mt-3 text-3xl font-extrabold tracking-tight">Send a meal home.</h3>
                    <p className="mt-2 max-w-xs text-ink/70">In the diaspora? Gift a Zvino card to family in Zimbabwe. They get it by SMS.</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 font-semibold">Buy a gift card <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span>
                </Link>
            </section>

            <section className="mx-auto mt-4 grid max-w-7xl gap-4 px-4 md:grid-cols-2 md:px-6">
                {[['/partners', 'Own a restaurant or shop?', 'Reach thousands of new customers. We handle delivery and payments.', 'Partner with Zvino'], ['/drive', 'Got a bike or car?', 'Earn on your own schedule with weekly EcoCash payouts. Keep 100% of tips.', 'Drive with Zvino']].map(([h, t, d, c]) => (
                    <Link key={h} href={h} className="group flex items-center justify-between gap-6 rounded-3xl border p-7 transition hover:shadow-lg">
                        <div><h3 className="text-xl font-bold tracking-tight">{t}</h3><p className="text-muted-foreground mt-1 text-sm">{d}</p><span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">{c} <ArrowRight className="size-4 transition group-hover:translate-x-1" /></span></div>
                    </Link>
                ))}
            </section>

            {item && storeFor(item) && <ItemModal item={item} store={storeFor(item)!} onClose={() => setItem(null)} />}
        </SiteLayout>
    );
}

import { DishCard, ItemModal, StoreCard, type MenuItem, type StoreCardData } from '@/components/site';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { cn } from '@/lib/utils';
import { Head, router, usePage } from '@inertiajs/react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

interface Props {
    seo: { title: string };
    stores: StoreCardData[];
    cuisines: string[];
    filters: { city: string | null; cuisine: string | null; q: string | null; sort: string; free_delivery: boolean; offers: boolean };
    matchingItems: { data: MenuItem[] } | [];
}

export default function Stores({ seo, stores, cuisines, filters, matchingItems }: Props) {
    const { site } = usePage<SiteProps>().props;
    const [q, setQ] = useState(filters.q ?? '');
    const [item, setItem] = useState<MenuItem | null>(null);
    const go = (p: Partial<Props['filters']>) => router.get('/stores', Object.fromEntries(Object.entries({ ...filters, ...p }).filter(([, v]) => v !== null && v !== false && v !== '' && v !== 'recommended')), { preserveState: true, preserveScroll: true, replace: true });
    const items = Array.isArray(matchingItems) ? [] : matchingItems.data;
    const open = stores.filter((s) => s.availability?.is_open !== false);
    const closed = stores.filter((s) => s.availability?.is_open === false);
    const chip = (active: boolean) => cn('h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition', active ? 'bg-[#1c1c1c] text-white dark:bg-white dark:text-black' : 'bg-muted hover:bg-neutral-200 dark:bg-white/10');

    return (
        <SiteLayout>
            <Head title={seo.title} />
            <div className="mx-auto max-w-7xl px-4 pt-8 md:px-6">
                <h1 className="text-[32px] font-extrabold tracking-[-0.04em] md:text-[40px]">
                    {filters.q ? <>Results for “{filters.q}”</> : filters.cuisine ? `${filters.cuisine}` : 'All stores'}
                    {filters.city && <span className="text-muted-foreground font-bold"> in {filters.city}</span>}
                </h1>
                <p className="text-muted-foreground mt-1">{stores.length} {stores.length === 1 ? 'place' : 'places'} delivering now</p>

                <form onSubmit={(e) => { e.preventDefault(); go({ q }); }} className="relative mt-6 md:hidden">
                    <Search className="text-muted-foreground absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search food or stores" className="bg-muted h-12 w-full rounded-full pr-4 pl-11 text-sm outline-none" />
                </form>

                <div className="scroll-quiet -mx-4 mt-6 flex items-center gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
                    <SlidersHorizontal className="text-muted-foreground mr-1 size-4 shrink-0" />
                    {[['recommended', 'Recommended'], ['rating', 'Top rated'], ['fastest', 'Fastest']].map(([v, l]) => <button key={v} className={chip(filters.sort === v)} onClick={() => go({ sort: v })}>{l}</button>)}
                    <span className="bg-border mx-1 h-6 w-px shrink-0" />
                    <button className={chip(filters.offers)} onClick={() => go({ offers: !filters.offers })}>🔥 Offers</button>
                    <button className={chip(filters.free_delivery)} onClick={() => go({ free_delivery: !filters.free_delivery })}>Free delivery</button>
                    {site.cities.map((c) => <button key={c} className={chip(filters.city === c)} onClick={() => go({ city: filters.city === c ? null : c })}>{c}</button>)}
                    <span className="bg-border mx-1 h-6 w-px shrink-0" />
                    {cuisines.map((c) => <button key={c} className={chip(filters.cuisine === c)} onClick={() => go({ cuisine: filters.cuisine === c ? null : c })}>{c}</button>)}
                </div>

                {items.length > 0 && (
                    <section className="mt-10">
                        <h2 className="mb-4 text-xl font-bold tracking-tight">Dishes matching “{filters.q}”</h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.map((i) => <DishCard key={i.id} i={i} showStore onClick={() => setItem(i)} />)}</div>
                    </section>
                )}

                <div className="mt-10 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{open.map((s) => <StoreCard key={s.id} s={s} compact />)}</div>
                {stores.length === 0 && (
                    <div className="py-24 text-center">
                        <div className="text-5xl">🍽️</div>
                        <h2 className="mt-4 text-xl font-bold">Nothing matches yet</h2>
                        <p className="text-muted-foreground mt-1">Try another search or clear your filters.</p>
                        <button onClick={() => router.get('/stores')} className="mt-5 rounded-full bg-[#222222] px-5 py-2.5 text-sm font-semibold text-white">Clear filters</button>
                    </div>
                )}
                {closed.length > 0 && (
                    <section className="mt-16">
                        <h2 className="text-muted-foreground mb-4 text-lg font-bold">Closed now · order for later</h2>
                        <div className="grid gap-x-5 gap-y-10 opacity-80 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{closed.map((s) => <StoreCard key={s.id} s={s} compact />)}</div>
                    </section>
                )}
            </div>
            {item?.vendor && <ItemModal item={item} store={{ ...item.vendor, min_order: stores.find((s) => s.id === item.vendor_id)?.min_order ?? { zig: 0, usd: 0 } }} onClose={() => setItem(null)} />}
        </SiteLayout>
    );
}

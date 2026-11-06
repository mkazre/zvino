import { HomeBlockView, type HomeBlockData } from '@/components/home-blocks';
import { ItemModal, type MenuItem, type StoreCardData } from '@/components/site';
import SiteLayout from '@/layouts/site-layout';
import { BLOCKS } from '@/lib/blocks';
import { Head } from '@inertiajs/react';
import { Fragment, useState } from 'react';

interface Props {
    city: string | null;
    blocks: HomeBlockData[];
    stores: StoreCardData[];
    seo: { title: string };
    nearby?: { has_location: boolean; count: number };
}

/** Website home: the sections from Admin → Home builder, in order. */
export default function Home({ blocks, stores, seo, nearby }: Props) {
    const [item, setItem] = useState<MenuItem | null>(null);
    // Nothing published yet: show the classic hero so the page is never empty.
    const list: HomeBlockData[] = blocks.length ? blocks : [{ id: 0, type: 'hero', title: BLOCKS.hero.defaults.title ?? null, subtitle: BLOCKS.hero.defaults.subtitle ?? null, cta_label: null, link_to: null, payload: BLOCKS.hero.defaults.payload ?? {}, data: { stores: stores.slice(0, 4) } }];
    const storeFor = (i: MenuItem) => stores.find((s) => s.id === i.vendor_id) ?? (i.vendor ? { ...i.vendor, min_order: { zig: 0, usd: 0 } } : undefined);

    return (
        <SiteLayout transparent={list[0]?.type === 'hero'}>
            <Head title={seo.title} />
            {list.map((b, i) => (
                <Fragment key={b.id}>
                    <HomeBlockView b={b} onItem={setItem} />
                    {i === 0 && nearby?.has_location && nearby.count === 0 && (
                        <div className="mx-auto mt-10 max-w-xl px-4 text-center">
                            <div className="text-5xl">📍</div>
                            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">We don’t deliver to this address yet</h2>
                            <p className="text-muted-foreground mt-1">Pick another address at the top, or browse every store for collection.</p>
                            <a href="/stores" className="mt-5 inline-flex h-12 items-center rounded-full bg-[#1c1c1c] px-6 font-semibold text-white">Browse all stores</a>
                        </div>
                    )}
                </Fragment>
            ))}
            {item && storeFor(item) && <ItemModal item={item} store={storeFor(item)!} onClose={() => setItem(null)} />}
        </SiteLayout>
    );
}

import { HomeBlockView, type HomeBlockData } from '@/components/home-blocks';
import { ItemModal, type MenuItem, type StoreCardData } from '@/components/site';
import SiteLayout from '@/layouts/site-layout';
import { BLOCKS } from '@/lib/blocks';
import { Head } from '@inertiajs/react';
import { useState } from 'react';

interface Props {
    city: string | null;
    blocks: HomeBlockData[];
    stores: StoreCardData[];
    seo: { title: string };
}

/** Website home: the sections from Admin → Home builder, in order. */
export default function Home({ blocks, stores, seo }: Props) {
    const [item, setItem] = useState<MenuItem | null>(null);
    // Nothing published yet: show the classic hero so the page is never empty.
    const list: HomeBlockData[] = blocks.length ? blocks : [{ id: 0, type: 'hero', title: BLOCKS.hero.defaults.title ?? null, subtitle: BLOCKS.hero.defaults.subtitle ?? null, cta_label: null, link_to: null, payload: BLOCKS.hero.defaults.payload ?? {}, data: { stores: stores.slice(0, 4) } }];
    const storeFor = (i: MenuItem) => stores.find((s) => s.id === i.vendor_id) ?? (i.vendor ? { ...i.vendor, min_order: { zig: 0, usd: 0 } } : undefined);

    return (
        <SiteLayout transparent={list[0]?.type === 'hero'}>
            <Head title={seo.title} />
            {list.map((b) => <HomeBlockView key={b.id} b={b} onItem={setItem} />)}
            {item && storeFor(item) && <ItemModal item={item} store={storeFor(item)!} onClose={() => setItem(null)} />}
        </SiteLayout>
    );
}

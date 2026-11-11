import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddressBar } from '@/features/address-bar';
import { EmailCard } from '@/features/email-card';
import { CartBar, Cover, LogoTile, StoreCard, type MenuItem, type Store } from '@/features/cards';
import { Bell } from '@/features/bell';
import { api } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { zig } from '@/lib/money';
import { useOnReconnect } from '@/lib/network';
import { useImg } from '@/lib/prefs';
import { Button, Empty, Loading, Logo, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { withMeal } from '@/lib/meal-time';
import { categoryIcon } from '@/lib/category-icon';

export interface Block { id: number; type: string; title: string | null; subtitle: string | null; cta_label: string | null; link_to: string | null; payload: Record<string, unknown>; data: unknown }
interface Layout { platform_mode: 'single' | 'marketplace'; single_vendor: { data: Store } | Store | null; nearby?: { has_location: boolean; count: number }; blocks: Block[] }

/** Restaurants tab: the Home Builder feed (GET /api/home-layout) for the active delivery address. */
export default function Home() {
    return <Feed segment="restaurants" />;
}

export function Feed({ segment }: { segment: 'restaurants' | 'shops' }) {
    const t = useTheme();
    const { query, active } = useLocation();
    const [layout, setLayout] = useState<Layout | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            setLayout(await api.get<Layout>(`/home-layout?segment=${segment}${query ? `&${query}` : ''}`));
            setFailed(false);
        } catch {
            setFailed(true); // keep the last good layout if we have one
        }
    }, [query, segment]);
    // A slow or dropped first load must not leave the spinner forever: retry, and again when back online.
    useEffect(() => {
        if (!failed || layout) return;
        const timer = setTimeout(load, 5000);
        return () => clearTimeout(timer);
    }, [failed, layout, load]);
    useOnReconnect(load);
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        // Single-restaurant mode: the app opens straight on that menu.
        const sv = layout?.single_vendor as { data?: Store; id?: number } | null;
        const id = sv?.data?.id ?? sv?.id;
        if (layout?.platform_mode === 'single' && id) router.replace(`/store/${id}`);
    }, [layout]);

    if (!layout) {
        return failed ? (
            <Screen>
                <Empty icon="cloud-offline-outline" title="Couldn’t load Zvino" body="Check your connection. We’ll keep trying." action={<Button title="Try again" size="md" onPress={load} />} />
            </Screen>
        ) : <Loading />;
    }

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 110 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />}>
                <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
                    <Row justify="space-between"><Logo height={28} /><Bell /></Row>
                    <AddressBar />
                    {segment === 'restaurants' && <EmailCard />}
                    <Pressable onPress={() => router.push('/search')} style={{ height: 50, borderRadius: 16, backgroundColor: t.subtle, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
                        <Ionicons name="search" size={20} color={t.muted} />
                        <Text color="muted">{segment === 'shops' ? 'Search shops & groceries' : 'Try “sadza”, “pizza”, “braai”'}</Text>
                    </Pressable>
                </View>
                {layout.nearby?.has_location && layout.nearby.count === 0 && (
                    <View style={{ padding: 24 }}>
                        <Empty icon="location-outline" title="We don’t deliver here yet" body={`No stores deliver to ${active?.address_id ? active.label : 'this location'} yet. Try another address at the top.`} />
                    </View>
                )}
                {layout.blocks.map((b) => <BlockView key={b.id} b={b} />)}
            </ScrollView>
            <CartBar />
        </SafeAreaView>
    );
}

/** Website-style links from the Home Builder → app screens. */
export function go(link: string | null | undefined) {
    if (!link) return;
    const [path, qs = ''] = link.split('?');
    const p = Object.fromEntries(new URLSearchParams(qs));
    if (link.startsWith('vendor/')) router.push(`/store/${link.split('/')[1]}`);
    else if (link === 'rewards' || path.startsWith('/account')) router.push('/wallet');
    else if (link === 'specials') router.push({ pathname: '/search', params: { filter: 'offers' } });
    else if (p.segment === 'shops' || path === '/shops') router.push('/shops');
    else if (path === '/stores' || path === '/search') router.push({ pathname: '/search', params: { ...(p.q ? { q: p.q } : {}), ...(p.cuisine ? { cuisine: p.cuisine } : {}), ...(p.offers ? { filter: 'offers' } : {}), ...(p.free_delivery ? { filter: 'free_delivery' } : {}), ...(p.sort === 'rating' ? { filter: 'rating' } : {}), ...(p.sort === 'fastest' ? { filter: 'fastest' } : {}) } });
    else if (path === '/plus') router.push('/plans');
    else if (path === '/hampers') router.push('/hampers');
    else if (path === '/catering') router.push('/catering');
    else router.push('/search');
}

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const list = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

function Heading({ b, title }: { b: Block; title?: string }) {
    const label = title ?? b.title;
    if (!label) return null;
    return (
        <View style={{ paddingHorizontal: 16 }}>
            <SectionTitle action={b.cta_label ? <Pressable onPress={() => go(b.link_to)}><Text variant="label" color="muted">{b.cta_label}</Text></Pressable> : undefined}>{label}</SectionTitle>
        </View>
    );
}

function StoreRail({ b, stores }: { b: Block; stores: Store[] }) {
    if (!stores.length) return null;
    if (b.payload?.layout === 'grid') {
        return <View><Heading b={b} /><View style={{ paddingHorizontal: 16, gap: 16 }}>{stores.map((s) => <StoreCard key={s.id} s={s} />)}</View></View>;
    }
    return (
        <View>
            <Heading b={b} />
            <FlatList horizontal data={stores} keyExtractor={(s) => String(s.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} renderItem={({ item }) => <StoreCard s={item} width={280} />} />
        </View>
    );
}

/** HomeBlockRenderer: one component per block type in the admin library. */
function BlockView({ b }: { b: Block }) {
    const t = useTheme();
    const img = useImg();
    const p = b.payload ?? {};
    switch (b.type) {
        case 'hero':
            return (
                <Pressable onPress={() => go(b.link_to)} style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 22, padding: 22, overflow: 'hidden', backgroundColor: str(p.background) || t.brand }}>
                    {p.bg_type === 'image' && str(p.bg_image) ? <Image source={{ uri: img(str(p.bg_image), 900) ?? undefined }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" /> : null}
                    {p.bg_type === 'image' && str(p.bg_image) ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' }} /> : null}
                    <Text variant="title" style={{ color: '#fff' }}>{withMeal(b.title)}</Text>
                    {str(p.accent_text) ? <Text variant="title" style={{ color: '#17C74A' }}>{str(p.accent_text)}</Text> : null}
                    {b.subtitle && <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{b.subtitle}</Text>}
                    {b.cta_label && <View style={{ backgroundColor: '#fff', alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9, marginTop: 16 }}><Text variant="label" style={{ color: '#222222' }}>{b.cta_label}</Text></View>}
                </Pressable>
            );
        case 'categories': {
            const cats = (b.data as { id: number; name: string; icon: string | null }[]) ?? [];
            return (
                <View>
                    <Heading b={b} />
                    <FlatList horizontal data={cats} keyExtractor={(c) => String(c.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingTop: b.title ? 0 : 16 }}
                        renderItem={({ item }) => (
                            <Pressable onPress={() => router.push({ pathname: '/search', params: { cuisine: item.name } })} style={{ alignItems: 'center', gap: 6, width: 72 }}>
                                <View style={{ width: 66, height: 66, borderRadius: p.shape === 'square' ? 18 : 33, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={categoryIcon(item.name)} size={28} color={t.brandText} /></View>
                                <Text variant="caption" style={{ color: t.ink, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                            </Pressable>
                        )} />
                </View>
            );
        }
        case 'category_icons': {
            const tiles = list<{ label?: string; image?: string; emoji?: string; link?: string }>(p.tiles);
            const size = { sm: 52, md: 68, lg: 84 }[str(p.size, 'md') as 'sm' | 'md' | 'lg'] ?? 68;
            return (
                <View>
                    <Heading b={b} />
                    <FlatList horizontal data={tiles} keyExtractor={(_, i) => String(i)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 18, paddingTop: b.title ? 0 : 18 }}
                        renderItem={({ item }) => (
                            <Pressable onPress={() => go(item.link)} style={{ alignItems: 'center', gap: 6 }}>
                                <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
                                    {item.image ? <Image source={{ uri: img(item.image, 240) ?? undefined }} style={{ width: size, height: size }} contentFit="contain" /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={categoryIcon(item.label)} size={size * 0.42} color={t.brandText} /></View>}
                                </View>
                                <Text variant="label" style={{ fontSize: 14 }}>{item.label}</Text>
                            </Pressable>
                        )} />
                </View>
            );
        }
        case 'filter_chips': {
            const chips = list<{ label?: string; link?: string }>(p.chips);
            return (
                <FlatList horizontal data={chips} keyExtractor={(_, i) => String(i)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingTop: 16 }}
                    renderItem={({ item }) => <Pressable onPress={() => go(item.link)} style={{ height: 42, paddingHorizontal: 18, borderRadius: 99, borderWidth: 1.5, borderColor: t.border, justifyContent: 'center' }}><Text variant="label">{item.label}</Text></Pressable>} />
            );
        }
        case 'notice_banner': {
            const d = (b.data ?? {}) as { open?: number; total?: number; next_open_at?: string | null };
            if (p.only_when_closed && (!d.total || (d.open ?? 0) > 0)) return null;
            const opens = d.next_open_at ? new Date(d.next_open_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'soon';
            const bg = { olive: '#3d3517', dark: '#1C1C1C', gold: t.goldSoft, brand: t.brand }[str(p.tone, 'olive') as 'olive'] ?? '#3d3517';
            const light = ['olive', 'dark'].includes(str(p.tone, 'olive'));
            return (
                <View style={{ marginTop: 16, backgroundColor: bg, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {str(p.image) ? <Image source={{ uri: img(str(p.image), 240) ?? undefined }} style={{ width: 64, height: 64 }} contentFit="contain" /> : null}
                    <View style={{ flex: 1 }}>
                        {b.title ? <Text variant="heading" style={{ color: light ? '#fff' : '#222222' }}>{b.title.replace('{opens}', opens)}</Text> : null}
                        {b.subtitle ? <Text style={{ color: light ? 'rgba(255,255,255,0.85)' : '#3d2c03' }}>{b.subtitle.replace('{opens}', opens)}</Text> : null}
                    </View>
                </View>
            );
        }
        case 'promo_cards': {
            const cards = list<{ title?: string; text?: string; cta_label?: string; link?: string; image?: string; color?: string; tone?: string }>(p.cards);
            if (!cards.length) return null;
            return (
                <View>
                    <Heading b={b} />
                    <FlatList horizontal data={cards} keyExtractor={(_, i) => String(i)} showsHorizontalScrollIndicator={false} snapToInterval={316} decelerationRate="fast" contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: b.title ? 0 : 16 }}
                        renderItem={({ item }) => {
                            const dark = item.tone === 'dark';
                            return (
                                <Pressable onPress={() => go(item.link)} style={{ width: 304, height: 190, borderRadius: 22, overflow: 'hidden', backgroundColor: item.color || '#111111', padding: 18, justifyContent: 'space-between' }}>
                                    {item.image ? <Image source={{ uri: img(item.image, 800) ?? undefined }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" /> : null}
                                    <View style={{ maxWidth: '62%' }}>
                                        {item.title ? <Text variant="heading" style={{ color: dark ? '#222222' : '#fff', fontSize: 20 }}>{item.title}</Text> : null}
                                        {item.text ? <Text style={{ color: dark ? '#222222' : 'rgba(255,255,255,0.85)', marginTop: 4 }}>{item.text}</Text> : null}
                                    </View>
                                    {item.cta_label ? <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 8 }}><Text variant="label" style={{ color: '#222222' }}>{item.cta_label}</Text></View> : null}
                                </Pressable>
                            );
                        }} />
                </View>
            );
        }
        case 'vendors':
        case 'order_again':
        case 'recommended':
        case 'deals_near_you':
        case 'new_stores':
        case 'top_rated':
        case 'free_delivery':
        case 'store_collection':
            return <StoreRail b={b} stores={(b.data as Store[]) ?? []} />;
        case 'shops_near_you':
        case 'brand_logos': {
            const stores = (b.data as Store[]) ?? [];
            if (!stores.length) return null;
            const ads = list<number>(p.ad_ids).map(Number);
            return (
                <View>
                    <Heading b={b} />
                    <FlatList horizontal data={stores} keyExtractor={(s) => String(s.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} renderItem={({ item }) => <LogoTile s={item} ad={ads.includes(item.id)} circle={p.shape === 'circle'} />} />
                </View>
            );
        }
        case 'all_stores': {
            const d = (b.data ?? { stores: [], count: 0 }) as { stores: Store[]; count: number };
            if (!d.stores.length) return null;
            return (
                <View>
                    <Heading b={b} title={(b.title ?? 'All {count} stores near you').replace('{count}', String(d.count))} />
                    <View style={{ paddingHorizontal: 16, gap: 16 }}>{d.stores.map((s) => <StoreCard key={s.id} s={s} />)}</View>
                </View>
            );
        }
        case 'specials': {
            const items = (b.data as MenuItem[]) ?? [];
            if (!items.length) return null;
            return (
                <View>
                    <Heading b={b} title={b.title ?? 'Today’s specials'} />
                    <FlatList horizontal data={items} keyExtractor={(i) => String(i.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
                        renderItem={({ item }) => (
                            <Pressable onPress={() => router.push(`/store/${item.vendor_id}`)} style={{ width: 160 }}>
                                <Cover uri={item.image} seed={item.id} height={120} radius={16} />
                                <Text variant="label" numberOfLines={1} style={{ marginTop: 8 }}>{item.name}</Text>
                                <Text variant="caption" numberOfLines={1}>{item.vendor?.name}</Text>
                                <Row gap={6}><Text variant="label" color="red">{zig(item.special_price?.zig ?? item.price.zig)}</Text>{item.special_price && <Text variant="caption" style={{ textDecorationLine: 'line-through' }}>{zig(item.price.zig)}</Text>}</Row>
                            </Pressable>
                        )} />
                </View>
            );
        }
        case 'banner': {
            const gold = p.tone === 'gold';
            return (
                <Pressable onPress={() => go(b.link_to)} style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 14, padding: 14, backgroundColor: gold ? t.goldSoft : p.tone === 'brand' ? t.brand : p.tone === 'red' ? t.red : t.inverse }}>
                    <Text variant="label" style={{ color: gold ? '#6b4e05' : p.tone === 'brand' ? '#111' : t.onInverse }}>{b.title}</Text>
                    {b.subtitle && <Text variant="caption" style={{ color: gold ? '#6b4e05' : p.tone === 'brand' ? '#111' : t.onInverseMuted }}>{b.subtitle}</Text>}
                </Pressable>
            );
        }
        case 'rewards': {
            const d = b.data as { points: number | null; rewards: { id: number; name: string; points_cost: number }[] };
            return (
                <Pressable onPress={() => router.push('/wallet')} style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 18, padding: 16, backgroundColor: t.goldSoft, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(61,44,3,0.08)', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="gift-outline" size={24} color="#3d2c03" /></View>
                    <View style={{ flex: 1 }}>
                        <Text variant="heading" style={{ color: '#3d2c03' }}>{b.title ?? 'Zvino Rewards'}</Text>
                        <Text variant="caption" style={{ color: '#3d2c03' }}>{d?.points !== null && d?.points !== undefined ? `You have ${d.points} points` : b.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#3d2c03" />
                </Pressable>
            );
        }
        case 'richtext':
            return <View style={{ paddingHorizontal: 16, marginTop: 20 }}>{b.title && <Text variant="heading">{b.title}</Text>}{b.subtitle && <Text color="muted">{b.subtitle}</Text>}</View>;
        case 'spacer':
            return <View style={{ height: Number(p.height ?? 16) }} />;
        default:
            return null;
    }
}

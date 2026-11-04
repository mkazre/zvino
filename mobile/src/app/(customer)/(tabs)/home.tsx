import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CartBar, Cover, StoreCard, type MenuItem, type Store } from '@/features/cards';
import { api } from '@/lib/api';
import { zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Loading, Row, SectionTitle, Text, useTheme, Logo } from '@/ui';

interface Block { id: number; type: string; title: string | null; subtitle: string | null; cta_label: string | null; link_to: string | null; payload: Record<string, unknown>; data: unknown }
interface Layout { platform_mode: 'single' | 'marketplace'; single_vendor: { data: Store } | Store | null; blocks: Block[] }

/** Home feed rendered from the admin Home Builder (GET /api/home-layout). */
export default function Home() {
    const t = useTheme();
    const { me } = useSession();
    const [layout, setLayout] = useState<Layout | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            setLayout(await api.get<Layout>('/home-layout'));
        } catch {
            /* keep last */
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        // Single-restaurant mode: the app opens straight on that menu.
        const sv = layout?.single_vendor as { data?: Store; id?: number } | null;
        const id = sv?.data?.id ?? sv?.id;
        if (layout?.platform_mode === 'single' && id) router.replace(`/store/${id}`);
    }, [layout]);

    if (!layout) return <Loading />;

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 100 }} refreshControl={undefined} onScrollEndDrag={undefined}>
                <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 14 }}>
                    <Logo height={30} />
                    <Row justify="space-between">
                        <Pressable onPress={() => router.push('/addresses')}>
                            <Text variant="caption">Deliver to</Text>
                            <Row gap={4}><Text variant="heading">{me ? 'Choose address' : 'Harare'}</Text><Ionicons name="chevron-down" size={16} color={t.ink} /></Row>
                        </Pressable>
                        {me ? (
                            <Pressable onPress={() => router.push('/wallet')} style={{ backgroundColor: t.subtle, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8 }}><Text variant="label">{zig(me.wallet_balance_zig)}</Text></Pressable>
                        ) : (
                            <Pressable onPress={() => router.push('/sign-in')} style={{ backgroundColor: t.inverse, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9 }}><Text variant="label" color="onInverse">Sign in</Text></Pressable>
                        )}
                    </Row>
                    <Pressable onPress={() => router.push('/search')} style={{ height: 50, borderRadius: 99, backgroundColor: t.subtle, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 }}>
                        <Ionicons name="search" size={18} color={t.muted} />
                        <Text color="muted">Sadza, pizza, braai, groceries…</Text>
                    </Pressable>
                </View>
                {layout.blocks.map((b) => <BlockView key={b.id} b={b} />)}
                <Pressable onPress={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} style={{ alignItems: 'center', paddingVertical: 24 }}>
                    <Text variant="caption">{refreshing ? 'Refreshing…' : 'Pull down or tap to refresh'}</Text>
                </Pressable>
            </ScrollView>
            <CartBar />
        </SafeAreaView>
    );
}

function go(link: string | null) {
    if (!link) return;
    if (link.startsWith('vendor/')) router.push(`/store/${link.split('/')[1]}`);
    else if (link === 'rewards') router.push('/wallet');
    else router.push('/search');
}

/** HomeBlockRenderer: one component per block type in the admin library. */
function BlockView({ b }: { b: Block }) {
    const t = useTheme();
    switch (b.type) {
        case 'hero':
            return (
                <Pressable onPress={() => go(b.link_to)} style={{ marginHorizontal: 20, marginTop: 20, borderRadius: 22, padding: 22, backgroundColor: (b.payload?.background as string) ?? t.brand }}>
                    <Text variant="title" style={{ color: '#fff' }}>{b.title}</Text>
                    {b.subtitle && <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>{b.subtitle}</Text>}
                    {b.cta_label && <View style={{ backgroundColor: '#fff', alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 9, marginTop: 16 }}><Text variant="label" style={{ color: '#222222' }}>{b.cta_label}</Text></View>}
                </Pressable>
            );
        case 'categories': {
            const cats = (b.data as { id: number; name: string; icon: string | null }[]) ?? [];
            return (
                <View>
                    {b.title && <View style={{ paddingHorizontal: 20 }}><SectionTitle>{b.title}</SectionTitle></View>}
                    <FlatList horizontal data={cats} keyExtractor={(c) => String(c.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}
                        renderItem={({ item }) => (
                            <Pressable onPress={() => router.push({ pathname: '/search', params: { cuisine: item.name } })} style={{ alignItems: 'center', gap: 6, width: 72 }}>
                                <View style={{ width: 66, height: 66, borderRadius: 33, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28 }}>{item.icon ?? '🍽️'}</Text></View>
                                <Text variant="caption" style={{ color: t.ink, fontWeight: '600' }} numberOfLines={1}>{item.name}</Text>
                            </Pressable>
                        )} />
                </View>
            );
        }
        case 'vendors': {
            const stores = (b.data as Store[]) ?? [];
            return (
                <View style={{ paddingHorizontal: 20 }}>
                    <SectionTitle action={b.cta_label ? <Pressable onPress={() => router.push('/search')}><Text variant="label" color="muted">{b.cta_label}</Text></Pressable> : undefined}>{b.title ?? 'Popular near you'}</SectionTitle>
                    <View style={{ gap: 24 }}>{stores.map((s) => <StoreCard key={s.id} s={s} />)}</View>
                </View>
            );
        }
        case 'specials': {
            const items = (b.data as MenuItem[]) ?? [];
            if (!items.length) return null;
            return (
                <View>
                    <View style={{ paddingHorizontal: 20 }}><SectionTitle>{b.title ?? 'Today’s specials 🔥'}</SectionTitle></View>
                    <FlatList horizontal data={items} keyExtractor={(i) => String(i.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
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
        case 'banner':
            return (
                <View style={{ marginHorizontal: 20, marginTop: 20, borderRadius: 14, padding: 14, backgroundColor: b.payload?.tone === 'gold' ? t.goldSoft : t.inverse }}>
                    <Text variant="label" style={{ color: b.payload?.tone === 'gold' ? '#6b4e05' : t.onInverse }}>{b.title}</Text>
                    {b.subtitle && <Text variant="caption" style={{ color: b.payload?.tone === 'gold' ? '#6b4e05' : 'rgba(255,255,255,0.7)' }}>{b.subtitle}</Text>}
                </View>
            );
        case 'rewards': {
            const d = b.data as { points: number | null; rewards: { id: number; name: string; points_cost: number }[] };
            return (
                <Pressable onPress={() => router.push('/wallet')} style={{ marginHorizontal: 20, marginTop: 20, borderRadius: 18, padding: 16, backgroundColor: t.goldSoft, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Text style={{ fontSize: 30 }}>🎁</Text>
                    <View style={{ flex: 1 }}>
                        <Text variant="heading">{b.title ?? 'Zvino Rewards'}</Text>
                        <Text variant="caption">{d?.points !== null && d?.points !== undefined ? `You have ${d.points} points` : b.subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={t.muted} />
                </Pressable>
            );
        }
        case 'richtext':
            return <View style={{ paddingHorizontal: 20, marginTop: 20 }}>{b.title && <Text variant="heading">{b.title}</Text>}{b.subtitle && <Text color="muted">{b.subtitle}</Text>}</View>;
        case 'spacer':
            return <View style={{ height: Number(b.payload?.height ?? 16) }} />;
        default:
            return null;
    }
}

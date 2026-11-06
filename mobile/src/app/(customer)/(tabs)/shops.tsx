import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AddressBar } from '@/features/address-bar';
import { CartBar, LogoTile, StoreCard, type Store } from '@/features/cards';
import { Bell } from '@/features/bell';
import { api } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { useOnReconnect } from '@/lib/network';
import { Chip, Empty, Loading, Logo, Row, SectionTitle, Text, useTheme } from '@/ui';

const KINDS: Record<string, string> = { grocery: '🛒 Groceries', pharmacy: '💊 Pharmacy', market: '🥩 Butchery & market', bakery: '🥖 Bakery' };

/** Shops tab: groceries, pharmacies and markets that deliver to the active address. */
export default function Shops() {
    const t = useTheme();
    const { query, active } = useLocation();
    const [kind, setKind] = useState('');
    const [data, setData] = useState<{ kinds: string[]; shops: Store[] } | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        const params = [query, kind ? `kind=${kind}` : ''].filter(Boolean).join('&');
        setData(await api.get<{ kinds: string[]; shops: Store[] }>(`/shops${params ? `?${params}` : ''}`).catch(() => ({ kinds: [], shops: [] })));
    }, [query, kind]);
    useEffect(() => {
        load();
    }, [load]);
    useOnReconnect(load);

    if (!data) return <Loading />;
    const open = data.shops.filter((s) => s.availability?.is_open !== false);

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <FlatList
                data={data.shops}
                keyExtractor={(s) => String(s.id)}
                contentContainerStyle={{ paddingBottom: 110, gap: 16 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />}
                ListHeaderComponent={
                    <View style={{ gap: 12 }}>
                        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
                            <Row justify="space-between"><Logo height={28} /><Bell /></Row>
                            <AddressBar />
                            <Pressable onPress={() => router.push('/search')} style={{ height: 50, borderRadius: 16, backgroundColor: t.subtle, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
                                <Ionicons name="search" size={20} color={t.muted} />
                                <Text color="muted">Search groceries, medicine, meat…</Text>
                            </Pressable>
                        </View>
                        {data.kinds.length > 1 && (
                            <FlatList horizontal data={['', ...data.kinds]} keyExtractor={(k) => k || 'all'} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                                renderItem={({ item }) => <Chip label={item ? KINDS[item] ?? item : 'All shops'} active={kind === item} onPress={() => setKind(item)} />} />
                        )}
                        {open.length > 0 && !kind && (
                            <View>
                                <View style={{ paddingHorizontal: 16 }}><SectionTitle>Shops near you</SectionTitle></View>
                                <FlatList horizontal data={open.slice(0, 12)} keyExtractor={(s) => `logo-${s.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }} renderItem={({ item }) => <LogoTile s={item} />} />
                            </View>
                        )}
                        {data.shops.length > 0 && <View style={{ paddingHorizontal: 16 }}><SectionTitle>{`All ${data.shops.length} shops near you`}</SectionTitle></View>}
                    </View>
                }
                renderItem={({ item }) => <View style={{ paddingHorizontal: 16 }}><StoreCard s={item} /></View>}
                ListEmptyComponent={<View style={{ padding: 24 }}><Empty emoji="🛒" title="No shops deliver here yet" body={active ? 'Try another address at the top.' : 'Set your delivery address at the top to see shops near you.'} /></View>}
            />
            <CartBar />
        </SafeAreaView>
    );
}

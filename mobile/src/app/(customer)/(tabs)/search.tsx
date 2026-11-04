import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CartBar, StoreCard, type MenuItem, type Store } from '@/features/cards';
import { api } from '@/lib/api';
import { zig } from '@/lib/money';
import { Chip, Empty, Row, SectionTitle, Text, useTheme } from '@/ui';

const FILTERS = [['', 'All'], ['offers', '🔥 Offers'], ['free_delivery', 'Free delivery'], ['fastest', 'Fastest'], ['rating', 'Top rated']] as const;

export default function Search() {
    const t = useTheme();
    const params = useLocalSearchParams<{ cuisine?: string }>();
    const [q, setQ] = useState(params.cuisine ?? '');
    const [filter, setFilter] = useState('');
    const [stores, setStores] = useState<Store[]>([]);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                if (q.length >= 2) {
                    const r = await api.get<{ vendors: Store[]; items: MenuItem[] }>(`/search?q=${encodeURIComponent(q)}`);
                    setStores(r.vendors);
                    setItems(r.items);
                } else {
                    const r = await api.get<{ data: Store[] }>(`/vendors?filter=${filter}`);
                    setStores(r.data);
                    setItems([]);
                }
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [q, filter]);

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
                <Text variant="title">Search</Text>
                <Row gap={10} style={{ height: 50, borderRadius: 99, backgroundColor: t.subtle, paddingHorizontal: 18 }}>
                    <Ionicons name="search" size={18} color={t.muted} />
                    <TextInput value={q} onChangeText={setQ} autoFocus={!params.cuisine} placeholder="Food, stores, groceries" placeholderTextColor={t.faint} returnKeyType="search" style={{ flex: 1, fontSize: 16, color: t.ink }} />
                    {!!q && <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={t.muted} /></Pressable>}
                </Row>
                {q.length < 2 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {FILTERS.map(([v, l]) => <Chip key={v} label={l} active={filter === v} onPress={() => setFilter(v)} />)}
                    </ScrollView>
                )}
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                {loading && <ActivityIndicator style={{ marginTop: 32 }} color={t.brand} />}
                {!loading && items.length > 0 && (
                    <>
                        <SectionTitle>Dishes</SectionTitle>
                        {items.map((i) => (
                            <Pressable key={i.id} onPress={() => router.push(`/store/${i.vendor_id}`)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderColor: t.border }}>
                                <Row justify="space-between"><Text variant="label" style={{ flex: 1 }}>{i.name}</Text><Text variant="label">{zig(i.special_price?.zig ?? i.price.zig)}</Text></Row>
                                <Text variant="caption">{i.vendor?.name}</Text>
                            </Pressable>
                        ))}
                    </>
                )}
                {!loading && stores.length > 0 && (
                    <>
                        <SectionTitle>{q.length >= 2 ? 'Stores' : 'All stores'}</SectionTitle>
                        <View style={{ gap: 24 }}>{stores.map((s) => <StoreCard key={s.id} s={s} />)}</View>
                    </>
                )}
                {!loading && !stores.length && !items.length && <Empty emoji="🔍" title="Nothing found" body="Try a different dish or store name." />}
            </ScrollView>
            <CartBar />
        </SafeAreaView>
    );
}

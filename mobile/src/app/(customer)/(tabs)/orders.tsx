import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { ProductThumb } from '@/features/product-thumb';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Money } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Empty, Row, STATUS_TONE, Text, useTheme } from '@/ui';

interface Order { id: number; reference: string; status: string; created_at: string; totals: { total: Money }; vendor?: { name: string; logo_path?: string | null }; items?: { name: string; quantity: number; image?: string | null }[] }

export default function Orders() {
    const t = useTheme();
    const { me } = useSession();
    const [orders, setOrders] = useState<Order[] | null>(null);
    const load = useCallback(() => {
        if (me) api.get<{ data: Order[] }>('/orders').then((r) => setOrders(r.data)).catch(() => setOrders([]));
    }, [me]);
    useFocusEffect(load);

    if (!me) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}><Empty icon="receipt-outline" title="Your orders live here" body="Sign in to see and track your orders." action={<Button title="Sign in" size="md" onPress={() => router.push('/sign-in')} />} /></SafeAreaView>;

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <FlatList
                data={orders ?? []}
                keyExtractor={(o) => String(o.id)}
                onRefresh={load}
                refreshing={orders === null}
                contentContainerStyle={{ padding: 20, gap: 12 }}
                ListHeaderComponent={<Text variant="title" style={{ marginBottom: 8 }}>Orders</Text>}
                ListEmptyComponent={orders ? <Empty icon="receipt-outline" title="No orders yet" body="Your first order is a few taps away." action={<Button title="Find food" size="md" onPress={() => router.push("/search")} />} /> : undefined}
                renderItem={({ item: o }) => {
                    const live = !['delivered', 'cancelled', 'rejected'].includes(o.status);
                    return (
                        <Pressable onPress={() => router.push(`/order/${o.id}`)} style={({ pressed }) => ({ borderRadius: 20, borderWidth: live ? 1.5 : 1, borderColor: live ? t.brand : t.border, padding: 14, backgroundColor: live ? t.brandSoft : t.surface, gap: 12, opacity: pressed ? 0.92 : 1 })}>
                            <Row justify="space-between" gap={10}>
                                <View style={{ flex: 1 }}>
                                    <Text variant="heading" numberOfLines={1}>{o.vendor?.name}</Text>
                                    <Text variant="caption">{new Date(o.created_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · #{o.reference}</Text>
                                </View>
                                <Badge tone={STATUS_TONE[o.status]}>{label(o.status === 'picked_up' ? 'on_the_way' : o.status)}</Badge>
                            </Row>
                            <Row gap={8}>
                                {(o.items ?? []).slice(0, 4).map((i, k) => (
                                    <View key={k}>
                                        <ProductThumb uri={i.image} size={52} product radius={12} />
                                        {i.quantity > 1 && <View style={{ position: 'absolute', right: -4, top: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, backgroundColor: t.inverse, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" style={{ color: t.onInverse, fontWeight: '800', fontSize: 11 }}>{i.quantity}</Text></View>}
                                    </View>
                                ))}
                                {(o.items?.length ?? 0) > 4 && <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Text variant="label">+{(o.items?.length ?? 0) - 4}</Text></View>}
                                <View style={{ flex: 1, alignItems: 'flex-end' }}><Text variant="heading" style={{ fontSize: 16 }}>{zig(o.totals.total.zig)}</Text><Text variant="caption">{o.items?.reduce((n, i) => n + i.quantity, 0)} items</Text></View>
                            </Row>
                            {live ? (
                                <Row gap={6} style={{ alignSelf: 'flex-start', backgroundColor: t.brand, paddingHorizontal: 14, height: 36, borderRadius: 18 }}><Ionicons name="navigate" size={15} color="#111" /><Text variant="label" style={{ color: '#111' }}>Track order</Text></Row>
                            ) : o.status === 'delivered' ? (
                                <Row gap={6}><Ionicons name="refresh" size={15} color={t.brandText} /><Text variant="label" color="brand">Order again</Text></Row>
                            ) : null}
                        </Pressable>
                    );
                }}
            />
        </SafeAreaView>
    );
}

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type Money } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Empty, Row, STATUS_TONE, Text, useTheme } from '@/ui';

interface Order { id: number; reference: string; status: string; created_at: string; totals: { total: Money }; vendor?: { name: string }; items?: { name: string; quantity: number }[] }

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
                        <Pressable onPress={() => router.push(`/order/${o.id}`)} style={{ borderRadius: 16, borderWidth: live ? 1.5 : 0.5, borderColor: live ? t.brand : t.border, padding: 16, backgroundColor: live ? t.brandSoft : t.surface, gap: 6 }}>
                            <Row justify="space-between"><Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>{o.vendor?.name}</Text><Badge tone={STATUS_TONE[o.status]}>{label(o.status === 'picked_up' ? 'on_the_way' : o.status)}</Badge></Row>
                            <Text variant="caption" numberOfLines={1}>{o.items?.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</Text>
                            <Row justify="space-between"><Text variant="caption">{new Date(o.created_at).toLocaleDateString()} · {o.reference}</Text><Text variant="label">{zig(o.totals.total.zig)}</Text></Row>
                            {live && <View style={{ marginTop: 4 }}><Text variant="label" color="brand">Track order →</Text></View>}
                        </Pressable>
                    );
                }}
            />
        </SafeAreaView>
    );
}

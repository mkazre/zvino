import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { openLink } from '@/lib/links';
import { timeAgo } from '@/lib/money';
import { useOnReconnect } from '@/lib/network';
import { Empty, Row, Text, useTheme } from '@/ui';

interface Note { id: number; type: string; title: string; body: string; data: { link_to?: string; image?: string; order_id?: number } | null; read_at: string | null; created_at: string }

/** Notifications inbox: order updates, announcements and offers, newest first. */
export default function Inbox() {
    const t = useTheme();
    const [items, setItems] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const load = useCallback(() => {
        api.get<{ data: Note[] }>('/notifications').then((r) => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
    }, []);
    useFocusEffect(load);
    useOnReconnect(load);

    const open = (n: Note) => {
        if (!n.read_at) {
            setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
            api.background('POST', '/notifications/read', { ids: [n.id] });
        }
        openLink(n.data?.link_to, n.data ?? undefined);
    };

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 12 }} gap={12}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1, fontSize: 22 }}>Notifications</Text>
                {items.some((n) => !n.read_at) && <Pressable onPress={() => { setItems((l) => l.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() }))); api.background('POST', '/notifications/read', {}); }}><Text variant="label" color="brand">Mark all read</Text></Pressable>}
            </Row>
            <FlatList
                data={items}
                keyExtractor={(n) => String(n.id)}
                onRefresh={load}
                refreshing={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                ListEmptyComponent={loading ? undefined : <Empty emoji="🔔" title="No notifications yet" body="Order updates, offers and news from Zvino show up here." />}
                renderItem={({ item: n }) => (
                    <Pressable onPress={() => open(n)} style={{ paddingVertical: 14, borderBottomWidth: 0.5, borderColor: t.border, flexDirection: 'row', gap: 12 }}>
                        <View style={{ width: 8, paddingTop: 6 }}>{!n.read_at && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.brand }} />}</View>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Row justify="space-between"><Text variant="label" style={{ flex: 1 }}>{n.type === 'announcement' ? '📣  ' : ''}{n.title}</Text><Text variant="caption">{timeAgo(n.created_at)}</Text></Row>
                            <Text color="muted">{n.body}</Text>
                            {n.data?.image && <Image source={{ uri: n.data.image }} style={{ height: 150, borderRadius: 12, marginTop: 6 }} contentFit="cover" />}
                        </View>
                    </Pressable>
                )}
            />
        </SafeAreaView>
    );
}

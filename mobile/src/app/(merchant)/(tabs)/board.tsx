import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { REJECT_REASONS, type MerchantMe, type StoreOrder } from '@/features/merchant';
import { auth, api, ApiError } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, Row, Text, useTheme, Logo } from '@/ui';
import { useT } from '@/lib/i18n';
import { API_URL } from '@/lib/config';
import { Image } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useChannel } from '@/lib/realtime';
import { Bell } from '@/features/bell';
import { useOnReconnect } from '@/lib/network';

type Tab = 'incoming' | 'active' | 'scheduled' | 'done';
const PREP = [10, 15, 20, 30, 45];

/**
 * Store manager: incoming orders (loud, repeating alert until handled), accept with prep time,
 * reject with reason, progress and hand over. Kitchen staff see the same board as kitchen stages.
 */
export default function Board() {
    const [rx, setRx] = useState<number | null>(null);
    const tr = useT();
    const t = useTheme();
    const { me: user } = useSession();
    const kitchen = user?.role === 'kitchen';
    const [me, setMe] = useState<MerchantMe | null>(null);
    const [tab, setTab] = useState<Tab>(kitchen ? 'active' : 'incoming');
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [busyId, setBusyId] = useState<number | null>(null);
    const seen = useRef<Set<number>>(new Set());

    const load = useCallback(async () => {
        const [m, list] = await Promise.all([api.get<MerchantMe>('/merchant/me'), api.get<{ data: StoreOrder[] }>(`/merchant/orders?tab=${tab}`)]).catch(() => [null, null] as const);
        if (m) setMe(m);
        if (list) setOrders(list.data);
    }, [tab]);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    useOnReconnect(() => load());
    useChannel(me?.store?.id ? `vendor.${me.store.id}.orders` : null, 'order.updated', () => load());
    useEffect(() => {
        const timer = setInterval(load, 8000);
        return () => clearInterval(timer);
    }, [load]);

    // Repeat the alert every 15 s while there are unaccepted orders.
    const incoming = kitchen ? orders.filter((o) => o.kitchen_stage === 'new').length : (me?.incoming ?? 0);
    const chime = useAudioPlayer(require('../../../../assets/sounds/new-order.wav'));
    useEffect(() => {
        if (!incoming) return;
        // Loud two-tone chime + vibration, repeating until every new order is accepted / started (#41).
        setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
        const ring = () => {
            Vibration.vibrate([0, 500, 250, 500]);
            chime.seekTo(0);
            chime.play();
        };
        ring();
        const timer = setInterval(ring, kitchen ? 20000 : 10000);
        return () => clearInterval(timer);
    }, [incoming, kitchen, chime]);

    const act = async (o: StoreOrder, path: string, body?: Record<string, unknown>) => {
        setBusyId(o.id);
        try {
            await api.post(`/merchant/orders/${o.id}/${path}`, body);
            seen.current.add(o.id);
            await load();
        } catch (e) {
            Alert.alert('Order', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusyId(null);
        }
    };

    const reject = (o: StoreOrder) => Alert.alert('Decline order?', 'The customer is refunded straight away.', [
        ...REJECT_REASONS.map(([v, l]) => ({ text: l, onPress: () => act(o, 'reject', { reason: v }) })),
        { text: 'Cancel', style: 'cancel' as const },
    ]);

    const tabs: [Tab, string][] = kitchen ? [['active', 'Kitchen']] : [['incoming', `New${incoming ? ` (${incoming})` : ''}`], ['active', 'In progress'], ['scheduled', 'Scheduled'], ['done', 'Done']];

    if (rx) {
        return (
            <View style={{ flex: 1, backgroundColor: '#000' }}>
                <Image source={{ uri: `${API_URL}/api/merchant/orders/${rx}/prescription`, headers: { Authorization: `Bearer ${auth.get()}` } }} style={{ flex: 1 }} contentFit="contain" />
                <Button title="Close" tone="dark" onPress={() => setRx(null)} style={{ margin: 16 }} />
            </View>
        );
    }

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 12 }}>
                <Row justify="space-between"><Logo height={24} /><Bell /></Row>
                <Row justify="space-between">
                    <View>
                        <Text variant="title">{me?.store.name ?? 'Orders'}</Text>
                        <Text variant="caption">{me ? `${me.today.orders} orders today · ${zig(me.today.sales.zig)}` : ''}</Text>
                    </View>
                    {me && <Badge tone={!me.availability.is_open ? 'red' : me.store.is_busy ? 'gold' : 'brand'}>{!me.availability.is_open ? label(me.availability.reason ?? 'closed') : me.store.is_busy ? 'Busy' : 'Open'}</Badge>}
                </Row>
                {me?.store.power_out && <Card tone="gold" style={{ paddingVertical: 10 }}><Text variant="label" style={{ color: '#3d2c03' }}>⚡ Load-shedding mode: power items hidden</Text></Card>}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{tabs.map(([v, l]) => <Chip key={v} label={l} active={tab === v} onPress={() => setTab(v)} />)}</ScrollView>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}>
                {orders.length === 0 && <Empty emoji={tab === 'incoming' ? '🛎️' : '✅'} title={tab === 'incoming' ? 'No new orders' : 'Nothing here'} body={tab === 'incoming' ? 'New orders ring and vibrate the moment they arrive.' : undefined} />}
                {orders.map((o) => {
                    const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
                    const isNew = o.status === 'placed';
                    return (
                        <Card key={o.id} style={{ gap: 10, borderWidth: isNew ? 2 : 0.5, borderColor: isNew ? t.brand : t.border }}>
                            <Row justify="space-between">
                                <Text variant="heading" style={{ fontSize: 20 }}>{o.reference.replace('ZV-', '#')}</Text>
                                <Row gap={6}><Badge tone={o.fulfilment === 'delivery' ? 'neutral' : 'dark'}>{o.source === 'pos' ? 'Counter' : label(o.fulfilment)}</Badge><Badge tone={mins > 25 ? 'red' : 'neutral'}>{`${mins}m`}</Badge></Row>
                            </Row>
                            <Text variant="caption">{o.customer?.name ?? 'Walk-in'} · {label(o.payment_method)} · {zig(o.totals.subtotal.zig)}</Text>
                            <View style={{ gap: 4 }}>
                                {o.items.map((i, k) => (
                                    <View key={k}>
                                        <Text variant="label" style={{ fontSize: 16 }}>{i.quantity}× {i.name}</Text>
                                        {(i.options?.variant || i.options?.modifiers?.length) && <Text variant="caption">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(' · ')}</Text>}
                                        {i.notes && <Text variant="caption" color="gold">⚠ {i.notes}</Text>}
                                    </View>
                                ))}
                            </View>
                            {o.no_cutlery && <Text variant="caption" color="brand">🌿 No cutlery</Text>}
                            {o.has_prescription && <Pressable onPress={() => setRx(o.id)}><Text variant="label" color="red">💊 View prescription before accepting</Text></Pressable>}
                            {o.notes && <Text variant="caption" color="gold">📝 {o.notes}</Text>}
                            {o.driver && <Text variant="caption">🛵 {o.driver.name}</Text>}

                            {isNew && !kitchen && (
                                <View style={{ gap: 8 }}>
                                    <Text variant="label">Ready in…</Text>
                                    <Row gap={8} style={{ flexWrap: 'wrap' }}>
                                        {PREP.map((p) => <Pressable key={p} disabled={busyId === o.id} onPress={() => act(o, 'accept', { prep_minutes: p })} style={{ height: 46, paddingHorizontal: 16, borderRadius: 12, backgroundColor: p === (me?.store.prep_minutes ?? 20) ? t.brand : t.subtle, justifyContent: 'center' }}><Text variant="label" style={{ color: p === (me?.store.prep_minutes ?? 20) ? '#fff' : t.ink }}>{p} min</Text></Pressable>)}
                                    </Row>
                                    <Button title={tr('Decline')} tone="ghost" size="sm" onPress={() => reject(o)} />
                                </View>
                            )}
                            {!isNew && ['accepted', 'preparing'].includes(o.status) && (
                                <Row gap={8}>
                                    <Button style={{ flex: 1 }} tone={o.kitchen_stage === 'new' ? 'dark' : 'primary'} loading={busyId === o.id} title={tr(o.kitchen_stage === 'new' ? 'Start cooking' : 'Mark ready')} onPress={() => act(o, 'advance')} />
                                    {!kitchen && <Button tone="outline" title="+10 min" onPress={() => act(o, 'delay', { minutes: 10 })} />}
                                </Row>
                            )}
                            {o.status === 'ready' && o.fulfilment !== 'delivery' && <Button tone="primary" title="Handed to customer" loading={busyId === o.id} onPress={() => act(o, 'hand-over')} />}
                            {o.status === 'ready' && o.fulfilment === 'delivery' && <Text variant="caption" center>{o.driver ? `Waiting for ${o.driver.name} to collect` : 'Finding a driver…'}</Text>}
                        </Card>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

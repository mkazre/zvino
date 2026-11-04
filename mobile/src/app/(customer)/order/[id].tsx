import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { Button, Card, Loading, Row, Text, useTheme } from '@/ui';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { useChannel } from '@/lib/realtime';
import { useOnReconnect } from '@/lib/network';

interface Order {
    id: number; reference: string; status: string; fulfilment: string; payment_method: string; payment_status: string;
    totals: { total: Money }; items: { name: string; quantity: number; line_total: Money }[];
    vendor: { id: number; name: string; lat: number | null; lng: number | null }; status_history: { status?: string; at: string }[];
    estimated_delivery_at: string | null; driver?: { name: string; phone: string; vehicle: string; plate: string | null; lat: number | null; lng: number | null } | null;
    address?: { line1: string; lat: number | null; lng: number | null } | null;
}
interface Track { status: string; rider: { rider_name?: string } | null; destination: { lat: number | null; lng: number | null } | null; vendor: { lat: number | null; lng: number | null } }

const STEPS = [['placed', 'Order received'], ['accepted', 'Restaurant confirmed'], ['preparing', 'Being prepared'], ['picked_up', 'On the way'], ['delivered', 'Delivered']] as const;
const ORDER = ['pending_payment', 'scheduled', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];
const HEADLINE: Record<string, string> = { placed: 'Waiting for the restaurant…', accepted: 'Confirmed! Getting started', preparing: 'Your food is being prepared', ready: 'Ready, driver on the way to collect', picked_up: 'On the way to you', arriving: 'Almost there!', delivered: 'Delivered. Enjoy! 🎉', cancelled: 'Order cancelled', rejected: 'The restaurant couldn’t take your order', pending_payment: 'Waiting for payment', scheduled: 'Scheduled' };

export default function OrderTracking() {
    const { dataLight } = usePrefs();
    const tr = useT();
    const t = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [order, setOrder] = useState<Order & { delivery_pin?: string } | null>(null);
    const [pin, setPin] = useState<string | null>(null);
    const [split, setSplit] = useState<{ payment_id: number; name: string | null; phone: string; amount: Money; status: string }[]>([]);

    const load = useCallback(async () => {
        const r = await api.get<{ data: Order; delivery_pin?: string; split?: typeof split }>(`/orders/${id}`).catch(() => null);
        if (r) {
            setOrder(r.data);
            setPin(r.delivery_pin ?? null);
            setSplit(r.split ?? []);
        }
    }, [id]);
    useOnReconnect(() => load());
    useChannel(id ? `order.${id}` : null, 'order.updated', () => load());
    useChannel(id ? `order.${id}` : null, 'driver.location', () => load());
    useEffect(() => {
        load();
        const timer = setInterval(load, dataLight ? 30000 : 10000); // Pusher pushes instantly when configured; polling is the fallback
        return () => clearInterval(timer);
    }, [load, dataLight]);

    if (!order) return <Loading />;
    const idx = ORDER.indexOf(order.status === 'ready' ? 'preparing' : order.status === 'arriving' ? 'picked_up' : order.status);
    const done = ['delivered', 'cancelled', 'rejected'].includes(order.status);
    const eta = order.estimated_delivery_at ? new Date(order.estimated_delivery_at) : null;
    const dest = order.address?.lat ? { latitude: order.address.lat, longitude: order.address.lng! } : null;
    const shop = order.vendor.lat ? { latitude: order.vendor.lat, longitude: order.vendor.lng! } : null;

    const cancel = () => Alert.alert('Cancel order?', 'You’ll be refunded to your Zvino wallet.', [{ text: 'Keep order', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: async () => { try { await api.post(`/orders/${order.id}/cancel`, { reason: 'Changed my mind' }); load(); } catch (e) { Alert.alert('Can’t cancel', e instanceof ApiError ? e.friendly : ''); } } }]);

    return (
        <View style={{ flex: 1, backgroundColor: t.bg }}>
            {order.fulfilment === 'delivery' && !done && !dataLight && (dest || shop) ? (
                <MapView style={{ height: 300 }} initialRegion={{ ...(dest ?? shop)!, latitudeDelta: 0.04, longitudeDelta: 0.04 }}>
                    {shop && <Marker coordinate={shop} title={order.vendor.name} pinColor="#222222" />}
                    {dest && <Marker coordinate={dest} title="You" pinColor="#17C74A" />}
                </MapView>
            ) : <View style={{ height: 110, backgroundColor: t.brand }} />}
            <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 16 }}>
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={20} color="#222222" /></Pressable>
            </SafeAreaView>
            <ScrollView style={{ marginTop: -24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
                <View>
                    <Text variant="caption">{order.reference} · {order.vendor.name}</Text>
                    <Text variant="title" style={{ marginTop: 4 }}>{HEADLINE[order.status] ?? label(order.status)}</Text>
                    {eta && !done && <Text color="muted">Estimated arrival {eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
                </View>

                {!['cancelled', 'rejected'].includes(order.status) && (
                    <View>
                        {STEPS.filter(([k]) => order.fulfilment === 'delivery' || k !== 'picked_up').map(([k, l], i, arr) => {
                            const reached = ORDER.indexOf(k) <= idx;
                            const at = order.status_history.find((h) => h.status === k)?.at;
                            return (
                                <Row key={k} align="flex-start" gap={14}>
                                    <View style={{ alignItems: 'center' }}>
                                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: reached ? t.brand : t.subtle, alignItems: 'center', justifyContent: 'center' }}>{reached && <Ionicons name="checkmark" size={16} color="#fff" />}</View>
                                        {i < arr.length - 1 && <View style={{ width: 2, height: 26, backgroundColor: ORDER.indexOf(arr[i + 1][0]) <= idx ? t.brand : t.subtle }} />}
                                    </View>
                                    <View style={{ paddingTop: 2 }}><Text variant="label" color={reached ? 'ink' : 'muted'}>{tr(l)}</Text>{at && <Text variant="caption">{new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}</View>
                                </Row>
                            );
                        })}
                    </View>
                )}

                {order.driver && !done && (
                    <Card>
                        <Row>
                            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text variant="heading" color="brand">{order.driver.name[0]}</Text></View>
                            <View style={{ flex: 1 }}><Text variant="heading">{order.driver.name}</Text><Text variant="caption">{label(order.driver.vehicle ?? 'motorbike')} {order.driver.plate ? `· ${order.driver.plate}` : ''}</Text></View>
                            <Pressable onPress={() => Linking.openURL(`tel:${order.driver!.phone}`)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="call" size={20} color={t.ink} /></Pressable>
                        </Row>
                    </Card>
                )}
                {pin && !done && <Card tone="subtle"><Text variant="label">Delivery PIN</Text><Text variant="display" style={{ letterSpacing: 8 }}>{pin}</Text><Text variant="caption">Give this to your driver at the gate.</Text></Card>}

                {split.length > 0 && order.status === 'pending_payment' && (
                    <Card style={{ gap: 8 }}>
                        <Text variant="heading">Split the bill</Text>
                        {split.map((s) => (
                            <Row key={s.payment_id} justify="space-between">
                                <View style={{ flex: 1 }}><Text variant="label">{s.name || s.phone}</Text><Text variant="caption">{zig(s.amount.zig)} · {s.status === 'paid' ? 'Paid ✓' : ['failed', 'cancelled'].includes(s.status) ? 'Declined' : 'Waiting…'}</Text></View>
                                {s.status !== 'paid' && (
                                    <Row gap={10}>
                                        <Pressable onPress={() => api.post(`/orders/${order.id}/split/${s.payment_id}/resend`, {}).then(load).catch((e) => Alert.alert('Resend', e instanceof ApiError ? e.friendly : ''))}><Text variant="label" color="brand">Resend</Text></Pressable>
                                        <Pressable onPress={() => api.post(`/orders/${order.id}/split/${s.payment_id}/resend`, { pay_myself: true }).then(load).catch((e) => Alert.alert('Pay', e instanceof ApiError ? e.friendly : ''))}><Text variant="label">I’ll pay</Text></Pressable>
                                    </Row>
                                )}
                            </Row>
                        ))}
                    </Card>
                )}

                <Card>
                    <Text variant="heading" style={{ marginBottom: 8 }}>Your order</Text>
                    {order.items.map((i, k) => <Row key={k} justify="space-between" style={{ paddingVertical: 4 }}><Text>{i.quantity}× {i.name}</Text><Text>{zig(i.line_total.zig)}</Text></Row>)}
                    <Row justify="space-between" style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderColor: t.border }}><Text variant="label">Total · {label(order.payment_method)}</Text><Text variant="label">{zig(order.totals.total.zig)}</Text></Row>
                </Card>
                {['pending_payment', 'scheduled', 'placed'].includes(order.status) && <Button title={tr('Cancel order')} tone="outline" onPress={cancel} />}
                {order.status === 'delivered' && <Button title={tr('Reorder')} onPress={() => router.push(`/store/${order.vendor.id}`)} />}
                {['delivered', 'accepted', 'preparing', 'ready', 'picked_up', 'scheduled', 'placed'].includes(order.status) && <Button title="🔁  Make this a regular order" tone="ghost" onPress={() => router.push(`/plans?fromOrder=${order.id}`)} />}
            </ScrollView>
        </View>
    );
}

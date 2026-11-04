import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { currentPosition, useLocationSharing, type DriverMe, type HeatCell, type Job, type Offer } from '@/features/driver';
import { SafetyBanner } from '@/features/safety';
import { api, ApiError } from '@/lib/api';
import { zig } from '@/lib/money';
import { Badge, Button, Card, Loading, Row, Text, useTheme, Logo } from '@/ui';
import { useT } from '@/lib/i18n';
import { useChannel } from '@/lib/realtime';

export default function Shift() {
    const tr = useT();
    const t = useTheme();
    const [me, setMe] = useState<DriverMe | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [toggling, setToggling] = useState(false);
    const [, tick] = useState(0);

    const load = useCallback(async () => {
        try {
            const d = await api.get<DriverMe>('/driver/me');
            setMe(d);
            if (d.status === 'approved') {
                setJobs(await api.get<Job[]>('/driver/jobs'));
                if (d.is_online) setOffers(await api.get<Offer[]>('/driver/offers'));
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) router.replace('/driver-apply');
        }
    }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    useLocationSharing(!!me?.is_online, me?.location_interval_seconds ?? 10);

    // Offers ring instantly over Pusher when configured (polling below is the fallback).
    useChannel(me?.is_online ? `driver.${me.id}` : null, 'offer.created', () => { api.get<Offer[]>('/driver/offers').then(setOffers).catch(() => {}); });
    // Poll for offers while online (Pusher rings instantly when configured).
    useEffect(() => {
        if (!me?.is_online) return;
        const timer = setInterval(async () => {
            const next = await api.get<Offer[]>('/driver/offers').catch(() => null);
            if (!next) return;
            setOffers((prev) => {
                if (next.some((o) => !prev.find((p) => p.id === o.id))) {
                    Vibration.vibrate([0, 400, 200, 400]);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                }
                return next;
            });
        }, 5000);
        const countdown = setInterval(() => tick((n) => n + 1), 1000);
        return () => { clearInterval(timer); clearInterval(countdown); };
    }, [me?.is_online]);

    const toggle = async (online: boolean) => {
        setToggling(true);
        try {
            const pos = online ? await currentPosition() : {};
            setMe(await api.post<DriverMe>('/driver/online', { is_online: online, ...pos }));
            if (!online) setOffers([]);
        } catch (e) {
            Alert.alert('Can’t change status', e instanceof ApiError ? e.friendly : (e as Error).message);
        } finally {
            setToggling(false);
        }
    };

    const respond = async (o: Offer, accept: boolean) => {
        try {
            if (accept) {
                const job = await api.post<Job>(`/driver/offers/${o.id}/accept`);
                router.push(`/job/${job.id}`);
            } else await api.post(`/driver/offers/${o.id}/decline`);
            setOffers((xs) => xs.filter((x) => x.id !== o.id));
            load();
        } catch (e) {
            Alert.alert('Offer', e instanceof ApiError ? e.friendly : 'This offer is no longer available.');
            load();
        }
    };

    const sos = () => Alert.alert('Emergency', 'Send your location to Zvino operations now?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send SOS', style: 'destructive', onPress: async () => { const p = await currentPosition().catch(() => null); if (p) { const r = await api.post<{ emergency: { police: string } }>('/driver/sos', p).catch(() => null); Alert.alert('Help is on the way', `Zvino ops has your location. Police: ${r?.emergency.police ?? '995'}`); } } },
    ]);

    if (!me) return <Loading />;
    if (me.status !== 'approved') {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: 24, justifyContent: 'center', gap: 12 }}>
                <Text style={{ fontSize: 48 }}>{me.status === 'applied' ? '⏳' : '⛔'}</Text>
                <Text variant="title">{me.status === 'applied' ? 'Application under review' : `Account ${me.status}`}</Text>
                <Text color="muted">{me.status === 'applied' ? 'We’re checking your documents. You’ll get a notification as soon as you’re approved, usually within 1–2 days.' : 'Please contact Zvino support.'}</Text>
                <Button title="Check documents" tone="outline" onPress={() => router.push('/driver-apply')} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: me.is_online ? t.bg : t.canvas }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
                <Logo height={26} />
                <Row justify="space-between">
                    <View><Text variant="caption">Today</Text><Text variant="display">{zig(me.today.zig)}</Text></View>
                    <Pressable onPress={sos} style={{ backgroundColor: t.red, borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10 }}><Text variant="label" style={{ color: '#fff' }}>SOS</Text></Pressable>
                </Row>

                <Card tone={me.is_online ? 'brand' : 'inverse'} style={{ paddingVertical: 20 }}>
                    <Row justify="space-between">
                        <View style={{ flex: 1 }}>
                            <Text variant="title" style={{ color: '#fff' }}>{tr(me.is_online ? 'You’re online' : 'You’re offline')}</Text>
                            <Text variant="caption" style={{ color: 'rgba(255,255,255,0.75)' }}>{me.is_online ? 'Looking for deliveries near you…' : 'Go online to start receiving jobs.'}</Text>
                        </View>
                        <Switch value={me.is_online} disabled={toggling} onValueChange={toggle} trackColor={{ true: '#17C74A', false: '#3b403d' }} thumbColor="#fff" style={{ transform: [{ scale: 1.25 }] }} />
                    </Row>
                </Card>

                {me.cash_held.zig > 0 && (
                    <Card tone="gold" onPress={() => router.push('/earnings')}>
                        <Text variant="label" style={{ color: '#3d2c03' }}>You’re holding {zig(me.cash_held.zig)} cash</Text>
                        <Text variant="caption" style={{ color: '#6b4e05' }}>Remit by EcoCash from Earnings to keep receiving cash orders.</Text>
                    </Card>
                )}

                {offers.map((o) => {
                    const left = Math.max(0, o.seconds_left);
                    return (
                        <Card key={o.id} style={{ borderWidth: 2, borderColor: t.brand, gap: 10 }}>
                            <Row justify="space-between"><Badge tone="brand">New delivery</Badge><Text variant="label" color={left < 10 ? 'red' : 'muted'}>{left}s</Text></Row>
                            <Text variant="display">{zig(o.pay.zig)}</Text>
                            {o.tip.zig > 0 && <Text variant="caption" color="brand">Includes {zig(o.tip.zig)} tip</Text>}
                            <Row gap={10}><Ionicons name="storefront-outline" size={18} color={t.ink} /><Text variant="label" style={{ flex: 1 }}>{o.store.name}</Text><Text variant="caption">{o.pickup_km ?? '?'} km away</Text></Row>
                            <Row gap={10}><Ionicons name="location-outline" size={18} color={t.ink} /><Text variant="label" style={{ flex: 1 }}>{o.dropoff_area ?? 'Customer'}</Text><Text variant="caption">{o.dropoff_km ?? '?'} km trip</Text></Row>
                            {o.collect_cash && <Badge tone="gold">{`Collect ${zig(o.collect_cash.zig)} cash`}</Badge>}
                            {o.safety && <SafetyBanner s={o.safety} />}
                            <Row gap={10} style={{ marginTop: 6 }}>
                                <Button title={tr('Decline')} tone="outline" style={{ flex: 1 }} onPress={() => respond(o, false)} />
                                <Button title={tr('Accept')} tone="primary" style={{ flex: 2 }} onPress={() => respond(o, true)} />
                            </Row>
                        </Card>
                    );
                })}

                {me.is_online && offers.length === 0 && jobs.length === 0 && <Heatmap />}

                {jobs.length > 0 && <Text variant="heading" style={{ marginTop: 6 }}>Active deliveries</Text>}
                {jobs.map((j) => (
                    <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)}>
                        <Row justify="space-between"><Text variant="heading">{j.store.name}</Text><Badge tone="brand">{j.status === 'picked_up' || j.status === 'arriving' ? 'Delivering' : 'Pick up'}</Badge></Row>
                        <Text variant="caption">{j.reference} · {j.dropoff?.suburb ?? j.dropoff?.city} · {zig(j.pay.zig)}</Text>
                    </Card>
                ))}

                <Row gap={12} style={{ marginTop: 6 }}>
                    <Card style={{ flex: 1 }}><Text variant="caption">Rating</Text><Text variant="heading">★ {me.rating.toFixed(2)}</Text></Card>
                    <Card style={{ flex: 1 }}><Text variant="caption">Acceptance</Text><Text variant="heading">{Math.round(me.acceptance_rate)}%</Text></Card>
                    <Card style={{ flex: 1 }}><Text variant="caption">Trips</Text><Text variant="heading">{me.completed_deliveries}</Text></Card>
                </Row>
            </ScrollView>
        </SafeAreaView>
    );
}

/** Demand heatmap: the busiest pickup areas right now, nearest first among the hottest. */
function Heatmap() {
    const t = useTheme();
    const tr = useT();
    const [cells, setCells] = useState<HeatCell[]>([]);
    useEffect(() => {
        const load = () => api.get<{ cells: HeatCell[] }>('/driver/heatmap').then((r) => setCells(r.cells)).catch(() => {});
        load();
        const timer = setInterval(load, 120000);
        return () => clearInterval(timer);
    }, []);
    if (!cells.length) return null;
    return (
        <Card style={{ gap: 10 }}>
            <Text variant="heading">🔥 {tr('Busy areas right now')}</Text>
            {cells.slice(0, 5).map((c) => (
                <Pressable key={`${c.lat},${c.lng}`} onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`)}>
                    <Row gap={10}>
                        <View style={{ width: 44, height: 8, borderRadius: 4, backgroundColor: t.subtle, overflow: 'hidden' }}><View style={{ width: `${Math.max(10, c.intensity * 100)}%`, height: 8, backgroundColor: c.intensity > 0.66 ? '#c8102e' : c.intensity > 0.33 ? '#D9A520' : t.brand }} /></View>
                        <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{c.label || 'Busy area'}</Text>
                        <Text variant="caption">{c.km != null ? `${c.km} km` : ''}</Text>
                    </Row>
                </Pressable>
            ))}
            <Text variant="caption">Based on orders in the last hour and this time on recent weeks. Tap to navigate.</Text>
        </Card>
    );
}

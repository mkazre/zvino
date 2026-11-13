import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { currentPosition, useLocationSharing, type DriverMe, type DriverRoute, type HeatCell, type Job } from '@/features/driver';
import { api, ApiError } from '@/lib/api';
import { zig } from '@/lib/money';
import { Badge, Button, Card, Loading, Row, Text, useTheme, Logo } from '@/ui';
import { useT } from '@/lib/i18n';
import { Bell } from '@/features/bell';

export default function Shift() {
    const tr = useT();
    const t = useTheme();
    const [me, setMe] = useState<DriverMe | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [route, setRoute] = useState<DriverRoute | null>(null);
    const [toggling, setToggling] = useState(false);

    const load = useCallback(async () => {
        try {
            const d = await api.get<DriverMe>('/driver/me');
            setMe(d);
            if (d.status === 'approved') {
                const js = await api.get<Job[]>('/driver/jobs');
                setJobs(js);
                setRoute(js.length > 1 ? await api.get<DriverRoute>('/driver/route').catch(() => null) : null);
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 403) router.replace('/driver-apply');
        }
    }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));

    useLocationSharing(!!me?.is_online, me?.location_interval_seconds ?? 10);

    // Job offers pop up from OfferCenter (driver layout) over every screen.

    const toggle = async (online: boolean) => {
        setToggling(true);
        try {
            const pos = online ? await currentPosition() : {};
            setMe(await api.post<DriverMe>('/driver/online', { is_online: online, ...pos }));
        } catch (e) {
            Alert.alert('Can’t change status', e instanceof ApiError ? e.friendly : (e as Error).message);
        } finally {
            setToggling(false);
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
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: me.status === 'applied' ? t.goldSoft : t.redSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={me.status === 'applied' ? 'hourglass-outline' : 'close-circle-outline'} size={34} color={me.status === 'applied' ? t.goldText : t.red} /></View>
                <Text variant="title">{me.status === 'applied' ? 'Application under review' : `Account ${me.status}`}</Text>
                <Text color="muted">{me.status === 'applied' ? 'We’re checking your documents. You’ll get a notification as soon as you’re approved, usually within 1–2 days.' : 'Please contact Zvino support.'}</Text>
                <Button title="Check documents" tone="outline" onPress={() => router.push('/driver-apply')} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: me.is_online ? t.bg : t.canvas }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
                <Row justify="space-between"><Logo height={26} /><Bell /></Row>
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

                {me.is_online && jobs.length === 0 && <Heatmap />}

                {route && route.stops.length > 1 && <RouteCard route={route} jobs={jobs} />}

                {jobs.length > 0 && <Text variant="heading" style={{ marginTop: 6 }}>Active deliveries</Text>}
                {jobs.map((j) => (
                    <Card key={j.id} onPress={() => router.push(`/job/${j.id}`)}>
                        <Row justify="space-between"><Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>{j.stop && (j.stops_total ?? 0) > 1 ? `${j.stop}. ` : ''}{j.store.name}</Text><Badge tone="brand">{j.status === 'picked_up' || j.status === 'arriving' ? 'Delivering' : 'Pick up'}</Badge></Row>
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

/** Multi-order run: numbered stops (collect first, then the shortest drop-off order) and one-tap navigation. */
function RouteCard({ route, jobs }: { route: DriverRoute; jobs: Job[] }) {
    const t = useTheme();
    const open = (s: DriverRoute['stops'][number]) => {
        const id = s.order_id ?? s.order_ids?.[0];
        if (id && jobs.some((j) => j.id === id)) router.push(`/job/${id}`);
    };
    const pickups = route.stops.filter((s) => s.type === 'pickup').length;
    const drops = route.stops.filter((s) => s.type === 'dropoff').length;
    return (
        <Card style={{ gap: 12, borderWidth: 1.5, borderColor: t.brand }}>
            <Row justify="space-between">
                <View style={{ flex: 1 }}>
                    <Text variant="heading">Your route</Text>
                    <Text variant="caption">{route.orders} orders · {pickups ? `${pickups} pickup${pickups > 1 ? 's' : ''} · ` : ''}{drops} drop-off{drops !== 1 ? 's' : ''} · ~{route.total_km} km</Text>
                </View>
                <Badge tone="brand">Best order</Badge>
            </Row>
            <View>
                {route.stops.map((s, i) => {
                    const last = i === route.stops.length - 1;
                    return (
                        <Pressable key={`${s.type}-${s.number}`} onPress={() => open(s)} accessibilityLabel={`Stop ${s.number}: ${s.type === 'pickup' ? 'collect from' : 'deliver to'} ${s.name}`}>
                            <Row align="flex-start" gap={12}>
                                <View style={{ alignItems: 'center', width: 30 }}>
                                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: s.type === 'pickup' ? t.inverse : t.brand, alignItems: 'center', justifyContent: 'center' }}>
                                        <Text variant="label" style={{ color: s.type === 'pickup' ? t.onInverse : '#111' }}>{s.number}</Text>
                                    </View>
                                    {!last && <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: t.border, marginVertical: 2 }} />}
                                </View>
                                <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
                                    <Row justify="space-between" gap={8}>
                                        <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{s.type === 'pickup' ? `Collect · ${s.name}` : s.name}</Text>
                                        {s.km != null && <Text variant="caption">{s.km} km</Text>}
                                    </Row>
                                    <Text variant="caption" numberOfLines={1}>{s.type === 'pickup' ? `${s.references?.length ?? 1} order${(s.references?.length ?? 1) > 1 ? 's' : ''}: #${(s.references ?? []).join(', #')}` : `#${s.reference}${s.address ? ` · ${s.address}` : ''}`}</Text>
                                </View>
                            </Row>
                        </Pressable>
                    );
                })}
            </View>
            {route.nav_url && <Button title="Start route in Maps" tone="primary" onPress={() => Linking.openURL(route.nav_url!)} />}
        </Card>
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
            <Text variant="heading">{tr('Busy areas right now')}</Text>
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

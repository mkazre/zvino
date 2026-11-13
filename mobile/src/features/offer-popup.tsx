import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Modal, PanResponder, Pressable, ScrollView, Vibration, View } from 'react-native';
import { type DriverMe, type Job, type Offer } from '@/features/driver';
import { SafetyBanner } from '@/features/safety';
import { api, ApiError } from '@/lib/api';
import { useDeviceInsets } from '@/lib/insets';
import { fmtUsd, zig } from '@/lib/money';
import { useChannel } from '@/lib/realtime';
import { resumeSlipUploads } from '@/lib/slip-upload';
import { Badge, Row, Text, useTheme } from '@/ui';

const POLL_MS = 5000;
type Closed = { id: number; reason: 'taken' | 'assigned' | 'expired' | 'accepted' | 'stacked' };

/**
 * Job offers for drivers, on every driver screen (also while shopping or delivering, so busy drivers
 * can stack jobs onto their run). Every suitable driver near the store sees the job at once; the first
 * to slide "Accept" gets it, and everyone else's popup closes with "Taken by another driver".
 * Offers arrive over Pusher instantly, with polling as the fallback and a push notification when the
 * app is in the background.
 */
export function OfferCenter() {
    const [me, setMe] = useState<DriverMe | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [closed, setClosed] = useState<Closed | null>(null);
    const deadlines = useRef(new Map<number, number>());
    const seen = useRef(new Set<number>());

    const loadMe = useCallback(() => api.get<DriverMe>('/driver/me').then(setMe).catch(() => {}), []);
    const load = useCallback(async () => {
        const next = await api.get<Offer[]>('/driver/offers').catch(() => null);
        if (!next) return;
        const now = Date.now();
        for (const o of next) if (!deadlines.current.has(o.id)) deadlines.current.set(o.id, now + Math.max(0, o.seconds_left) * 1000);
        const fresh = next.some((o) => !seen.current.has(o.id));
        next.forEach((o) => seen.current.add(o.id));
        if (fresh) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setOffers(next);
    }, []);

    useEffect(() => {
        loadMe();
        resumeSlipUploads(); // till slips that hadn't finished uploading carry on
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { loadMe(); load(); } });
        const meTimer = setInterval(loadMe, 30000);
        return () => { sub.remove(); clearInterval(meTimer); };
    }, [loadMe, load]);

    const active = me?.status === 'approved' && me.is_online;
    useEffect(() => {
        if (!active) { setOffers([]); return; }
        load();
        const timer = setInterval(load, POLL_MS);
        return () => clearInterval(timer);
    }, [active, load]);

    const channel = me?.status === 'approved' ? `driver.${me.id}` : null;
    useChannel(channel, 'offer.created', () => { loadMe(); load(); });
    useChannel<{ offer_id: number; reason: Closed['reason'] }>(channel, 'offer.closed', (d) => {
        setOffers((xs) => {
            if (xs.some((x) => x.id === d.offer_id)) setClosed({ id: d.offer_id, reason: d.reason });
            return xs.filter((x) => x.id !== d.offer_id);
        });
    });
    useChannel<{ order_id: number }>(channel, 'job.assigned', (d) => {
        Vibration.vibrate([0, 300, 150, 300]);
        router.push(`/job/${d.order_id}`);
    });

    // Drop offers whose time ran out.
    const [, tick] = useState(0);
    useEffect(() => {
        if (!offers.length) return;
        const c = setInterval(() => {
            tick((n) => n + 1);
            setOffers((xs) => xs.filter((x) => (deadlines.current.get(x.id) ?? 0) > Date.now()));
        }, 500);
        return () => clearInterval(c);
    }, [offers.length]);

    // Clear the "taken" notice after a moment.
    useEffect(() => {
        if (!closed) return;
        const id = setTimeout(() => setClosed(null), 2200);
        return () => clearTimeout(id);
    }, [closed]);

    const respond = async (o: Offer, accept: boolean) => {
        setOffers((xs) => xs.filter((x) => x.id !== o.id));
        try {
            if (!accept) {
                await api.post(`/driver/offers/${o.id}/decline`);
                return;
            }
            const job = await api.post<Job>(`/driver/offers/${o.id}/accept`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            if (o.batch) setClosed({ id: o.id, reason: 'stacked' }); // keep shopping/driving; it's on the route
            else router.push(`/job/${job.id}`);
        } catch (e) {
            const taken = e instanceof ApiError && (e.status === 409 || e.status === 410);
            setClosed({ id: o.id, reason: taken && e.status === 409 ? 'taken' : 'expired' });
        }
    };

    const current = offers[0];
    return (
        <>
            {current && <OfferSheet key={current.id} offer={current} more={offers.length - 1} deadline={deadlines.current.get(current.id) ?? Date.now()} onRespond={respond} />}
            {closed && !current && <ClosedNotice reason={closed.reason} />}
        </>
    );
}

function OfferSheet({ offer: o, more, deadline, onRespond }: { offer: Offer; more: number; deadline: number; onRespond: (o: Offer, accept: boolean) => void }) {
    const t = useTheme();
    const nav = useDeviceInsets();
    const total = Math.max(1, (deadline - Date.now()) / 1000);
    const [left, setLeft] = useState(total);
    const bar = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        // Ring the phone until the driver decides (or the offer runs out).
        Vibration.vibrate([0, 700, 500], true);
        Animated.timing(bar, { toValue: 0, duration: total * 1000, useNativeDriver: false }).start();
        const c = setInterval(() => setLeft(Math.max(0, (deadline - Date.now()) / 1000)), 250);
        return () => { Vibration.cancel(); clearInterval(c); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const decide = (accept: boolean) => { Vibration.cancel(); onRespond(o, accept); };
    const secs = Math.ceil(left);
    const urgent = secs <= 10;
    const shop = o.shopping;

    return (
        <Modal visible transparent animationType="slide" onRequestClose={() => decide(false)} statusBarTranslucent>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', maxHeight: '92%' }}>
                    {/* Time left */}
                    <View style={{ height: 6, backgroundColor: t.subtle }}>
                        <Animated.View style={{ height: 6, backgroundColor: urgent ? t.red : t.brand, width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
                    </View>
                    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 16, gap: 14 }} bounces={false}>
                        <Row justify="space-between">
                            <Row gap={8}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.brand }} />
                                <Text variant="label">{o.batch ? 'Add to your run' : shop ? 'Shop & deliver' : 'New delivery'}</Text>
                                {more > 0 && <Badge tone="dark">{`+${more} more`}</Badge>}
                            </Row>
                            <Row gap={4}><Ionicons name="time-outline" size={16} color={urgent ? t.red : t.muted} /><Text variant="label" style={{ color: urgent ? t.red : t.muted, fontVariant: ['tabular-nums'] }}>{secs}s</Text></Row>
                        </Row>

                        {/* What you'll earn */}
                        <View style={{ alignItems: 'center', gap: 2, paddingVertical: 4 }}>
                            <Text variant="caption">You earn</Text>
                            <Text variant="display" style={{ fontSize: 44, lineHeight: 50 }}>{zig(o.pay.zig)}</Text>
                            <Row gap={6} style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
                                <Text variant="caption">{fmtUsd(o.pay.usd)}</Text>
                                {o.tip.zig > 0 && <Badge tone="brand">{`incl. ${zig(o.tip.zig)} tip`}</Badge>}
                                {(o.boost_pct ?? 0) > 0 && <Badge tone="gold">{`Boosted +${o.boost_pct}%`}</Badge>}
                            </Row>
                        </View>

                        {(o.competing ?? 1) > 1 && (
                            <Row gap={8} style={{ alignSelf: 'center', backgroundColor: t.goldSoft, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99 }}>
                                <Ionicons name="people" size={15} color={t.goldText} />
                                <Text variant="caption" style={{ color: t.goldText, fontWeight: '700' }}>{o.competing} drivers see this · first to accept gets it</Text>
                            </Row>
                        )}

                        {/* The trip */}
                        <View style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.border, padding: 14, gap: 12 }}>
                            <Leg icon="navigate" title={o.store.name} sub={o.store.address ?? 'Store'} km={o.pickup_km} label="to store" />
                            <View style={{ marginLeft: 15, height: 14, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: t.border }} />
                            <Leg icon="home" title={o.dropoff_area ?? 'Customer'} sub="Drop-off area" km={o.dropoff_km} label="to customer" />
                        </View>

                        <Row gap={8}>
                            <Stat label="Order size" value={o.order_value ? fmtUsd(o.order_value.usd) : '-'} />
                            <Stat label="Whole trip" value={o.trip_km ? `${o.trip_km} km` : '-'} sub={o.trip_minutes ? `~${o.trip_minutes} min` : undefined} />
                            <Stat label="Per km" value={o.per_km ? zig(o.per_km.zig) : '-'} />
                        </Row>

                        <Row gap={6} style={{ flexWrap: 'wrap' }}>
                            {shop && <Badge tone="dark">{`${shop.items} items · till ~$${shop.expected_till_usd.toFixed(2)}`}</Badge>}
                            {o.batch && <Badge tone="gold">{`+${o.batch.extra_km} km${o.batch.extra_min ? ` · +${o.batch.extra_min} min` : ''} on your run`}</Badge>}
                            {o.food_ready && <Badge tone="brand">Food is ready</Badge>}
                            {o.collect_cash && <Badge tone="gold">{`Collect ${zig(o.collect_cash.zig)} cash`}</Badge>}
                            {!o.collect_cash && <Badge>{o.payment_method === 'cash' ? 'Cash' : 'Paid online'}</Badge>}
                        </Row>
                        {o.safety && <SafetyBanner s={o.safety} />}
                    </ScrollView>

                    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 + nav.bottom, gap: 10 }}>
                        <SlideToAccept onAccept={() => decide(true)} />
                        <Pressable onPress={() => decide(false)} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
                            <Text variant="label" color="muted">Pass, let someone else take it</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

function Leg({ icon, title, sub, km, label }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; km: number | null; label: string }) {
    const t = useTheme();
    return (
        <Row gap={12}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={16} color={t.brandText} /></View>
            <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>{title}</Text>
                <Text variant="caption" numberOfLines={1}>{sub}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                <Text variant="heading" style={{ fontSize: 16 }}>{km != null ? `${km} km` : '-'}</Text>
                <Text variant="caption">{label}</Text>
            </View>
        </Row>
    );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    const t = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: t.subtle, borderRadius: 16, padding: 12, gap: 2 }}>
            <Text variant="caption">{label}</Text>
            <Text variant="heading" style={{ fontSize: 16 }} numberOfLines={1}>{value}</Text>
            {sub ? <Text variant="caption">{sub}</Text> : null}
        </View>
    );
}

/** Slide to accept, so a job is never taken by an accidental tap in a pocket or on a bumpy road. */
function SlideToAccept({ onAccept }: { onAccept: () => void }) {
    const t = useTheme();
    const [width, setWidth] = useState(0);
    const x = useRef(new Animated.Value(0)).current;
    const done = useRef(false);
    const KNOB = 56;
    const max = Math.max(1, width - KNOB - 8);
    const maxRef = useRef(max);
    maxRef.current = max;
    const acceptRef = useRef(onAccept);
    acceptRef.current = onAccept;

    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))),
        onPanResponderRelease: (_, g) => {
            if (g.dx >= maxRef.current * 0.85 && !done.current) {
                done.current = true;
                Animated.timing(x, { toValue: maxRef.current, duration: 80, useNativeDriver: false }).start(() => acceptRef.current());
            } else {
                Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
            }
        },
    })).current;

    return (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel="Slide to accept the job"
            accessibilityActions={[{ name: 'activate', label: 'Accept' }]} onAccessibilityAction={() => onAccept()}
            style={{ height: 64, borderRadius: 32, backgroundColor: t.brand, justifyContent: 'center', padding: 4 }}>
            <Text variant="heading" style={{ position: 'absolute', alignSelf: 'center', color: t.onBrand }}>Slide to accept</Text>
            <Animated.View {...pan.panHandlers} style={{ width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: x }], elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6 }}>
                <Ionicons name="arrow-forward" size={26} color="#111111" />
            </Animated.View>
        </View>
    );
}

function ClosedNotice({ reason }: { reason: Closed['reason'] }) {
    const t = useTheme();
    const msg = { taken: 'Taken by another driver', assigned: 'Assigned by Zvino to another driver', expired: 'This job is no longer available', accepted: 'Job accepted', stacked: 'Added to your run. See Your route.' }[reason];
    const good = reason === 'stacked' || reason === 'accepted';
    return (
        // A toast over the current screen (not a modal), so it never blocks the driver's taps.
        <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 90 }}>
            <Row gap={10} style={{ backgroundColor: good ? t.brand : t.inverse, borderRadius: 18, padding: 16, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12 }}>
                <Ionicons name={good ? 'checkmark-circle' : 'flash-outline'} size={22} color={good ? t.onBrand : t.onInverse} />
                <Text variant="label" style={{ flex: 1, color: good ? t.onBrand : t.onInverse }}>{msg}</Text>
            </Row>
        </View>
    );
}

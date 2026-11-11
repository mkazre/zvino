import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { label, zig } from '@/lib/money';
import { Button, Card, Loading, Row, Text, useTheme } from '@/ui';
import { useT } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { useChannel } from '@/lib/realtime';
import { useOnReconnect } from '@/lib/network';
import { LiveTrack } from '@/features/live-track';
import { TicketSheet } from '@/features/ticket-sheet';

/** Mirrors App\Support\OrderView (the same data drives the website order page). */
interface OrderView {
    id: number; reference: string; status: string; fulfilment: 'delivery' | 'pickup'; is_done: boolean; placed_at: string;
    time: { label: string; at: string | null; trend?: { type: 'early' | 'late'; minutes: number; text: string } | null };
    banner: { key: string; image: string; title: string; subtitle: string | null };
    review_banner: string | null;
    timeline: { key: string; label: string; at: string | null; state: 'done' | 'current' | 'upcoming' | 'stopped'; detail: string | null }[];
    store: { id: number; name: string; logo: string | null; address: string | null; phone: string | null; lat: number | null; lng: number | null };
    driver: { name: string; phone: string; vehicle: string; plate: string | null; rating: number; lat: number | null; lng: number | null; located_at?: string | null; stops_before?: number } | null;
    live?: boolean;
    shopping?: {
        pref: string; started: boolean; finished: boolean; done: number; total: number;
        changes: { name: string; status: 'missing' | 'partial' | 'replaced'; quantity: number; found_qty: number | null; replacement: { name: string; quantity: number } | null; refund: Money | null }[];
        refund: Money | null;
    } | null;
    delivery_pin: string | null; can_cancel: boolean; review: { vendor_rating: number } | null;
    receipt: { lines: { name: string; quantity: number; options: string[]; notes: string | null; unit: Money; total: Money }[]; totals: { label: string; amount: Money; help?: string }[]; total: Money; vat: Money; wallet_applied: Money | null; pdf_url: string };
    details: {
        address: { label?: string; line1?: string; landmark?: string; suburb?: string; city?: string } | null; address_lat: number | null; address_lng: number | null;
        instructions: string | null; dropoff: string | null; no_cutlery: boolean;
        account: { name: string | null; phone: string | null; email: string | null };
        payment: { method: string; status: string; cash_part: Money | null };
    };
    support: { phone: string; whatsapp: string };
}
type Split = { payment_id: number; name: string | null; phone: string; amount: Money; status: string }[];
type Tab = 'tracking' | 'receipt' | 'details';

const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–');

/** Order screen: Tracking (current-stage banner + all stages), Receipt (PDF / email) and Details tabs. */
export default function OrderScreen() {
    const { dataLight } = usePrefs();
    const tr = useT();
    const t = useTheme();
    const { id, live: liveParam } = useLocalSearchParams<{ id: string; live?: string }>();
    const [v, setV] = useState<OrderView | null>(null);
    const [split, setSplit] = useState<Split>([]);
    const [tab, setTab] = useState<Tab>('tracking');
    const [live, setLive] = useState(liveParam === '1');
    const [ticket, setTicket] = useState(false);

    const load = useCallback(async () => {
        const r = await api.get<{ view: OrderView; split?: Split }>(`/orders/${id}`).catch(() => null);
        if (r?.view) {
            setV(r.view);
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

    if (!v) return <Loading />;

    const cancel = () => Alert.alert('Cancel order?', 'You’ll be refunded to your Zvino wallet.', [{ text: 'Keep order', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: async () => { try { await api.post(`/orders/${v.id}/cancel`, { reason: 'Changed my mind' }); load(); } catch (e) { Alert.alert('Can’t cancel', e instanceof ApiError ? e.friendly : ''); } } }]);
    const help = () => {
        const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [];
        if (v.support.whatsapp) options.push({ text: 'WhatsApp support', onPress: () => Linking.openURL(`https://wa.me/${v.support.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi Zvino, I need help with order #${v.reference}`)}`) });
        if (v.support.phone) options.push({ text: `Call ${v.support.phone}`, onPress: () => Linking.openURL(`tel:${v.support.phone}`) });
        options.push({ text: 'Send us a message', onPress: () => setTicket(true) });
        if (v.can_cancel) options.push({ text: 'Cancel order', style: 'destructive', onPress: cancel });
        options.push({ text: 'Close', style: 'cancel' });
        Alert.alert('Need help with this order?', `Quote order #${v.reference}.`, options);
    };
    const eta = v.time.at && !v.is_done && v.status !== 'scheduled' ? Math.max(0, Math.round((new Date(v.time.at).getTime() - Date.now()) / 60000)) : null;

    return (
        <View style={{ flex: 1, backgroundColor: t.bg }}>
            <SafeAreaView edges={['top']} style={{ backgroundColor: '#1C1C1C' }}>
                <Row style={{ paddingHorizontal: 12, paddingTop: 6 }} gap={8}>
                    <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/orders'))} style={{ padding: 8 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color="#fff" /></Pressable>
                    <View style={{ flex: 1 }}><Text variant="heading" style={{ color: '#fff' }} numberOfLines={1}>Order #{v.reference}</Text></View>
                </Row>
                <Row gap={6} justify="center" style={{ paddingVertical: 12 }}>
                    {(['tracking', 'receipt', 'details'] as Tab[]).map((k) => (
                        <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} style={{ paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: tab === k ? t.brand : 'transparent' }}>
                            <Text variant="label" style={{ color: tab === k ? '#111111' : 'rgba(255,255,255,0.8)', fontSize: 15 }}>{tr(k.charAt(0).toUpperCase() + k.slice(1))}</Text>
                        </Pressable>
                    ))}
                </Row>
            </SafeAreaView>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}>
                <Card>
                    <Row justify="space-between">
                        <View style={{ flex: 1 }}>
                            <Text variant="caption">{v.time.label}</Text>
                            <Text variant="display" style={{ fontSize: 34 }}>{v.status === 'scheduled' && v.time.at ? new Date(v.time.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : hhmm(v.time.at)}</Text>
                            {eta !== null && <Text variant="caption">about {eta} min</Text>}
                            {!v.is_done && v.time.trend ? (
                                <View style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: v.time.trend.type === 'early' ? t.brandSoft : t.goldSoft }}>
                                    <Text variant="caption" style={{ fontWeight: '800', color: v.time.trend.type === 'early' ? t.brandText : t.goldText }}>{v.time.trend.type === 'early' ? '' : ''}{v.time.trend.text}</Text>
                                </View>
                            ) : null}
                        </View>
                        <Pressable onPress={help} style={{ alignItems: 'center', padding: 6 }} accessibilityLabel="Help"><Ionicons name="help-circle-outline" size={32} color={t.ink} /><Text variant="caption" style={{ fontWeight: '700' }}>Help</Text></Pressable>
                    </Row>
                </Card>

                {tab === 'tracking' && <Tracking v={v} split={split} dataLight={dataLight} reload={load} cancel={cancel} onLive={() => setLive(true)} />}
                {tab === 'receipt' && <Receipt v={v} />}
                {tab === 'details' && <Details v={v} />}
            </ScrollView>
            <TicketSheet open={ticket} onClose={() => setTicket(false)} orderId={v.id} reference={v.reference} />
            <LiveTrack visible={live && (!!v.live || v.status === 'delivered')} view={v} onUpdate={setV} onClose={() => setLive(false)} />
        </View>
    );
}

/** The illustrated card for the current stage: words on the left, art on the right. */
function Banner({ image, title, subtitle }: { image: string; title: string; subtitle?: string | null }) {
    return (
        <View style={{ borderRadius: 22, overflow: 'hidden', aspectRatio: 1200 / 593 }}>
            <Image source={{ uri: image }} style={{ position: 'absolute', width: '100%', height: '100%' }} contentFit="cover" transition={200} cachePolicy="disk" />
            <View style={{ width: '50%', padding: 16, gap: 4 }}>
                <Text variant="title" style={{ color: '#1C1C1C', fontSize: 24, lineHeight: 26 }}>{title}</Text>
                {subtitle ? <Text style={{ color: '#1C1C1C', fontSize: 13, lineHeight: 17 }} numberOfLines={3}>{subtitle}</Text> : null}
            </View>
        </View>
    );
}

function Tracking({ v, split, dataLight, reload, cancel, onLive }: { v: OrderView; split: Split; dataLight: boolean; reload: () => void; cancel: () => void; onLive: () => void }) {
    const t = useTheme();
    const tr = useT();
    const dest = v.details.address_lat ? { latitude: v.details.address_lat, longitude: v.details.address_lng! } : null;
    const shop = v.store.lat ? { latitude: v.store.lat, longitude: v.store.lng! } : null;
    return (
        <>
            <Banner image={v.banner.image} title={v.banner.title} subtitle={v.banner.subtitle} />
            {v.shopping && (v.shopping.started || v.shopping.changes.length > 0) ? <ShoppingProgress s={v.shopping} /> : null}
            {v.live && (
                <Pressable onPress={onLive} accessibilityRole="button" accessibilityLabel="Track your driver live" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: t.brand, opacity: pressed ? 0.9 : 1 })}>
                    <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="bicycle" size={24} color="#fff" /></View>
                    <View style={{ flex: 1 }}>
                        <Text variant="heading" style={{ color: '#111' }}>Track your driver live</Text>
                        <Text style={{ color: 'rgba(0,0,0,0.7)', fontSize: 13 }}>See the store, your driver and you on the map</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color="#111" />
                </Pressable>
            )}

            <View style={{ gap: 4 }}>
                {v.timeline.map((s) => {
                    const on = s.state !== 'upcoming';
                    return (
                        <Row key={s.key} align="flex-start" gap={14} style={{ paddingVertical: 8 }}>
                            <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.state === 'stopped' ? t.red : on ? t.brand : 'transparent', borderWidth: on ? 0 : 2, borderColor: t.border }}>
                                {s.state === 'stopped' ? <Ionicons name="close" size={18} color="#fff" /> : on ? <Ionicons name="checkmark" size={18} color="#111" /> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text variant="label" color={on ? 'ink' : 'muted'} style={{ fontSize: 16 }}>{s.label}{s.at && on ? `  ${hhmm(s.at)}` : ''}{s.state === 'current' && !v.is_done ? '  · Now' : ''}</Text>
                                {s.detail && on ? <Text color="muted">{s.detail}</Text> : null}
                            </View>
                        </Row>
                    );
                })}
            </View>

            {v.driver && (
                <Card>
                    <Row>
                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text variant="heading" color="brand">{v.driver.name[0]}</Text></View>
                        <View style={{ flex: 1 }}><Text variant="heading">{v.driver.name}</Text><Text variant="caption">{label(v.driver.vehicle ?? 'motorbike')} {v.driver.plate ? `· ${v.driver.plate}` : ''}</Text></View>
                        <Pressable onPress={() => Linking.openURL(`tel:${v.driver!.phone}`)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Call driver"><Ionicons name="call" size={20} color={t.ink} /></Pressable>
                    </Row>
                </Card>
            )}
            {v.delivery_pin && <Card tone="subtle"><Text variant="label">Delivery PIN</Text><Text variant="display" style={{ letterSpacing: 8 }}>{v.delivery_pin}</Text><Text variant="caption">Give this to your driver at the gate.</Text></Card>}
            {v.fulfilment === 'delivery' && !v.is_done && !dataLight && (dest || shop) && (
                <View style={{ height: 220, borderRadius: 22, overflow: 'hidden' }}>
                    <MapView style={{ flex: 1 }} initialRegion={{ ...(dest ?? shop)!, latitudeDelta: 0.04, longitudeDelta: 0.04 }}>
                        {shop && <Marker coordinate={shop} title={v.store.name} pinColor="#222222" />}
                        {dest && <Marker coordinate={dest} title="You" pinColor="#17C74A" />}
                        {v.driver?.lat ? <Marker coordinate={{ latitude: v.driver.lat, longitude: v.driver.lng! }} title={v.driver.name} pinColor="#FDE500" /> : null}
                    </MapView>
                </View>
            )}

            {split.length > 0 && v.status === 'pending_payment' && (
                <Card style={{ gap: 8 }}>
                    <Text variant="heading">Split the bill</Text>
                    {split.map((s) => (
                        <Row key={s.payment_id} justify="space-between">
                            <View style={{ flex: 1 }}><Text variant="label">{s.name || s.phone}</Text><Text variant="caption">{zig(s.amount.zig)} · {s.status === 'paid' ? 'Paid ✓' : ['failed', 'cancelled'].includes(s.status) ? 'Declined' : 'Waiting…'}</Text></View>
                            {s.status !== 'paid' && (
                                <Row gap={10}>
                                    <Pressable onPress={() => api.post(`/orders/${v.id}/split/${s.payment_id}/resend`, {}).then(reload).catch((e) => Alert.alert('Resend', e instanceof ApiError ? e.friendly : ''))}><Text variant="label" color="brand">Resend</Text></Pressable>
                                    <Pressable onPress={() => api.post(`/orders/${v.id}/split/${s.payment_id}/resend`, { pay_myself: true }).then(reload).catch((e) => Alert.alert('Pay', e instanceof ApiError ? e.friendly : ''))}><Text variant="label">I’ll pay</Text></Pressable>
                                </Row>
                            )}
                        </Row>
                    ))}
                </Card>
            )}

            {v.review_banner && <><Banner image={v.review_banner} title="How was it?" subtitle={`Rate ${v.store.name}.`} /><Review v={v} reload={reload} /></>}
            {v.can_cancel && <Button title={tr('Cancel order')} tone="outline" onPress={cancel} />}
            {v.status === 'delivered' && <Button title={tr('Reorder')} onPress={() => router.push(`/store/${v.store.id}`)} />}
            {!['cancelled', 'rejected', 'pending_payment'].includes(v.status) && <Button title="Make this a regular order" tone="ghost" onPress={() => router.push(`/plans?fromOrder=${v.id}`)} />}
        </>
    );
}

function Review({ v, reload }: { v: OrderView; reload: () => void }) {
    const t = useTheme();
    const [stars, setStars] = useState(0);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const send = async () => {
        setBusy(true);
        try {
            await api.post(`/orders/${v.id}/review`, { vendor_rating: stars, driver_rating: v.fulfilment === 'delivery' ? stars : null, comment: comment || null });
            reload();
        } catch (e) {
            Alert.alert('Review', e instanceof ApiError ? e.friendly : 'Please try again.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Card style={{ gap: 12 }}>
            <Row gap={6}>{[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setStars(n)} accessibilityLabel={`${n} stars`}><Ionicons name={n <= stars ? 'star' : 'star-outline'} size={34} color={n <= stars ? '#E5B700' : t.faint} /></Pressable>)}</Row>
            {stars > 0 && (
                <>
                    <TextInput value={comment} onChangeText={setComment} placeholder="Tell others about your meal (optional)" placeholderTextColor={t.faint} multiline style={{ minHeight: 70, borderRadius: 12, backgroundColor: t.subtle, color: t.ink, padding: 12, textAlignVertical: 'top' }} />
                    <Button title="Submit review" onPress={send} loading={busy} />
                </>
            )}
        </Card>
    );
}

function Totals({ v }: { v: OrderView }) {
    const t = useTheme();
    return (
        <Card style={{ padding: 0 }}>
            <View style={{ padding: 16, gap: 12 }}>
                {v.receipt.totals.map((x) => (
                    <Row key={x.label} justify="space-between">
                        <Pressable disabled={!x.help} onPress={() => x.help && Alert.alert(x.label, x.help)}><Text>{x.label}{x.help ? '  ⓘ' : ''}</Text></Pressable>
                        <Text variant="label">{zig(x.amount.zig)}</Text>
                    </Row>
                ))}
            </View>
            <Row justify="space-between" style={{ padding: 16, borderTopWidth: 1, borderColor: t.border }}>
                <Text variant="title" style={{ fontSize: 22 }}>Total</Text>
                <View style={{ alignItems: 'flex-end' }}><Text variant="title" style={{ fontSize: 22 }}>{zig(v.receipt.total.zig)}</Text><Text variant="caption">VAT incl. {zig(v.receipt.vat.zig)}</Text></View>
            </Row>
        </Card>
    );
}

function Receipt({ v }: { v: OrderView }) {
    const t = useTheme();
    const [email, setEmail] = useState(v.details.account.email ?? '');
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [downloading, setDownloading] = useState(false);
    /** Save the PDF to the phone, then open the share sheet (Save to Files, WhatsApp, email…). */
    const download = async () => {
        setDownloading(true);
        try {
            const target = `${FileSystem.cacheDirectory}Zvino-receipt-${v.reference}.pdf`;
            const r = await FileSystem.downloadAsync(v.receipt.pdf_url, target);
            if (r.status !== 200 || !(r.headers['Content-Type'] ?? r.headers['content-type'] ?? '').includes('pdf')) throw new Error('not a pdf');
            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: `Receipt #${v.reference}` });
            else await WebBrowser.openBrowserAsync(v.receipt.pdf_url);
        } catch {
            WebBrowser.openBrowserAsync(v.receipt.pdf_url).catch(() => Linking.openURL(v.receipt.pdf_url));
        } finally {
            setDownloading(false);
        }
    };
    const sendEmail = async () => {
        if (!email || !asking && !v.details.account.email) return setAsking(true);
        setBusy(true);
        try {
            const r = await api.post<{ message: string }>(`/orders/${v.id}/receipt/email`, { email });
            Alert.alert('Receipt', r.message);
            setAsking(false);
        } catch (e) {
            Alert.alert('Receipt', e instanceof ApiError ? e.friendly : 'Could not send. Try Download PDF instead.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Row gap={14}>
                {v.store.logo ? <Image source={{ uri: v.store.logo }} style={{ width: 56, height: 56, borderRadius: 28 }} /> : <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="restaurant-outline" size={26} color={t.ink} /></View>}
                <View style={{ flex: 1 }}><Text variant="title" style={{ fontSize: 22 }}>{v.store.name}</Text>{v.store.address ? <Text variant="caption">{v.store.address}</Text> : null}</View>
            </Row>
            <Card style={{ padding: 0 }}>
                <View style={{ padding: 14, borderBottomWidth: 1, borderColor: t.border }}><Text variant="caption">{v.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · {new Date(v.placed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>
                {v.receipt.lines.map((l, i) => (
                    <Row key={i} align="flex-start" style={{ padding: 14, borderBottomWidth: i < v.receipt.lines.length - 1 ? 1 : 0, borderColor: t.border }}>
                        <View style={{ width: 34 }}><Text variant="heading">{l.quantity}×</Text></View>
                        <View style={{ flex: 1, gap: 2 }}>
                            <Text variant="label">{l.name}</Text>
                            {l.options.map((o) => <Text key={o} color="muted">{o}</Text>)}
                            {l.notes ? <Text color="muted">“{l.notes}”</Text> : null}
                        </View>
                        <Text variant="label">{zig(l.total.zig)}</Text>
                    </Row>
                ))}
            </Card>
            <Totals v={v} />
            <Button title={downloading ? 'Downloading…' : 'Download PDF receipt'} loading={downloading} onPress={download} />
            {asking && <TextInput value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={t.faint} keyboardType="email-address" autoCapitalize="none" style={{ height: 50, borderRadius: 12, borderWidth: 1, borderColor: t.border, color: t.ink, paddingHorizontal: 14 }} />}
            <Button title={asking ? 'Send receipt' : 'Email me the receipt'} tone="outline" loading={busy} onPress={sendEmail} />
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={{ gap: 8 }}>
            <Text variant="heading">{title}</Text>
            <Card tone="subtle" style={{ gap: 2 }}>{children}</Card>
        </View>
    );
}

function Details({ v }: { v: OrderView }) {
    const a = v.details.address;
    return (
        <>
            {v.fulfilment === 'delivery' ? (
                <Section title="Delivery address">
                    {a ? <>{a.label ? <Text variant="label">{a.label}</Text> : null}<Text>{a.line1}</Text>{a.landmark ? <Text>Near {a.landmark}</Text> : null}<Text>{[a.suburb, a.city].filter(Boolean).join(', ')}</Text></> : <Text color="muted">No address</Text>}
                    {v.details.dropoff ? <Text variant="caption" style={{ marginTop: 6 }}>Drop-off: {v.details.dropoff}</Text> : null}
                </Section>
            ) : (
                <Section title="Collect from"><Text variant="label">{v.store.name}</Text>{v.store.address ? <Text>{v.store.address}</Text> : null}</Section>
            )}
            <Section title={v.fulfilment === 'delivery' ? 'Delivery instructions' : 'Notes'}>
                <Text color={v.details.instructions ? 'ink' : 'muted'}>{v.details.instructions ?? 'No instructions'}</Text>
                {v.details.no_cutlery ? <Text variant="caption">No cutlery, please</Text> : null}
            </Section>
            <Section title="Account details">
                <Text>{v.details.account.name || 'Zvino customer'}</Text>
                {v.details.account.phone ? <Text>{v.details.account.phone}</Text> : null}
                {v.details.account.email ? <Text>{v.details.account.email}</Text> : null}
            </Section>
            <Section title="Payment method">
                <Row justify="space-between"><Text>{v.details.payment.method}</Text><Text color="muted">{v.details.payment.status}</Text></Row>
                {v.details.payment.cash_part ? <Text variant="caption">Cash to the driver: {zig(v.details.payment.cash_part.zig)}</Text> : null}
                {v.receipt.wallet_applied ? <Text variant="caption">From your wallet: {zig(v.receipt.wallet_applied.zig)}</Text> : null}
            </Section>
            <View style={{ gap: 8 }}>
                <Text variant="heading">Order summary</Text>
                <Totals v={v} />
            </View>
        </>
    );
}

/** Zvino-run store: how far the shopper is, and anything swapped or not available. */
function ShoppingProgress({ s }: { s: NonNullable<OrderView['shopping']> }) {
    const t = useTheme();
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    return (
        <Card style={{ gap: 10 }}>
            <Row justify="space-between"><Text variant="label">{s.finished ? 'Shopping done' : 'Your shopper is picking your items'}</Text><Text variant="caption">{s.done} of {s.total}</Text></Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: t.subtle, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 8, backgroundColor: t.brand }} /></View>
            {s.changes.map((c, i) => (
                <Row key={i} justify="space-between" align="flex-start" gap={10}>
                    <Text style={{ flex: 1 }}>
                        {c.status === 'replaced' && c.replacement ? `${c.name} → ${c.replacement.quantity}× ${c.replacement.name}` : c.status === 'partial' ? `${c.name}: ${c.found_qty} of ${c.quantity} available` : `${c.name}: not available`}
                    </Text>
                    {c.refund ? <Text variant="label" color="brand">+{zig(c.refund.zig)}</Text> : null}
                </Row>
            ))}
            {s.refund ? <Text variant="caption">{zig(s.refund.zig)} for missing or cheaper items {s.finished ? 'is in' : 'will go back to'} your Zvino wallet. You’re never charged more for a replacement.</Text> : null}
        </Card>
    );
}

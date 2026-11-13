import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { zig } from '@/lib/money';
import { useImg } from '@/lib/prefs';
import { Badge, Button, Card, Loading, Row, Text, useTheme } from '@/ui';
import { useDeviceInsets } from '@/lib/insets';
import { shrinkPhoto } from '@/lib/photo';
import { queueSlip, retrySlip, useSlipUpload } from '@/lib/slip-upload';

type Status = 'found' | 'partial' | 'missing' | 'replaced';
interface Line {
    id: number; name: string; quantity: number; options: string[]; notes: string | null; image: string | null; aisle: string; size: string | null;
    unit_price: Money; shelf_usd: number | null; status: Status | null; found_qty: number | null;
    replacement: { item_id: number; name: string; quantity: number; line_total_zig: number; image: string | null } | null;
    /** Chosen by the customer at checkout. */
    substitute: { item_id: number; name: string; image: string | null; unit_price_zig: number } | null;
}
interface Shop {
    id: number; reference: string; status: string; store: { name: string; address: string | null }; customer: { name: string | null; phone: string | null };
    substitution_pref: 'best' | 'contact' | 'refund'; notes: string | null; started: boolean; finished: boolean;
    lines: Line[]; done: number; total: number; expected_till_usd: number; refund: Money;
    /** Admin can switch the till slip photo off; has_slip once it has reached Zvino. */
    slip_required?: boolean; has_slip?: boolean;
}
interface Option { id: number; name: string; image: string | null; price: Money; size: string | null }

const PREF: Record<Shop['substitution_pref'], string> = {
    best: 'Customer is happy with a similar item if something is out.',
    contact: 'Call the customer before replacing anything.',
    refund: 'No replacements: mark missing items as not available.',
};

/** In-store shopping: tick off each item (found / some / replaced / not available), then pay at the till. */
export default function ShopScreen() {
    const t = useTheme();
    const img = useImg();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [shop, setShop] = useState<Shop | null>(null);
    const [active, setActive] = useState<Line | null>(null);
    const [checkout, setCheckout] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => api.get<Shop>(`/driver/jobs/${id}/shop`).then(setShop).catch((e) => Alert.alert('Shopping', e instanceof ApiError ? e.friendly : '', [{ text: 'OK', onPress: () => router.back() }])), [id]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (shop && !shop.started && !shop.finished) api.post<Shop>(`/driver/jobs/${id}/shop/start`).then(setShop).catch(() => {});
    }, [shop?.started]); // eslint-disable-line react-hooks/exhaustive-deps

    const aisles = useMemo(() => {
        const groups: Record<string, Line[]> = {};
        (shop?.lines ?? []).forEach((l) => { (groups[l.aisle] ??= []).push(l); });
        return Object.entries(groups);
    }, [shop?.lines]);

    if (!shop) return <Loading />;
    const left = shop.total - shop.done;

    const mark = async (line: Line, body: Record<string, unknown>) => {
        setBusy(true);
        try {
            setShop(await api.post<Shop>(`/driver/jobs/${id}/shop/items/${line.id}`, body));
            setActive(null);
        } catch (e) {
            Alert.alert('Couldn’t save', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 16, paddingVertical: 10 }} gap={10}>
                <Pressable onPress={() => router.back()} style={{ padding: 4 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <View style={{ flex: 1 }}><Text variant="heading" numberOfLines={1}>Shopping · {shop.reference}</Text><Text variant="caption" numberOfLines={1}>{shop.store.name}</Text></View>
                {shop.customer.phone ? <Pressable onPress={() => Linking.openURL(`tel:${shop.customer.phone}`)} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Call customer"><Ionicons name="call" size={20} color={t.ink} /></Pressable> : null}
            </Row>
            <View style={{ paddingHorizontal: 16, gap: 6 }}>
                <Row justify="space-between"><Text variant="label">{shop.done} of {shop.total} items</Text><Text variant="caption">Till estimate ~${shop.expected_till_usd.toFixed(2)}</Text></Row>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: t.subtle, overflow: 'hidden' }}><View style={{ width: `${shop.total ? (shop.done / shop.total) * 100 : 0}%`, height: 8, backgroundColor: t.brand }} /></View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 30 }}>
                <Card tone="subtle" style={{ gap: 4 }}>
                    <Row gap={8}><Ionicons name="swap-horizontal" size={18} color={t.ink} /><Text variant="label" style={{ flex: 1 }}>{PREF[shop.substitution_pref]}</Text></Row>
                    {shop.notes ? <Text variant="caption">Customer note: “{shop.notes}”</Text> : null}
                </Card>

                {aisles.map(([aisle, lines]) => (
                    <View key={aisle} style={{ gap: 8 }}>
                        <Text variant="caption" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{aisle}</Text>
                        {lines.map((l) => (
                            <Pressable key={l.id} onPress={() => !shop.finished && setActive(l)} accessibilityRole="button" accessibilityLabel={`${l.quantity} ${l.name}`}
                                style={{ flexDirection: 'row', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: l.status ? 'transparent' : t.border, backgroundColor: l.status ? t.subtle : t.surface, opacity: l.status === 'missing' ? 0.6 : 1 }}>
                                <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: t.subtle }}>{l.image ? <Image source={{ uri: img(l.image, 160) ?? undefined }} style={{ width: 56, height: 56 }} contentFit="cover" /> : null}</View>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text variant="label" numberOfLines={2}>{l.quantity}× {l.name}</Text>
                                    <Text variant="caption" numberOfLines={1}>{[l.size, l.shelf_usd ? `shelf $${l.shelf_usd.toFixed(2)}` : null, ...l.options].filter(Boolean).join(' · ')}</Text>
                                    {l.notes ? <Text variant="caption" color="gold">“{l.notes}”</Text> : null}
                                    {l.substitute && !l.status ? <Text variant="caption">If out: <Text variant="caption" style={{ fontWeight: '700' }}>{l.substitute.name}</Text></Text> : null}
                                    {l.status === 'replaced' && l.replacement ? <Text variant="caption" color="brand">→ {l.replacement.quantity}× {l.replacement.name}</Text> : null}
                                    {l.status === 'partial' ? <Text variant="caption" color="gold">Found {l.found_qty} of {l.quantity}</Text> : null}
                                </View>
                                <StatusIcon status={l.status} />
                            </Pressable>
                        ))}
                    </View>
                ))}
            </ScrollView>

            <View style={{ padding: 16, borderTopWidth: 0.5, borderColor: t.border, gap: 6 }}>
                {shop.refund.zig > 0 && <Text variant="caption" center>{zig(shop.refund.zig)} will be refunded to the customer for missing or cheaper items.</Text>}
                <Button title={left > 0 ? `${left} item${left === 1 ? '' : 's'} to go` : 'Pay at the till'} tone="primary" disabled={left > 0} onPress={() => setCheckout(true)} icon={<Ionicons name="card" size={18} color="#fff" />} />
            </View>

            <ItemSheet shop={shop} line={active} busy={busy} onClose={() => setActive(null)} onMark={mark} />
            <TillSheet shop={shop} open={checkout} onClose={() => setCheckout(false)} onDone={() => { setCheckout(false); router.replace(`/job/${shop.id}`); }} />
        </SafeAreaView>
    );
}

function StatusIcon({ status }: { status: Status | null }) {
    const t = useTheme();
    if (!status) return <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: t.border, alignSelf: 'center' }} />;
    const map: Record<Status, [keyof typeof Ionicons.glyphMap, string]> = { found: ['checkmark', t.brand], partial: ['remove', t.gold], replaced: ['swap-horizontal', t.gold], missing: ['close', t.red] };
    const [name, bg] = map[status];
    return <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}><Ionicons name={name} size={16} color="#111" /></View>;
}

/** One item: found it all, found some, replace it, or not available. */
function ItemSheet({ shop, line, busy, onClose, onMark }: { shop: Shop; line: Line | null; busy: boolean; onClose: () => void; onMark: (l: Line, body: Record<string, unknown>) => void }) {
    const t = useTheme();
    const nav = useDeviceInsets();
    const img = useImg();
    const [mode, setMode] = useState<'menu' | 'partial' | 'replace'>('menu');
    const [qty, setQty] = useState(1);
    const [q, setQ] = useState('');
    const [options, setOptions] = useState<Option[] | null>(null);
    useEffect(() => { setMode('menu'); setQty(1); setQ(''); setOptions(null); }, [line?.id]);
    useEffect(() => {
        if (mode !== 'replace' || !line) return;
        const timer = setTimeout(() => api.get<Option[]>(`/driver/jobs/${shop.id}/shop/search?for=${line.id}&q=${encodeURIComponent(q)}`).then(setOptions).catch(() => setOptions([])), q ? 350 : 0);
        return () => clearTimeout(timer);
    }, [mode, q, line?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!line) return null;
    const canReplace = shop.substitution_pref !== 'refund';

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
            <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 20 + nav.bottom, gap: 12, maxHeight: '85%' }}>
                <Row gap={12}>
                    {line.image ? <Image source={{ uri: img(line.image, 200) ?? undefined }} style={{ width: 64, height: 64, borderRadius: 12 }} contentFit="cover" /> : null}
                    <View style={{ flex: 1 }}><Text variant="heading" numberOfLines={2}>{line.quantity}× {line.name}</Text><Text variant="caption">{line.aisle}{line.size ? ` · ${line.size}` : ''}</Text></View>
                </Row>

                {mode === 'menu' && (
                    <View style={{ gap: 10 }}>
                        <Button title={`Found all ${line.quantity}`} tone="primary" loading={busy} onPress={() => onMark(line, { status: 'found' })} icon={<Ionicons name="checkmark" size={18} color="#fff" />} />
                        {line.quantity > 1 && <Button title="Found only some" tone="outline" onPress={() => { setQty(Math.max(1, line.quantity - 1)); setMode('partial'); }} />}
                        {canReplace && line.substitute && (
                            <Pressable onPress={() => onMark(line, { status: 'replaced', replacement_item_id: line.substitute!.item_id, replacement_qty: line.quantity })} disabled={busy}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 2, borderColor: t.brand, backgroundColor: t.brandSoft }}>
                                {line.substitute.image ? <Image source={{ uri: img(line.substitute.image, 120) ?? undefined }} style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#fff' }} contentFit="contain" /> : null}
                                <View style={{ flex: 1 }}><Text variant="label">Out of stock: use their substitute</Text><Text variant="caption" numberOfLines={2}>{line.quantity}× {line.substitute.name}</Text></View>
                                <Ionicons name="swap-horizontal" size={20} color={t.brandText} />
                            </Pressable>
                        )}
                        {canReplace && <Button title={line.substitute ? 'Replace with something else' : shop.substitution_pref === 'contact' ? 'Replace (after calling the customer)' : 'Out of stock: replace it'} tone="outline" onPress={() => setMode('replace')} icon={<Ionicons name="swap-horizontal" size={18} color={t.ink} />} />}
                        <Button title="Not available: refund it" tone="soft" loading={busy} onPress={() => onMark(line, { status: 'missing' })} icon={<Ionicons name="close" size={18} color={t.ink} />} />
                    </View>
                )}

                {mode === 'partial' && (
                    <View style={{ gap: 12 }}>
                        <Text>How many did you find?</Text>
                        <Stepper value={qty} min={1} max={line.quantity - 1} onChange={setQty} />
                        <Button title={`Found ${qty} of ${line.quantity}`} tone="primary" loading={busy} onPress={() => onMark(line, { status: 'partial', found_qty: qty })} />
                        <Button title="Back" tone="soft" onPress={() => setMode('menu')} />
                    </View>
                )}

                {mode === 'replace' && (
                    <View style={{ gap: 10, flexShrink: 1 }}>
                        <TextInput value={q} onChangeText={setQ} placeholder="Search this store…" placeholderTextColor={t.faint} autoFocus
                            style={{ height: 48, borderRadius: 12, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: 14, color: t.ink, backgroundColor: t.surface }} />
                        <Text variant="caption">Similar items from the same aisle are shown first. The customer is never charged more.</Text>
                        {options === null ? <ActivityIndicator /> : (
                            <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 8 }}>
                                {options.length === 0 && <Text color="muted">Nothing found. Try another word.</Text>}
                                {options.map((o) => (
                                    <Pressable key={o.id} onPress={() => onMark(line, { status: 'replaced', replacement_item_id: o.id, replacement_qty: line.quantity })} disabled={busy}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, backgroundColor: t.subtle }}>
                                        {o.image ? <Image source={{ uri: img(o.image, 120) ?? undefined }} style={{ width: 44, height: 44, borderRadius: 8 }} contentFit="cover" /> : <View style={{ width: 44, height: 44 }} />}
                                        <View style={{ flex: 1 }}><Text variant="label" numberOfLines={2}>{o.name}</Text>{o.size ? <Text variant="caption">{o.size}</Text> : null}</View>
                                        <Text variant="label">{zig(o.price.zig)}</Text>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}
                        <Button title="Back" tone="soft" onPress={() => setMode('menu')} />
                    </View>
                )}
            </View>
        </Modal>
    );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
    const t = useTheme();
    const btn = (d: number, icon: 'remove' | 'add') => (
        <Pressable onPress={() => onChange(Math.min(max, Math.max(min, value + d)))} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={icon}><Ionicons name={icon} size={22} color={t.ink} /></Pressable>
    );
    return <Row justify="center" gap={24}>{btn(-1, 'remove')}<Text variant="display">{value}</Text>{btn(1, 'add')}</Row>;
}

/**
 * Pay at the till: total and how it was paid, plus the slip photo (unless switched off in admin).
 * The photo starts uploading the moment it's taken, with a progress bar and automatic retries, so
 * "Done" never waits for it; it keeps uploading in the background if the signal is poor.
 */
function TillSheet({ shop, open, onClose, onDone }: { shop: Shop; open: boolean; onClose: () => void; onDone: () => void }) {
    const t = useTheme();
    const nav = useDeviceInsets();
    const [total, setTotal] = useState('');
    const [taken, setTaken] = useState(false);
    const [paidWith, setPaidWith] = useState<'zvino_card' | 'own_cash'>('zvino_card');
    const [busy, setBusy] = useState(false);
    const upload = useSlipUpload(shop.id);
    const needSlip = shop.slip_required !== false;
    const uploaded = upload.status === 'done' || (!!shop.has_slip && !taken);
    const hasSlip = taken || !!shop.has_slip;
    const amount = Number(total.replace(',', '.'));
    const off = amount > 0 && Math.abs(amount - shop.expected_till_usd) > Math.max(1, shop.expected_till_usd * 0.1);

    const photo = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return Alert.alert('Camera needed', 'Allow the camera to photograph the till slip.');
        const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (r.canceled) return;
        setTaken(true);
        queueSlip(shop.id, await shrinkPhoto(r.assets[0]));
    };
    const submit = async () => {
        setBusy(true);
        const pending = needSlip && !uploaded;
        try {
            await api.post(`/driver/jobs/${shop.id}/shop/finish`, { till_total_usd: amount, paid_with: paidWith, slip_pending: pending });
            Alert.alert('Shopping done', pending ? 'The customer has been told their order is on the way. Your slip photo keeps uploading in the background.' : 'The customer has been told their order is on the way.', [{ text: 'Deliver', onPress: onDone }]);
        } catch (e) {
            Alert.alert('Couldn’t finish', e instanceof ApiError && e.status === 0 ? 'No signal right now. Tap Done again in a moment; everything you entered is kept.' : e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    const pct = Math.round(upload.progress * 100);
    const slipLabel = uploaded ? 'Slip uploaded · tap to retake'
        : upload.status === 'uploading' ? `Uploading slip ${pct}%`
        : upload.status === 'retrying' ? 'Weak signal, retrying · tap to retry now'
        : taken ? 'Slip photo taken · tap to retake' : 'Photograph the till slip';
    const tone = uploaded ? t.brand : upload.status === 'retrying' ? t.gold : t.border;

    return (
        <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={onClose} />
            <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 20 + nav.bottom, gap: 14 }}>
                <Text variant="title">Pay at the till</Text>
                <Text variant="caption">Expected about ${shop.expected_till_usd.toFixed(2)} at shelf prices.</Text>
                <View style={{ gap: 6 }}>
                    <Text variant="label">Till slip total (USD)</Text>
                    <TextInput value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.faint}
                        style={{ height: 56, borderRadius: 14, borderWidth: 2, borderColor: off ? t.gold : t.border, paddingHorizontal: 16, fontSize: 24, fontWeight: '800', color: t.ink }} />
                    {off && <Badge tone="gold">Quite different from the estimate. Double-check the slip.</Badge>}
                </View>
                <Row gap={10}>
                    {([['zvino_card', 'Zvino card'], ['own_cash', 'My own money']] as const).map(([v, l]) => (
                        <Pressable key={v} onPress={() => setPaidWith(v)} style={{ flex: 1, padding: 12, borderRadius: 14, borderWidth: paidWith === v ? 2 : 1, borderColor: paidWith === v ? t.ink : t.border, alignItems: 'center' }}>
                            <Text variant="label">{l}</Text>
                        </Pressable>
                    ))}
                </Row>
                {paidWith === 'own_cash' && <Text variant="caption">You’ll be paid back in your Zvino earnings.</Text>}
                {needSlip && (
                    <Pressable onPress={upload.status === 'retrying' ? () => retrySlip(shop.id) : photo} accessibilityRole="button"
                        style={{ borderRadius: 16, borderWidth: 1.5, borderStyle: hasSlip ? 'solid' : 'dashed', borderColor: tone, overflow: 'hidden' }}>
                        <Row gap={10} style={{ padding: 14 }}>
                            <Ionicons name={uploaded ? 'checkmark-circle' : upload.status === 'retrying' ? 'refresh' : upload.status === 'uploading' ? 'cloud-upload-outline' : 'camera-outline'} size={20}
                                color={uploaded ? t.brandText : upload.status === 'retrying' ? t.goldText : t.ink} />
                            <Text variant="label" style={{ flex: 1 }}>{slipLabel}</Text>
                        </Row>
                        {!uploaded && (upload.status === 'uploading' || upload.status === 'retrying') && (
                            <View style={{ height: 4, backgroundColor: t.subtle }}><View style={{ height: 4, width: `${Math.max(4, pct)}%`, backgroundColor: upload.status === 'retrying' ? t.gold : t.brand }} /></View>
                        )}
                    </Pressable>
                )}
                <Button title="Done, start delivery" tone="primary" loading={busy} disabled={!(amount > 0) || (needSlip && !hasSlip)} onPress={submit} />
                {needSlip && hasSlip && !uploaded && <Text variant="caption" style={{ textAlign: 'center' }}>No need to wait for the upload. It carries on in the background.</Text>}
            </View>
        </Modal>
    );
}

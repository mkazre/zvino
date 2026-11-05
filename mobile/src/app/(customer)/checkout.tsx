import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { alt, label, normalisePhone, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Row, Text, Toggle, useTheme } from '@/ui';
import { useT } from '@/lib/i18n';
import * as ImagePicker from 'expo-image-picker';

interface Address { id: number; label: string; line1: string; landmark: string | null; suburb: string | null; city: string; is_default: boolean }
interface Quote {
    totals: Record<'subtotal' | 'delivery' | 'service' | 'small_order' | 'discount' | 'tip' | 'vat' | 'total' | 'member_savings', Money>;
    surge: { multiplier: number; reason: string | null } | null;
    eta_minutes: [number, number] | null;
    tip_presets_pct: number[];
    payment_methods: string[];
    wallet_balance: Money;
    split_tender: boolean;
    split_bill: { max_people: number } | null;
    needs_prescription: boolean;
    batch: { zone: string; departs_at: string; arrives_at: string } | null;
    deal: string | null;
    company: { company: string; left_today_zig: number | null } | null;
    round_up: { charity: string; amount: Money } | null;
}

const METHOD_LABEL: Record<string, string> = { ecocash: 'EcoCash', innbucks: 'InnBucks', onemoney: 'OneMoney', card: 'Visa / Mastercard', wallet: 'Zvino wallet', cash: 'Cash on delivery', company: 'Company account' };
const METHOD_ICON: Record<string, keyof typeof Ionicons.glyphMap> = { ecocash: 'phone-portrait-outline', innbucks: 'phone-portrait-outline', onemoney: 'phone-portrait-outline', card: 'card-outline', wallet: 'wallet-outline', cash: 'cash-outline', company: 'business-outline' };

export default function Checkout() {
    const t = useTheme();
    const tr = useT();
    const { me } = useSession();
    const cart = useCart();
    const [synced, setSynced] = useState(false);
    const [addresses, setAddresses] = useState<Address[]>([]);
    const [addressId, setAddressId] = useState<number | null>(null);
    const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
    const [tipPct, setTipPct] = useState(10);
    const [method, setMethod] = useState('ecocash');
    const [phone, setPhone] = useState(me?.phone?.replace('+263', '0') ?? '');
    const [promo, setPromo] = useState('');
    const [notes, setNotes] = useState('');
    const [dropoff, setDropoff] = useState<'hand_to_me' | 'leave_at_door'>('hand_to_me');
    const [useWallet, setUseWallet] = useState(false);
    const [cashPartText, setCashPartText] = useState('');
    const [friends, setFriends] = useState<{ name: string; phone: string; amount: string }[]>([]);
    const [prescription, setPrescription] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const addPrescription = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        const r = perm.granted ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
        if (r.canceled) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('photo', { uri: r.assets[0].uri, name: 'prescription.jpg', type: 'image/jpeg' } as unknown as Blob);
            setPrescription((await api.post<{ token: string }>('/prescriptions', fd)).token);
        } catch (e) {
            Alert.alert('Prescription', e instanceof ApiError ? e.friendly : 'Upload failed');
        } finally {
            setUploading(false);
        }
    };
    const [roundUp, setRoundUp] = useState(false);
    const [noCutlery, setNoCutlery] = useState(true);
    const [quote, setQuote] = useState<Quote | null>(null);
    const [placing, setPlacing] = useState(false);
    const [waiting, setWaiting] = useState<{ paymentId: number; orderId: number } | null>(null);

    // Push the device basket into the server cart (server re-checks prices & stock).
    useEffect(() => {
        cart.syncToServer().then(() => setSynced(true)).catch((e) => Alert.alert('Basket problem', e instanceof ApiError ? e.friendly : 'Please try again.', [{ text: 'OK', onPress: () => router.back() }]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useFocusEffect(useCallback(() => {
        api.get<Address[]>('/addresses').then((a) => { setAddresses(a); setAddressId((cur) => cur ?? a.find((x) => x.is_default)?.id ?? a[0]?.id ?? null); });
    }, []));

    const subtotal = quote?.totals.subtotal.zig ?? cart.subtotal;
    const tip = fulfilment === 'delivery' ? Math.round((subtotal * tipPct) / 100) : 0;

    useEffect(() => {
        if (!synced) return;
        const timer = setTimeout(() => {
            api.post<Quote>('/checkout/quote', { fulfilment, address_id: fulfilment === 'delivery' ? addressId : null, tip })
                .then(setQuote).catch((e) => e instanceof ApiError && Alert.alert('Delivery', e.friendly));
        }, 200);
        return () => clearTimeout(timer);
    }, [synced, fulfilment, addressId, tip]);

    const applyPromo = async () => {
        try {
            await api.post('/cart/voucher', { code: promo });
            setQuote(await api.post<Quote>('/checkout/quote', { fulfilment, address_id: addressId, tip }));
            Alert.alert('Promo applied 🎉');
        } catch (e) {
            Alert.alert('Promo', e instanceof ApiError ? e.friendly : 'Invalid code');
        }
    };

    const place = async () => {
        setPlacing(true);
        try {
            const res = await api.post<{ order: { data?: { id: number }; id?: number }; payment: { id: number; status: string; redirect_url: string | null }; next: string }>('/orders', {
                fulfilment, address_id: fulfilment === 'delivery' ? addressId : null, payment_method: method,
                phone: ['ecocash', 'onemoney', 'innbucks'].includes(method) ? normalisePhone(phone) : null, tip, notes, dropoff,
                use_wallet: useWallet && method !== 'wallet', cash_part: cashPart || null,
                split_with: shares.length ? shares.map((f) => ({ name: f.name || null, phone: normalisePhone(f.phone), amount: Number(f.amount) })) : null,
                prescription, round_up: roundUp, no_cutlery: noCutlery,
            });
            const orderId = res.order.data?.id ?? res.order.id!;
            cart.clear();
            if (res.next === 'await_phone_approval') setWaiting({ paymentId: res.payment.id, orderId });
            else router.replace(`/order/${orderId}`);
        } catch (e) {
            Alert.alert('Couldn’t place order', e instanceof ApiError ? e.friendly : 'Please try again.');
        } finally {
            setPlacing(false);
        }
    };

    // EcoCash/InnBucks/OneMoney: wait for the customer to approve the USSD prompt.
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(async () => {
            const p = await api.get<{ status: string }>(`/payments/${waiting.paymentId}`).catch(() => null);
            if (p?.status === 'paid') router.replace(`/order/${waiting.orderId}`);
            if (p?.status === 'failed' || p?.status === 'cancelled') {
                clearInterval(timer);
                Alert.alert('Payment not completed', 'The payment was declined or cancelled.', [{ text: 'OK', onPress: () => router.replace(`/order/${waiting.orderId}`) }]);
            }
        }, 3000);
        return () => clearInterval(timer);
    }, [waiting]);

    const donation = roundUp ? quote?.round_up?.amount.zig ?? 0 : 0;
    const usdPerZig = quote && quote.totals.total.zig > 0 ? quote.totals.total.usd / quote.totals.total.zig : 0;
    const total = quote ? { zig: quote.totals.total.zig + donation, usd: (quote.totals.total.zig + donation) * usdPerZig } : undefined;
    const walletPart = useWallet && method !== 'wallet' ? Math.min(quote?.wallet_balance.zig ?? 0, total?.zig ?? 0) : 0;
    const online = ['ecocash', 'onemoney', 'innbucks', 'card'].includes(method);
    const cashAllowed = !!quote?.split_tender && online && fulfilment === 'delivery' && (quote?.payment_methods ?? []).includes('cash');
    const cashPart = cashAllowed ? Math.min(Number(cashPartText) || 0, Math.max(0, (total?.zig ?? 0) - walletPart - 1)) : 0;
    const splitOk = !!quote?.split_bill && ['ecocash', 'onemoney', 'innbucks'].includes(method);
    const shares = splitOk ? friends.filter((f) => Number(f.amount) > 0 && f.phone.replace(/\D/g, '').length >= 9) : [];
    const sharesTotal = shares.reduce((s, f) => s + Number(f.amount), 0);
    const due = (total?.zig ?? 0) - walletPart - cashPart - sharesTotal;

    if (waiting) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
                <Text style={{ fontSize: 56 }}>📲</Text>
                <Text variant="title" center>{tr('Check your phone')}</Text>
                <Text color="muted" center>Approve the {label(method)} payment of {zig(due)} on {phone}. Enter your PIN when prompted.</Text>
                <ActivityIndicator color={t.brand} size="large" style={{ marginTop: 12 }} />
            </SafeAreaView>
        );
    }

    const canPlace = synced && quote && due > 0 && (!quote.needs_prescription || !!prescription) && (fulfilment === 'pickup' || addressId) && (!['ecocash', 'onemoney', 'innbucks'].includes(method) || phone.replace(/\D/g, '').length >= 9);

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1, fontSize: 22 }}>{tr('Checkout')}</Text>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 4, gap: 14, paddingBottom: 140 }}>
                <Row gap={8}>
                    <Chip label={`🛵  ${tr('Delivery')}`} active={fulfilment === 'delivery'} onPress={() => setFulfilment('delivery')} />
                    <Chip label={`🚶  ${tr('Pickup')}`} active={fulfilment === 'pickup'} onPress={() => setFulfilment('pickup')} />
                    {quote?.eta_minutes && <Text variant="caption" style={{ marginLeft: 'auto' }}>{quote.eta_minutes[0]}–{quote.eta_minutes[1]} min</Text>}
                </Row>

                {fulfilment === 'delivery' && (
                    <Card>
                        <Row justify="space-between"><Text variant="heading">{tr('Deliver to')}</Text><Pressable onPress={() => router.push('/addresses')}><Text variant="label" color="brand">{addresses.length ? 'Change / add' : 'Add address'}</Text></Pressable></Row>
                        {addresses.map((a) => (
                            <Pressable key={a.id} onPress={() => setAddressId(a.id)} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, alignItems: 'center' }}>
                                <Ionicons name={addressId === a.id ? 'radio-button-on' : 'radio-button-off'} size={22} color={addressId === a.id ? t.ink : t.faint} />
                                <View style={{ flex: 1 }}><Text variant="label">{a.label}</Text><Text variant="caption" numberOfLines={1}>{a.line1}{a.landmark ? ` · ${a.landmark}` : ''}, {a.city}</Text></View>
                            </Pressable>
                        ))}
                        {quote?.batch && (
                            <View style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: t.brandSoft }}>
                                <Text variant="label" color="brand">🚐  {quote.batch.zone} run</Text>
                                <Text variant="caption">Leaves {new Date(quote.batch.departs_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · arrives about {new Date(quote.batch.arrives_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                            </View>
                        )}
                        <Row gap={8} style={{ marginTop: 6 }}>
                            <Chip label="Hand it to me" active={dropoff === 'hand_to_me'} onPress={() => setDropoff('hand_to_me')} />
                            <Chip label="Leave at gate" active={dropoff === 'leave_at_door'} onPress={() => setDropoff('leave_at_door')} />
                        </Row>
                    </Card>
                )}

                <Card>
                    <Text variant="heading" style={{ marginBottom: 6 }}>{tr('Payment')}</Text>
                    {(quote?.payment_methods ?? ['ecocash', 'card', 'cash']).map((m) => {
                        const disabled = m === 'wallet' && (quote?.wallet_balance.zig ?? 0) < (total?.zig ?? 0);
                        return (
                            <Pressable key={m} disabled={disabled} onPress={() => setMethod(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: disabled ? 0.4 : 1 }}>
                                <Ionicons name={METHOD_ICON[m] ?? 'card-outline'} size={22} color={t.ink} />
                                <View style={{ flex: 1 }}><Text variant="label">{METHOD_LABEL[m] ?? label(m)}</Text>{m === 'wallet' && <Text variant="caption">Balance {zig(quote?.wallet_balance.zig)}</Text>}{m === 'company' && quote?.company && <Text variant="caption">{quote.company.company}{quote.company.left_today_zig != null ? ` · ${zig(quote.company.left_today_zig)} left today` : ''}</Text>}</View>
                                <Ionicons name={method === m ? 'radio-button-on' : 'radio-button-off'} size={22} color={method === m ? t.ink : t.faint} />
                            </Pressable>
                        );
                    })}
                    {quote?.split_tender && (quote.wallet_balance.zig ?? 0) > 0 && method !== 'wallet' && (
                        <Toggle value={useWallet} onChange={setUseWallet} label={`Use wallet balance (${zig(quote.wallet_balance.zig)})`} description={walletPart > 0 ? `${zig(walletPart)} from wallet · ${zig(due)} by ${METHOD_LABEL[method] ?? label(method)}` : 'Pay part with your wallet'} />
                    )}
                    {splitOk && (
                        <View style={{ marginTop: 10, gap: 8 }}>
                            <Row justify="space-between">
                                <Text variant="label">👥  Split the bill</Text>
                                <Row gap={14}>
                                    {friends.length > 0 && <Pressable onPress={() => { const each = Math.floor((((total?.zig ?? 0) - walletPart - cashPart) / (friends.length + 1)) * 100) / 100; setFriends(friends.map((f) => ({ ...f, amount: String(each) }))); }}><Text variant="label" color="brand">Split evenly</Text></Pressable>}
                                    {friends.length < (quote?.split_bill?.max_people ?? 0) && <Pressable onPress={() => setFriends([...friends, { name: '', phone: '', amount: '' }])}><Text variant="label" color="brand">+ Friend</Text></Pressable>}
                                </Row>
                            </Row>
                            {friends.map((f, i) => (
                                <Row key={i} gap={6}>
                                    <TextInput value={f.name} onChangeText={(v) => setFriends(friends.map((x, j) => (j === i ? { ...x, name: v } : x)))} placeholder="Name" placeholderTextColor={t.faint} style={{ flex: 1, height: 42, borderRadius: 10, backgroundColor: t.subtle, paddingHorizontal: 10, color: t.ink }} />
                                    <TextInput value={f.phone} onChangeText={(v) => setFriends(friends.map((x, j) => (j === i ? { ...x, phone: v } : x)))} keyboardType="phone-pad" placeholder="077…" placeholderTextColor={t.faint} style={{ flex: 1.2, height: 42, borderRadius: 10, backgroundColor: t.subtle, paddingHorizontal: 10, color: t.ink }} />
                                    <TextInput value={f.amount} onChangeText={(v) => setFriends(friends.map((x, j) => (j === i ? { ...x, amount: v } : x)))} keyboardType="decimal-pad" placeholder="ZiG" placeholderTextColor={t.faint} style={{ width: 70, height: 42, borderRadius: 10, backgroundColor: t.subtle, paddingHorizontal: 10, color: t.ink }} />
                                    <Pressable onPress={() => setFriends(friends.filter((_, j) => j !== i))}><Ionicons name="close" size={18} color={t.muted} /></Pressable>
                                </Row>
                            ))}
                            {shares.length > 0 && <Text variant="caption">Each friend gets a prompt on their phone. The order goes to the store once everyone has paid. You pay {zig(due)}.</Text>}
                        </View>
                    )}
                    {cashAllowed && (
                        <View style={{ marginTop: 8, gap: 6 }}>
                            <Text variant="label">💵  Pay part in cash? (optional)</Text>
                            <TextInput value={cashPartText} onChangeText={setCashPartText} keyboardType="decimal-pad" placeholder="ZiG 0" placeholderTextColor={t.faint} style={{ height: 46, borderRadius: 12, backgroundColor: t.subtle, paddingHorizontal: 14, fontSize: 15, color: t.ink }} />
                            {cashPart > 0 && <Text variant="caption">Hand {zig(cashPart)} to your driver · {zig(due)} by {METHOD_LABEL[method] ?? label(method)}</Text>}
                        </View>
                    )}
                    {['ecocash', 'onemoney', 'innbucks'].includes(method) && <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="077 123 4567" placeholderTextColor={t.faint} style={{ height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: 14, fontSize: 16, color: t.ink, marginTop: 6 }} />}
                </Card>

                {fulfilment === 'delivery' && (quote?.tip_presets_pct?.length ?? 0) > 0 && (
                    <Card>
                        <Row justify="space-between"><Text variant="heading">{tr('Tip your driver')}</Text><Text variant="caption">{tr('100% goes to them')}</Text></Row>
                        <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>{[0, ...(quote?.tip_presets_pct ?? [])].map((p) => <Chip key={p} label={p ? `${p}%` : 'No tip'} active={tipPct === p} onPress={() => setTipPct(p)} />)}</Row>
                    </Card>
                )}

                <Card>
                    <Row gap={8}>
                        <TextInput value={promo} onChangeText={(v) => setPromo(v.toUpperCase())} autoCapitalize="characters" placeholder={tr('Promo code')} placeholderTextColor={t.faint} style={{ flex: 1, height: 46, borderRadius: 12, backgroundColor: t.subtle, paddingHorizontal: 14, fontSize: 15, color: t.ink }} />
                        <Button title={tr('Apply')} size="md" tone="outline" onPress={applyPromo} disabled={!promo} />
                    </Row>
                    <TextInput value={notes} onChangeText={setNotes} placeholder={tr('Notes for the restaurant')} placeholderTextColor={t.faint} style={{ height: 46, borderRadius: 12, backgroundColor: t.subtle, paddingHorizontal: 14, fontSize: 15, color: t.ink, marginTop: 10 }} />
                </Card>

                {quote?.needs_prescription && (
                    <Card style={{ gap: 8 }}>
                        <Text variant="heading">💊  Prescription</Text>
                        <Text variant="caption">Your basket has prescription medicine. The pharmacist checks your prescription before accepting (full refund if declined).</Text>
                        <Button title={uploading ? 'Uploading…' : prescription ? 'Prescription added ✓ · replace' : 'Add prescription photo'} tone={prescription ? 'soft' : 'primary'} size="md" onPress={addPrescription} disabled={uploading} />
                    </Card>
                )}

                <Card>
                    <Toggle value={noCutlery} onChange={setNoCutlery} label={`🌿  ${tr('No cutlery or straws')}`} description={tr('Less plastic. Thank you!')} />
                    {quote?.round_up && (quote.round_up.amount.zig > 0 || roundUp) && (
                        <Toggle value={roundUp} onChange={setRoundUp} label={`❤️  Round up for ${quote.round_up.charity}`} description={`Add ${zig(quote.round_up.amount.zig)}. Every cent goes to the charity`} />
                    )}
                </Card>

                {quote && (
                    <Card tone="subtle">
                        {([[tr('Subtotal'), quote.totals.subtotal.zig], fulfilment === 'delivery' ? ['Delivery' + (quote.surge ? ` (${quote.surge.multiplier}× busy)` : ''), quote.totals.delivery.zig] : null, [tr('Service fee'), quote.totals.service.zig], quote.totals.small_order.zig ? ['Small order fee', quote.totals.small_order.zig] : null, quote.totals.discount.zig ? [quote.deal ?? 'Promo', -quote.totals.discount.zig] : null, tip ? ['Driver tip', quote.totals.tip.zig] : null, donation ? ['Donation', donation] : null, walletPart ? ['From wallet', -walletPart] : null, cashPart ? ['Cash to driver', -cashPart] : null, sharesTotal ? [`Friends (${shares.length})`, -sharesTotal] : null].filter(Boolean) as [string, number][]).map(([l, v]) => (
                            <Row key={l} justify="space-between" style={{ paddingVertical: 4 }}><Text color="muted">{l}</Text><Text color={v < 0 ? 'brand' : 'ink'}>{v < 0 ? `−${zig(-v)}` : zig(v)}</Text></Row>
                        ))}
                        {quote.totals.member_savings.zig > 0 && <Text variant="caption" color="brand">Zvino+ saved you {zig(quote.totals.member_savings.zig)} 🎉</Text>}
                    </Card>
                )}
            </ScrollView>
            <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.bg, borderTopWidth: 0.5, borderColor: t.border, padding: 16 }}>
                <Row justify="space-between" style={{ marginBottom: 10 }}>
                    <Text variant="heading">{tr('Total')}</Text>
                    <View style={{ alignItems: 'flex-end' }}><Text variant="title" style={{ fontSize: 22 }}>{total ? zig(total.zig) : '…'}</Text>{total && <Text variant="caption">{alt(total.zig)} · VAT incl.</Text>}</View>
                </Row>
                <Button title={`${tr('Place order')}${total ? ` · ${zig(due)}` : ''}`} loading={placing} disabled={!canPlace} onPress={place} />
            </SafeAreaView>
        </SafeAreaView>
    );
}

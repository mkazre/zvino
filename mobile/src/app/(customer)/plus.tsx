import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { normalisePhone, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Empty, Input, Row, Screen, Text, useTheme } from '@/ui';

interface Plan { id: number; name: string; price_zig: number; interval: 'month' | 'year'; min_order_for_free_delivery_zig: number; service_fee_discount_pct: number; perks: string[] | null }
interface Current { status: string; current_period_end: string; auto_renew?: boolean }

const METHODS: [string, string][] = [['wallet', 'Zvino wallet'], ['ecocash', 'EcoCash'], ['innbucks', 'InnBucks'], ['onemoney', 'OneMoney']];

/** Zvino+ membership: what it gives, joining (wallet or mobile money) and cancelling. */
export default function Plus() {
    const t = useTheme();
    const { me, refresh } = useSession();
    const [data, setData] = useState<{ enabled: boolean; plans: Plan[]; current: Current | null } | null>(null);
    const [method, setMethod] = useState('wallet');
    const [phone, setPhone] = useState(me?.phone?.replace('+263', '0') ?? '');
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => { api.get<typeof data>('/zvino-plus').then(setData).catch(() => setData({ enabled: false, plans: [], current: null })); }, []);
    useEffect(load, [load]);

    const plan = data?.plans[0];
    const current = data?.current;
    const until = current ? new Date(current.current_period_end).toLocaleDateString('en-ZW', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

    const join = async () => {
        if (!plan) return;
        setBusy(true);
        try {
            await api.post('/zvino-plus', { plan_id: plan.id, method, phone: method === 'wallet' ? null : normalisePhone(phone) });
            await refresh();
            load();
            Alert.alert('Zvino+', method === 'wallet' ? 'Welcome to Zvino+. Your benefits apply from your next order.' : 'Approve the payment prompt on your phone. Your membership starts as soon as it is paid.');
        } catch (e) {
            Alert.alert('Couldn’t join', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    const cancel = () => Alert.alert('Cancel Zvino+?', `You keep your benefits until ${until}. It won’t renew after that.`, [
        { text: 'Keep it', style: 'cancel' },
        { text: 'Cancel membership', style: 'destructive', onPress: () => api.delete('/zvino-plus').then(() => { refresh(); load(); }).catch((e) => Alert.alert('Zvino+', e instanceof ApiError ? e.friendly : '')) },
    ]);

    const perks: [keyof typeof Ionicons.glyphMap, string, string][] = plan ? [
        ['bicycle-outline', 'Free delivery', `On every order over ${zig(plan.min_order_for_free_delivery_zig)} from any store.`],
        ['pricetag-outline', `${plan.service_fee_discount_pct}% off service fees`, 'Pay less on every order, even pickup.'],
        ['sparkles-outline', 'Member-only deals', 'Exclusive discounts and early access to new stores.'],
    ] : [];

    return (
        <Screen onRefresh={load}>
            <Row justify="space-between" style={{ marginTop: 4 }}>
                <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={22} color={t.ink} /></Pressable>
            </Row>

            <View style={{ backgroundColor: t.inverse, borderRadius: 26, padding: 22, marginTop: 14, gap: 10 }}>
                <Row gap={6} style={{ alignSelf: 'flex-start', backgroundColor: t.onInverseFill, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
                    <Ionicons name="sparkles" size={14} color={t.onInverseAccent} /><Text variant="label" style={{ color: t.onInverseAccent }}>ZVINO+</Text>
                </Row>
                <Text variant="display" color="onInverse" style={{ fontSize: 30, lineHeight: 34 }}>Free delivery.{'\n'}Every single order.</Text>
                {plan && <Text style={{ color: t.onInverseMuted }}>For {zig(plan.price_zig)} a {plan.interval}.</Text>}
                {current && (
                    <Row gap={8} style={{ marginTop: 4 }}>
                        <Ionicons name="checkmark-circle" size={20} color={t.onInverseAccent} />
                        <Text variant="label" color="onInverse" style={{ flex: 1 }}>{current.status === 'cancelled' ? `Active until ${until}, won’t renew` : `You’re a member until ${until}`}</Text>
                    </Row>
                )}
            </View>

            {!data ? null : !plan || !data.enabled ? (
                <Empty icon="sparkles-outline" title="Zvino+ is coming soon" body="We’ll let you know as soon as memberships open." />
            ) : (
                <>
                    <View style={{ gap: 10, marginTop: 16 }}>
                        {perks.map(([icon, title, sub]) => (
                            <Card key={title}>
                                <Row gap={14} align="flex-start">
                                    <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={20} color={t.brandText} /></View>
                                    <View style={{ flex: 1 }}><Text variant="heading">{title}</Text><Text variant="caption">{sub}</Text></View>
                                </Row>
                            </Card>
                        ))}
                        {plan.perks?.map((p) => <Row key={p} gap={10} style={{ paddingHorizontal: 4 }}><Ionicons name="checkmark" size={18} color={t.brandText} /><Text style={{ flex: 1 }}>{p}</Text></Row>)}
                    </View>

                    {!current ? (
                        <Card style={{ marginTop: 16, gap: 12 }}>
                            <Text variant="heading">Join {plan.name}</Text>
                            <Row gap={8} style={{ flexWrap: 'wrap' }}>{METHODS.map(([k, l]) => <Chip key={k} label={k === 'wallet' && me ? `${l} · ${zig(me.wallet_balance_zig)}` : l} active={method === k} onPress={() => setMethod(k)} />)}</Row>
                            {method !== 'wallet' && <Input label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="077 123 4567" />}
                            <Button title={`Pay ${zig(plan.price_zig)}`} loading={busy} disabled={method !== 'wallet' && phone.replace(/\D/g, '').length < 9} onPress={join} />
                            <Text variant="caption" style={{ textAlign: 'center' }}>Cancel anytime. Your benefits last until the end of the period.</Text>
                        </Card>
                    ) : current.status !== 'cancelled' ? (
                        <Pressable onPress={cancel} style={{ alignItems: 'center', paddingVertical: 18 }}><Text variant="label" color="muted">Cancel membership</Text></Pressable>
                    ) : null}
                </>
            )}
        </Screen>
    );
}

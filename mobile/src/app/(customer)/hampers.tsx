import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, ApiError, type Money } from '@/lib/api';
import { normalisePhone, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Chip, Empty, Input, Row, Screen, Text, useTheme } from '@/ui';
import { DateField } from '@/ui/date-field';

interface Hamper { id: number; name: string; description: string | null; vendor: { name: string; city: string } | null; price: Money; contents: { name: string; quantity: number }[] }

/** Diaspora hampers (#8): send groceries to family in Zimbabwe once or monthly, paid from the wallet. */
export default function Hampers() {
    const t = useTheme();
    const { me, refresh } = useSession();
    const [list, setList] = useState<Hamper[]>([]);
    const [pick, setPick] = useState<Hamper | null>(null);
    const [f, setF] = useState({ recipient_name: '', recipient_phone: '', line1: '', suburb: '', city: 'Harare', landmark: '', frequency: 'monthly', day_of_month: '25', deliver_on: '', gift_message: '' });
    const [busy, setBusy] = useState(false);
    useFocusEffect(useCallback(() => { api.get<Hamper[]>('/hampers').then(setList).catch(() => {}); }, []));

    const send = async () => {
        if (!pick) return;
        setBusy(true);
        try {
            const r = await api.post<{ next_delivery: string }>(`/hampers/${pick.id}/send`, { ...f, recipient_phone: normalisePhone(f.recipient_phone), day_of_month: f.frequency === 'monthly' ? Number(f.day_of_month) : null, deliver_on: f.frequency === 'once' ? f.deliver_on : null });
            Alert.alert('Hamper on its way', `First delivery ${new Date(r.next_delivery).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}. ${f.recipient_name} gets an SMS.`);
            setPick(null);
            refresh();
        } catch (e) {
            const msg = e instanceof ApiError ? e.friendly : 'Please check the details';
            Alert.alert('Hamper', msg, /wallet/i.test(msg) ? [{ text: 'Later' }, { text: 'Top up wallet', onPress: () => router.push('/wallet') }] : undefined);
        } finally {
            setBusy(false);
        }
    };

    return (
        <Screen>
            <Row gap={12} style={{ marginTop: 8 }}>
                <Pressable onPress={() => (pick ? setPick(null) : router.back())}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1 }}>Send groceries home</Text>
            </Row>
            <Text color="muted" style={{ marginTop: 6 }}>Pay from your Zvino wallet (top up by card from anywhere). We deliver to their gate and SMS them.</Text>

            {pick ? (
                <Card style={{ marginTop: 14, gap: 10 }}>
                    <Text variant="heading">{pick.name} · {zig(pick.price.zig)}</Text>
                    <Text variant="caption">Wallet balance {zig(me?.wallet_balance_zig)}</Text>
                    <Row gap={10}>
                        <View style={{ flex: 1 }}><Input label="Who is it for?" value={f.recipient_name} onChangeText={(v) => setF({ ...f, recipient_name: v })} /></View>
                        <View style={{ flex: 1 }}><Input label="Their phone" value={f.recipient_phone} onChangeText={(v) => setF({ ...f, recipient_phone: v })} keyboardType="phone-pad" /></View>
                    </Row>
                    <Input label="Address / stand number" value={f.line1} onChangeText={(v) => setF({ ...f, line1: v })} />
                    <Row gap={10}>
                        <View style={{ flex: 1 }}><Input label="Suburb" value={f.suburb} onChangeText={(v) => setF({ ...f, suburb: v })} /></View>
                        <View style={{ flex: 1 }}><Input label="City" value={f.city} onChangeText={(v) => setF({ ...f, city: v })} /></View>
                    </Row>
                    <Input label="Landmark" value={f.landmark} onChangeText={(v) => setF({ ...f, landmark: v })} placeholder="Opposite the church, green gate" />
                    <Row gap={8}><Chip label="Every month" active={f.frequency === 'monthly'} onPress={() => setF({ ...f, frequency: 'monthly' })} /><Chip label="Just once" active={f.frequency === 'once'} onPress={() => setF({ ...f, frequency: 'once' })} /></Row>
                    {f.frequency === 'monthly' ? <Input label="Day of the month (1–28)" value={f.day_of_month} onChangeText={(v) => setF({ ...f, day_of_month: v.replace(/\D/g, '') })} keyboardType="number-pad" /> : <DateField label="Delivery date" value={f.deliver_on} onChange={(v) => setF({ ...f, deliver_on: v })} minimumDate={new Date(Date.now() + 864e5)} />}
                    <Input label="Gift message (optional)" value={f.gift_message} onChangeText={(v) => setF({ ...f, gift_message: v })} maxLength={200} />
                    <Button title="Send hamper" tone="primary" loading={busy} disabled={!f.recipient_name || !f.recipient_phone || !f.line1} onPress={send} />
                </Card>
            ) : (
                <>
                    {list.length === 0 && <Empty icon="gift-outline" title="Hampers coming soon" />}
                    {list.map((h) => (
                        <Card key={h.id} style={{ marginTop: 12, gap: 6 }} onPress={() => setPick(h)}>
                            <Row justify="space-between"><Text variant="heading">{h.name}</Text><Text variant="heading">{zig(h.price.zig)}</Text></Row>
                            <Text variant="caption">{h.vendor?.name} · {h.vendor?.city} · {zig(h.price.zig)}</Text>
                            {h.description && <Text color="muted">{h.description}</Text>}
                            <Text variant="caption">{h.contents.map((c) => `${c.quantity}× ${c.name}`).join(' · ')}</Text>
                        </Card>
                    ))}
                </>
            )}
        </Screen>
    );
}

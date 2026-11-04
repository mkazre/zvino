import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, ApiError } from '@/lib/api';
import { label, normalisePhone, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, Input, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';
import { DateField } from '@/ui/date-field';

interface Req { id: number; reference: string; event_type: string; event_at: string; headcount: number; status: string; quote_zig: number | null; quote_note: string | null; deposit_zig: number; paid_zig: number; amount_due_zig: number; vendor: { id: number; name: string } | null }
const TYPES = [['funeral', 'Funeral'], ['wedding', 'Wedding / roora'], ['gathering', 'Gathering'], ['church', 'Church'], ['corporate', 'Company'], ['other', 'Other']] as const;

/** Catering for funerals, weddings and gatherings (#9): request a quote, then pay deposit and balance. */
export default function Catering() {
    const t = useTheme();
    const { me } = useSession();
    const { store, storeName } = useLocalSearchParams<{ store?: string; storeName?: string }>();
    const [list, setList] = useState<Req[]>([]);
    const [f, setF] = useState({ event_type: 'funeral', date: '', time: '12:00', headcount: '50', location: '', contact_name: me?.name ?? '', contact_phone: me?.phone?.replace('+263', '0') ?? '', notes: '' });
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => { api.get<Req[]>('/catering').then(setList).catch(() => {}); }, []);
    useFocusEffect(load);

    const submit = async () => {
        setBusy(true);
        try {
            await api.post('/catering', { vendor_id: Number(store), event_type: f.event_type, event_at: `${f.date} ${f.time}:00`, headcount: Number(f.headcount), location: f.location, contact_name: f.contact_name, contact_phone: normalisePhone(f.contact_phone), notes: f.notes });
            Alert.alert('Request sent ✓', 'The caterer will reply with a quote. We’ll notify you.');
            router.setParams({ store: undefined });
            load();
        } catch (e) {
            Alert.alert('Catering', e instanceof ApiError ? e.friendly : 'Please check the details');
        } finally {
            setBusy(false);
        }
    };
    const pay = (r: Req) => Alert.alert(`Pay ${zig(r.amount_due_zig)}`, r.status === 'quoted' ? 'Deposit to confirm your booking.' : 'Balance before the event.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'EcoCash', onPress: () => api.post(`/catering/${r.id}/pay`, { method: 'ecocash', phone: me?.phone }).then(() => { Alert.alert('Check your phone', 'Approve the EcoCash prompt.'); load(); }).catch((e) => Alert.alert('Pay', e instanceof ApiError ? e.friendly : '')) },
        { text: 'Wallet', onPress: () => api.post(`/catering/${r.id}/pay`, { method: 'wallet' }).then(load).catch((e) => Alert.alert('Pay', e instanceof ApiError ? e.friendly : '')) },
    ]);

    return (
        <Screen onRefresh={load}>
            <Row gap={12} style={{ marginTop: 8 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1 }}>Catering</Text>
            </Row>
            <Text color="muted" style={{ marginTop: 6 }}>Funerals, weddings, church and family gatherings. Get a quote, pay a deposit to confirm.</Text>

            {store && (
                <Card style={{ marginTop: 14, gap: 10 }}>
                    <Text variant="heading">Request from {storeName}</Text>
                    <Row gap={6} style={{ flexWrap: 'wrap' }}>{TYPES.map(([v, l]) => <Chip key={v} label={l} active={f.event_type === v} onPress={() => setF({ ...f, event_type: v })} />)}</Row>
                    <Row gap={10}>
                        <View style={{ flex: 1.4 }}><DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} minimumDate={new Date()} /></View>
                        <View style={{ flex: 1 }}><DateField label="Time" mode="time" value={f.time} onChange={(v) => setF({ ...f, time: v })} /></View>
                    </Row>
                    <Input label="How many people" value={f.headcount} onChangeText={(v) => setF({ ...f, headcount: v.replace(/\D/g, '') })} keyboardType="number-pad" />
                    <Input label="Where" value={f.location} onChangeText={(v) => setF({ ...f, location: v })} placeholder="Address, church, venue or rural home" />
                    <Row gap={10}>
                        <View style={{ flex: 1 }}><Input label="Contact on the day" value={f.contact_name} onChangeText={(v) => setF({ ...f, contact_name: v })} /></View>
                        <View style={{ flex: 1 }}><Input label="Phone" value={f.contact_phone} onChangeText={(v) => setF({ ...f, contact_phone: v })} keyboardType="phone-pad" /></View>
                    </Row>
                    <Input label="What would you like?" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} placeholder="Sadza, beef stew, chicken, rice, greens, drinks…" multiline style={{ height: 90, textAlignVertical: 'top', paddingTop: 12 }} />
                    <Button title="Send request" tone="primary" loading={busy} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || !f.location} onPress={submit} />
                </Card>
            )}

            <SectionTitle>Your bookings</SectionTitle>
            {list.length === 0 && !store && <Empty emoji="🍲" title="No catering yet" body="Open a store that offers catering and tap “Cater an event”." />}
            {list.map((r) => (
                <Card key={r.id} style={{ marginBottom: 10, gap: 4 }}>
                    <Row justify="space-between"><Text variant="heading">{label(r.event_type)} · {r.headcount}</Text><Badge tone={['deposit_paid', 'paid', 'completed'].includes(r.status) ? 'brand' : r.status === 'quoted' ? 'gold' : 'neutral'}>{label(r.status)}</Badge></Row>
                    <Text color="muted">{r.vendor?.name} · {new Date(r.event_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                    {r.quote_zig != null && <Text>Quote {zig(r.quote_zig)} · deposit {zig(r.deposit_zig)}{r.paid_zig > 0 ? ` · paid ${zig(r.paid_zig)}` : ''}</Text>}
                    {r.quote_note && <Text variant="caption">{r.quote_note}</Text>}
                    {r.amount_due_zig > 0 && ['quoted', 'deposit_paid'].includes(r.status) && <Button title={`Pay ${r.status === 'quoted' ? 'deposit' : 'balance'} · ${zig(r.amount_due_zig)}`} tone="primary" size="md" onPress={() => pay(r)} style={{ marginTop: 6 }} />}
                    {['requested', 'quoted', 'deposit_paid', 'paid'].includes(r.status) && <Pressable onPress={() => Alert.alert('Cancel booking?', 'Deposits are kept if you cancel within a day of the event.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel booking', style: 'destructive', onPress: () => api.post(`/catering/${r.id}/cancel`).then(load) }])}><Text variant="caption" color="red" style={{ marginTop: 6 }}>Cancel booking</Text></Pressable>}
                </Card>
            ))}
        </Screen>
    );
}

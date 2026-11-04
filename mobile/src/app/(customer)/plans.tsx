import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, ApiError, type Money } from '@/lib/api';
import { label, normalisePhone, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Empty, Input, Row, Screen, SectionTitle, Text, Toggle, useTheme } from '@/ui';

interface Plan {
    id: number; name: string; kind: 'weekly' | 'monthly'; weekdays: number[] | null; day_of_month: number | null; time: string;
    payment_method: string; is_active: boolean; next_run_at: string | null; last_error: string | null;
    vendor: { id: number; name: string } | null; address: { label: string; line1: string } | null;
    lines: { item_id: number; quantity: number; name: string }[]; estimate: Money;
}
interface OrderDetail { id: number; fulfilment: string; vendor: { id: number; name: string }; address?: { id: number } | null; items: { item_id: number; name: string; quantity: number; options: { variant?: string | null; modifiers?: string[] } | null }[] }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Recurring orders: weekday lunch for school or office (#17), and the month-end shop on payday (#10). */
export default function Plans() {
    const t = useTheme();
    const { me } = useSession();
    const { fromOrder } = useLocalSearchParams<{ fromOrder?: string }>();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [source, setSource] = useState<OrderDetail | null>(null);
    const [form, setForm] = useState({ name: 'Weekday lunch', kind: 'weekly' as 'weekly' | 'monthly', weekdays: [1, 2, 3, 4, 5], day_of_month: '25', time: '12:30', payment_method: 'wallet', phone: me?.phone?.replace('+263', '0') ?? '' });
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => { api.get<Plan[]>('/plans').then(setPlans).catch(() => {}); }, []);
    useFocusEffect(load);
    useEffect(() => {
        if (fromOrder) api.get<{ data: OrderDetail }>(`/orders/${fromOrder}`).then((r) => setSource(r.data)).catch(() => {});
    }, [fromOrder]);

    const create = async () => {
        if (!source) return;
        setSaving(true);
        try {
            await api.post('/plans', {
                name: form.name, vendor_id: source.vendor.id, kind: form.kind,
                weekdays: form.kind === 'weekly' ? form.weekdays : null, day_of_month: form.kind === 'monthly' ? Number(form.day_of_month) : null,
                time: form.time, fulfilment: source.fulfilment, address_id: source.address?.id ?? null,
                payment_method: form.payment_method, phone: form.payment_method === 'wallet' ? null : normalisePhone(form.phone),
                lines: source.items.filter((i) => i.item_id).map((i) => ({ item_id: i.item_id, quantity: i.quantity, variant: i.options?.variant ?? null, modifiers: i.options?.modifiers ?? [] })),
            });
            setSource(null);
            router.setParams({ fromOrder: undefined });
            load();
        } catch (e) {
            Alert.alert('Plan', e instanceof ApiError ? e.friendly : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const when = (p: Plan) => (p.kind === 'monthly' ? `Every month on the ${p.day_of_month}th at ${p.time}` : `${(p.weekdays ?? []).map((d) => DAYS[d - 1]).join(', ')} at ${p.time}`);

    return (
        <Screen onRefresh={load}>
            <Row gap={12} style={{ marginTop: 8 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1 }}>Regular orders</Text>
            </Row>
            <Text color="muted" style={{ marginTop: 6 }}>School or office lunch on weekdays, or your big month-end shop on payday. We place it for you and remind you the day before a monthly shop.</Text>

            {source && (
                <Card style={{ marginTop: 14, gap: 12 }}>
                    <Text variant="heading">New plan from {source.vendor.name}</Text>
                    <Text variant="caption">{source.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</Text>
                    <Input label="Name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                    <Row gap={8}>
                        <Chip label="Weekdays / weekly" active={form.kind === 'weekly'} onPress={() => setForm({ ...form, kind: 'weekly', name: form.name === 'Month-end shop' ? 'Weekday lunch' : form.name })} />
                        <Chip label="Monthly (payday)" active={form.kind === 'monthly'} onPress={() => setForm({ ...form, kind: 'monthly', name: form.name === 'Weekday lunch' ? 'Month-end shop' : form.name, time: '10:00' })} />
                    </Row>
                    {form.kind === 'weekly' ? (
                        <Row gap={6} style={{ flexWrap: 'wrap' }}>{DAYS.map((d, i) => <Chip key={d} label={d} active={form.weekdays.includes(i + 1)} onPress={() => setForm({ ...form, weekdays: form.weekdays.includes(i + 1) ? form.weekdays.filter((x) => x !== i + 1) : [...form.weekdays, i + 1].sort() })} />)}</Row>
                    ) : (
                        <Input label="Day of the month (1–28)" value={form.day_of_month} onChangeText={(v) => setForm({ ...form, day_of_month: v.replace(/\D/g, '') })} keyboardType="number-pad" />
                    )}
                    <Input label="Delivery time (HH:MM)" value={form.time} onChangeText={(v) => setForm({ ...form, time: v })} placeholder="12:30" />
                    <Row gap={8} style={{ flexWrap: 'wrap' }}>{['wallet', 'ecocash', 'innbucks', 'cash'].map((m) => <Chip key={m} label={label(m)} active={form.payment_method === m} onPress={() => setForm({ ...form, payment_method: m })} />)}</Row>
                    {['ecocash', 'innbucks'].includes(form.payment_method) && <Input label="Number for the payment prompt" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />}
                    <Text variant="caption">{form.payment_method === 'wallet' ? 'Paid from your Zvino wallet each time (we’ll prompt EcoCash if it runs low).' : form.payment_method === 'cash' ? 'Pay the driver in cash each time.' : 'You’ll get a prompt on your phone to approve each order.'}</Text>
                    <Button title="Save plan" tone="primary" loading={saving} disabled={!/^\d{2}:\d{2}$/.test(form.time) || (form.kind === 'weekly' && !form.weekdays.length)} onPress={create} />
                </Card>
            )}

            <SectionTitle>Your plans</SectionTitle>
            {plans.length === 0 && !source && <Empty emoji="🔁" title="No regular orders yet" body="Open any past order and tap “Make this a regular order”." />}
            {plans.map((p) => (
                <Card key={p.id} style={{ marginBottom: 10, gap: 6 }}>
                    <Row justify="space-between"><Text variant="heading">{p.name}</Text><Badge tone={p.is_active ? 'brand' : 'neutral'}>{p.is_active ? 'On' : 'Paused'}</Badge></Row>
                    <Text color="muted">{p.vendor?.name} · {when(p)}</Text>
                    <Text variant="caption">{p.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')} · about {zig(p.estimate.zig)} · {label(p.payment_method)}</Text>
                    {p.next_run_at && p.is_active && <Text variant="caption">Next: {new Date(p.next_run_at).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>}
                    {p.last_error && <Text variant="caption" color="red">Last time: {p.last_error}</Text>}
                    <Toggle value={p.is_active} onChange={(v) => api.patch(`/plans/${p.id}`, { is_active: v }).then(load)} label={p.is_active ? 'Active' : 'Paused'} />
                    <Row gap={16}>
                        {p.is_active && <Pressable onPress={() => api.post(`/plans/${p.id}/skip`).then(load)}><Text variant="label" color="brand">Skip next</Text></Pressable>}
                        <Pressable onPress={() => Alert.alert('Delete plan?', p.name, [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => api.delete(`/plans/${p.id}`).then(load) }])}><Text variant="label" color="red">Delete</Text></Pressable>
                    </Row>
                </Card>
            ))}
            <View style={{ height: 40 }} />
        </Screen>
    );
}

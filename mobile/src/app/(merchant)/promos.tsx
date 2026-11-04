import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, ApiError, type Money } from '@/lib/api';
import { zig } from '@/lib/money';
import { Badge, Button, Card, Chip, Empty, Input, Row, Screen, SectionTitle, Text, Toggle, useTheme } from '@/ui';

interface Promo {
    id: number; code: string; title: string | null; type: 'percent' | 'fixed' | 'free_delivery'; value: number;
    min_order_zig: number; max_uses: number | null; used_count: number; ends_at: string | null; is_active: boolean;
    orders: number; sales: Money; cost: Money;
}
interface Data { enabled: boolean; max_pct: number; promos: Promo[] }

const describe = (p: Pick<Promo, 'type' | 'value'>) => (p.type === 'percent' ? `${p.value}% off` : p.type === 'fixed' ? `${zig(p.value)} off` : 'Free delivery');

/** Store manager: create and track the store's own promo codes (the store funds the discount). */
export default function Promos() {
    const t = useTheme();
    const [d, setD] = useState<Data | null>(null);
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ code: '', title: '', type: 'percent' as Promo['type'], value: '10', min_order_zig: '', max_uses: '', days: '7' });

    const load = useCallback(() => { api.get<Data>('/merchant/promos').then(setD); }, []);
    useFocusEffect(load);

    const save = async () => {
        setSaving(true);
        try {
            await api.post('/merchant/promos', {
                code: form.code, title: form.title || null, type: form.type,
                value: form.type === 'free_delivery' ? 0 : Number(form.value),
                min_order_zig: form.min_order_zig ? Number(form.min_order_zig) : 0,
                max_uses: form.max_uses ? Number(form.max_uses) : null,
                ends_at: form.days ? new Date(Date.now() + Number(form.days) * 864e5).toISOString() : null,
            });
            setCreating(false);
            setForm({ ...form, code: '', title: '' });
            load();
        } catch (e) {
            Alert.alert('Promo', e instanceof ApiError ? e.friendly : 'Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (p: Promo) => {
        await api.patch(`/merchant/promos/${p.id}`, { is_active: !p.is_active }).catch((e) => Alert.alert('Promo', e instanceof ApiError ? e.friendly : ''));
        load();
    };

    return (
        <Screen onRefresh={load}>
            <Row style={{ marginTop: 8 }} gap={12}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ flex: 1 }}>Promotions</Text>
                {d?.enabled && !creating && <Button title="New" size="sm" tone="primary" onPress={() => setCreating(true)} />}
            </Row>
            <Text color="muted" style={{ marginTop: 6 }}>Codes for your store only. Discounts come out of your sales, and you can see exactly what each code brought in.</Text>

            {d && !d.enabled && <Card tone="gold" style={{ marginTop: 14 }}><Text>Store promotions are switched off by Zvino right now.</Text></Card>}

            {creating && (
                <Card style={{ marginTop: 14, gap: 12 }}>
                    <Input label="Code" value={form.code} onChangeText={(v) => setForm({ ...form, code: v.toUpperCase().replace(/[^A-Z0-9]/g, '') })} autoCapitalize="characters" placeholder="SADZA20" />
                    <Input label="Headline (shown to customers)" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="20% off lunch this week" />
                    <Row gap={8}>
                        {(['percent', 'fixed', 'free_delivery'] as const).map((ty) => <Chip key={ty} label={ty === 'percent' ? '% off' : ty === 'fixed' ? 'ZiG off' : 'Free delivery'} active={form.type === ty} onPress={() => setForm({ ...form, type: ty })} />)}
                    </Row>
                    {form.type !== 'free_delivery' && <Input label={form.type === 'percent' ? `Discount % (max ${d?.max_pct ?? 50})` : 'Discount (ZiG)'} value={form.value} onChangeText={(v) => setForm({ ...form, value: v })} keyboardType="decimal-pad" />}
                    <Row gap={10}>
                        <View style={{ flex: 1 }}><Input label="Min. order (ZiG)" value={form.min_order_zig} onChangeText={(v) => setForm({ ...form, min_order_zig: v })} keyboardType="decimal-pad" placeholder="0" /></View>
                        <View style={{ flex: 1 }}><Input label="Max uses" value={form.max_uses} onChangeText={(v) => setForm({ ...form, max_uses: v })} keyboardType="number-pad" placeholder="Unlimited" /></View>
                    </Row>
                    <Input label="Runs for (days)" value={form.days} onChangeText={(v) => setForm({ ...form, days: v })} keyboardType="number-pad" />
                    <Row gap={10}>
                        <Button title="Cancel" tone="ghost" size="md" onPress={() => setCreating(false)} style={{ flex: 1 }} />
                        <Button title="Create code" tone="primary" size="md" loading={saving} disabled={form.code.length < 3} onPress={save} style={{ flex: 1 }} />
                    </Row>
                </Card>
            )}

            <SectionTitle>Your codes</SectionTitle>
            {d?.promos.length === 0 && <Empty emoji="🏷️" title="No promotions yet" body="A good first code: 10% off for new customers, minimum ZiG 100." />}
            {d?.promos.map((p) => (
                <Card key={p.id} style={{ marginBottom: 10, gap: 6 }}>
                    <Row justify="space-between">
                        <Text variant="heading" style={{ fontFamily: 'monospace' }}>{p.code}</Text>
                        <Badge tone={p.is_active ? 'brand' : 'neutral'}>{p.is_active ? 'Live' : 'Paused'}</Badge>
                    </Row>
                    <Text color="muted">{p.title ?? describe(p)}{p.min_order_zig > 0 ? ` · min ${zig(p.min_order_zig)}` : ''}{p.ends_at ? ` · ends ${new Date(p.ends_at).toLocaleDateString()}` : ''}</Text>
                    <Row gap={16} style={{ marginTop: 4 }}>
                        <View><Text variant="caption">Orders</Text><Text variant="label">{p.orders}{p.max_uses ? ` / ${p.max_uses}` : ''}</Text></View>
                        <View><Text variant="caption">Sales</Text><Text variant="label">{zig(p.sales.zig)}</Text></View>
                        <View><Text variant="caption">Discount given</Text><Text variant="label">{zig(p.cost.zig)}</Text></View>
                    </Row>
                    <Toggle value={p.is_active} onChange={() => toggle(p)} label={p.is_active ? 'Customers can use this code' : 'Paused'} />
                </Card>
            ))}
        </Screen>
    );
}

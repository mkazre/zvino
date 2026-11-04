import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { api, ApiError, type Money } from '@/lib/api';
import { normalisePhone, timeAgo, zig } from '@/lib/money';
import { Button, Card, Chip, Input, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';

interface Earnings {
    earned: Money; tips: Money; trips: number; balance: Money; cash_held: Money; cash_limit: Money;
    entries: { id: number; type: string; amount_zig: number; description: string; created_at: string }[];
    daily: Record<string, number>;
}

export default function EarningsScreen() {
    const t = useTheme();
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
    const [e, setE] = useState<Earnings | null>(null);
    const [phone, setPhone] = useState('');
    const [remitting, setRemitting] = useState(false);

    const load = useCallback(() => {
        api.get<Earnings>(`/driver/earnings?period=${period}`).then(setE);
    }, [period]);
    useFocusEffect(load);

    const remit = async () => {
        setRemitting(true);
        try {
            const r = await api.post<{ status: string; amount: Money }>('/driver/cash/remit', { phone: normalisePhone(phone), method: 'ecocash' });
            Alert.alert(r.status === 'paid' ? 'Cash remitted ✓' : 'Approve on your phone', `${zig(r.amount.zig)} via EcoCash`);
            load();
        } catch (err) {
            Alert.alert('Remit cash', err instanceof ApiError ? err.friendly : '');
        } finally {
            setRemitting(false);
        }
    };

    const days = Object.entries(e?.daily ?? {}).slice(-7);
    const max = Math.max(1, ...days.map(([, v]) => v));

    return (
        <Screen onRefresh={load}>
            <Text variant="title" style={{ marginTop: 8 }}>Earnings</Text>
            <Row gap={8} style={{ marginTop: 12 }}>{(['today', 'week', 'month'] as const).map((p) => <Chip key={p} label={p === 'today' ? 'Today' : p === 'week' ? 'This week' : 'This month'} active={period === p} onPress={() => setPeriod(p)} />)}</Row>
            <Card tone="inverse" style={{ marginTop: 14 }}>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>Earned</Text>
                <Text variant="display" color="onInverse">{zig(e?.earned.zig)}</Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>{e?.trips ?? 0} trips · {zig(e?.tips.zig)} in tips · ${e?.earned.usd.toFixed(2) ?? '0.00'}</Text>
                {days.length > 1 && (
                    <Row gap={6} align="flex-end" style={{ height: 70, marginTop: 16 }}>
                        {days.map(([d, v]) => <View key={d} style={{ flex: 1, height: `${(v / max) * 100}%`, minHeight: 3, backgroundColor: '#5fe0b3', borderRadius: 4 }} />)}
                    </Row>
                )}
            </Card>
            <Row gap={12} style={{ marginTop: 12 }}>
                <Card style={{ flex: 1 }}><Text variant="caption">Next payout</Text><Text variant="heading">{zig(Math.max(0, (e?.balance.zig ?? 0) + (e?.cash_held.zig ?? 0)))}</Text></Card>
                <Card style={{ flex: 1 }} tone={(e?.cash_held.zig ?? 0) > 0 ? 'gold' : 'surface'}><Text variant="caption">Cash held</Text><Text variant="heading">{zig(e?.cash_held.zig)}</Text></Card>
            </Row>

            {(e?.cash_held.zig ?? 0) > 0 && (
                <Card style={{ marginTop: 12, gap: 10 }}>
                    <Text variant="heading">Remit cash via EcoCash</Text>
                    <Text variant="caption">You’ve collected {zig(e?.cash_held.zig)} from cash orders. Limit {zig(e?.cash_limit.zig)}.</Text>
                    <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Your EcoCash number" />
                    <Button title={`Remit ${zig(e?.cash_held.zig)}`} tone="primary" loading={remitting} disabled={phone.replace(/\D/g, '').length < 9} onPress={remit} />
                </Card>
            )}

            <SectionTitle>Activity</SectionTitle>
            {e?.entries.map((x) => (
                <Row key={x.id} justify="space-between" style={{ paddingVertical: 10, borderBottomWidth: 0.5, borderColor: t.border }}>
                    <View style={{ flex: 1 }}><Text variant="label">{x.description}</Text><Text variant="caption">{timeAgo(x.created_at)}</Text></View>
                    <Text variant="label" color={x.amount_zig < 0 ? 'red' : 'brand'}>{x.amount_zig < 0 ? '−' : '+'}{zig(Math.abs(x.amount_zig))}</Text>
                </Row>
            ))}
        </Screen>
    );
}

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { api, ApiError, type Money } from '@/lib/api';
import { label, timeAgo, zig } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Button, Card, Row, Screen, SectionTitle, Text, useTheme, Logo } from '@/ui';
import { LanguagePicker } from '@/features/language';
import { ThemePicker } from '@/features/theme-picker';
import { appVersion } from '@/lib/brand';

interface Earnings { sales: Money; commission: Money; refunds: Money; net: Money; balance: Money; payouts: { id: number; amount_zig: number; status: string; period_end: string; is_instant?: boolean }[]; available_now: Money; instant_payout: { fee_pct: number; min: Money } | null }
interface Insights { best_sellers: { name: string; qty: number; revenue: number }[]; slow_movers: { id: number; name: string }[]; orders_by_hour: Record<string, number>; rating: { average: number; count: number } }
interface Review { id: number; vendor_rating: number; comment: string | null; vendor_reply: string | null; created_at: string; user?: { name: string } }

/** Earnings, menu insights and reviews (managers); sign-out for everyone. */
export default function More() {
    const t = useTheme();
    const { me, signOut } = useSession();
    const manager = me?.role === 'vendor_manager';
    const [e, setE] = useState<Earnings | null>(null);
    const [ins, setIns] = useState<Insights | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);

    useFocusEffect(useCallback(() => {
        if (!manager) return;
        api.get<Earnings>('/merchant/earnings?period=week').then(setE);
        api.get<Insights>('/merchant/insights').then(setIns);
        api.get<{ data: Review[] }>('/merchant/reviews').then((r) => setReviews(r.data));
    }, [manager]));

    const hours = Object.entries(ins?.orders_by_hour ?? {});
    const max = Math.max(1, ...hours.map(([, v]) => v));

    return (
        <Screen>
            <Text variant="title" style={{ marginTop: 8 }}>{me?.name}</Text>
            <Text color="muted">{label(me?.role ?? '')}</Text>
            {manager && e && (
                <>
                    <SectionTitle>This week</SectionTitle>
                    <Card tone="inverse">
                        <Text variant="caption" style={{ color: t.onInverseMuted }}>Net to your store</Text>
                        <Text variant="display" color="onInverse">{zig(e.net.zig)}</Text>
                        <Text variant="caption" style={{ color: t.onInverseMuted }}>Sales {zig(e.sales.zig)} · commission {zig(e.commission.zig)} · refunds {zig(e.refunds.zig)}</Text>
                    </Card>
                    <Card style={{ marginTop: 10, gap: 8 }}>
                        <Text variant="caption">Owed to you (next payout)</Text><Text variant="heading">{zig(e.balance.zig)}</Text>
                        {e.instant_payout && e.available_now.zig >= e.instant_payout.min.zig && (
                            <Button title={`Get ${zig(e.available_now.zig * (1 - e.instant_payout.fee_pct / 100))} today`} tone="primary" size="md" onPress={() => Alert.alert('Same-day payout', `${e.instant_payout!.fee_pct}% fee. Sent to your payout account today.`, [{ text: 'Not now', style: 'cancel' }, { text: 'Request', onPress: () => api.post<{ message: string }>('/merchant/payout-now').then((r) => { Alert.alert('Done ✓', r.message); api.get<Earnings>('/merchant/earnings?period=week').then(setE); }).catch((err) => Alert.alert('Payout', err instanceof ApiError ? err.friendly : '')) }])} />
                        )}
                    </Card>
                    {e.payouts.map((p) => <Row key={p.id} justify="space-between" style={{ paddingVertical: 8 }}><Text>{new Date(p.period_end).toLocaleDateString()}</Text><Text variant="label">{zig(p.amount_zig)} · {label(p.status)}</Text></Row>)}
                </>
            )}
            {manager && <Button title="Promotions" tone="soft" onPress={() => router.push('/promos')} style={{ marginTop: 16 }} />}
            {manager && <Button title="Catering requests" tone="soft" onPress={() => router.push('/catering')} style={{ marginTop: 8 }} />}
            {manager && ins && (
                <>
                    <SectionTitle>Best sellers (30 days)</SectionTitle>
                    {ins.best_sellers.slice(0, 5).map((b, k) => <Row key={b.name} justify="space-between" style={{ paddingVertical: 6 }}><Text>{k + 1}. {b.name}</Text><Text variant="label">{b.qty}×</Text></Row>)}
                    {hours.length > 0 && (
                        <>
                            <SectionTitle>Busiest hours</SectionTitle>
                            <Row gap={3} align="flex-end" style={{ height: 80 }}>{hours.map(([h, v]) => <View key={h} style={{ flex: 1, height: `${(v / max) * 100}%`, minHeight: 2, backgroundColor: t.brand, borderRadius: 3 }} />)}</Row>
                        </>
                    )}
                    {ins.slow_movers.length > 0 && <Text variant="caption" style={{ marginTop: 12 }}>Not ordered in 30 days: {ins.slow_movers.slice(0, 5).map((s) => s.name).join(', ')}</Text>}
                </>
            )}
            {manager && reviews.length > 0 && (
                <>
                    <SectionTitle>{`Reviews · ★ ${ins?.rating.average.toFixed(1) ?? ''}`}</SectionTitle>
                    {reviews.slice(0, 8).map((r) => (
                        <Card key={r.id} style={{ marginBottom: 8 }}>
                            <Row justify="space-between"><Text variant="label">{r.user?.name}</Text><Text variant="label" color="gold">{'★'.repeat(r.vendor_rating)}</Text></Row>
                            {r.comment && <Text style={{ marginTop: 4 }}>{r.comment}</Text>}
                            <Text variant="caption">{timeAgo(r.created_at)}</Text>
                        </Card>
                    ))}
                </>
            )}
            <ThemePicker />
            <LanguagePicker />
            <Button title="Sign out" tone="ghost" onPress={signOut} style={{ marginTop: 24 }} />
            <View style={{ alignItems: 'center', gap: 6, marginTop: 28 }}>
                <Logo height={28} />
                <Text variant="caption">Version {appVersion()}</Text>
            </View>
        </Screen>
    );
}

import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { type MerchantMe } from '@/features/merchant';
import { api, ApiError } from '@/lib/api';
import { label } from '@/lib/money';
import { Badge, Button, Card, Chip, Row, Screen, SectionTitle, Text, Toggle } from '@/ui';

/** Store controls: busy mode, pause, load-shedding, auto-accept, prep time, delivery/pickup. */
export default function StoreControls() {
    const [me, setMe] = useState<MerchantMe | null>(null);
    useFocusEffect(useCallback(() => { api.get<MerchantMe>('/merchant/me').then(setMe); }, []));

    const update = async (body: Record<string, unknown>) => {
        try {
            setMe(await api.patch<MerchantMe>('/merchant/store', body));
        } catch (e) {
            Alert.alert('Store', e instanceof ApiError ? e.friendly : '');
        }
    };
    if (!me) return <Screen><Text>Loading…</Text></Screen>;
    const s = me.store;
    const paused = !!s.paused_until && new Date(s.paused_until) > new Date();

    return (
        <Screen>
            <Text variant="title" style={{ marginTop: 8 }}>{s.name}</Text>
            <Row gap={8} style={{ marginTop: 6 }}>
                <Badge tone={me.availability.is_open ? 'brand' : 'red'}>{me.availability.is_open ? 'Open' : label(me.availability.reason ?? 'closed')}</Badge>
                <Text variant="caption">Customers see {me.availability.prep_minutes} min prep · ★ {s.rating.toFixed(1)} ({s.rating_count})</Text>
            </Row>

            <SectionTitle>Right now</SectionTitle>
            <Card style={{ gap: 6 }}>
                <Toggle label="Busy mode" description={`Adds ${s.busy_extra_minutes} min to prep times`} value={s.is_busy} onChange={(v) => update({ is_busy: v })} />
                {s.is_busy && <Row gap={8}>{[10, 15, 20, 30].map((m) => <Chip key={m} label={`+${m} min`} active={s.busy_extra_minutes === m} onPress={() => update({ busy_extra_minutes: m })} />)}</Row>}
                <Toggle label="Load-shedding mode" description="Power is out: hide oven/fryer items and add prep time" value={s.power_out} onChange={(v) => update({ power_out: v })} />
                <Toggle label="Auto-accept orders" description="Skip confirming each order" value={s.auto_accept} onChange={(v) => update({ auto_accept: v })} />
            </Card>

            <SectionTitle>Pause new orders</SectionTitle>
            <Card style={{ gap: 10 }}>
                <Text variant="caption">{paused ? `Paused until ${new Date(s.paused_until!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Temporarily stop receiving orders without closing.'}</Text>
                {paused ? <Button title="Resume orders" tone="primary" onPress={() => update({ pause_minutes: 0 })} /> : <Row gap={8} style={{ flexWrap: 'wrap' }}>{[15, 30, 60, 120].map((m) => <Chip key={m} label={m < 60 ? `${m} min` : `${m / 60} hr`} onPress={() => update({ pause_minutes: m })} />)}</Row>}
            </Card>

            <SectionTitle>Defaults</SectionTitle>
            <Card style={{ gap: 6 }}>
                <Text variant="label">Normal prep time</Text>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{[10, 15, 20, 25, 30, 45].map((m) => <Chip key={m} label={`${m} min`} active={s.prep_minutes === m} onPress={() => update({ prep_minutes: m })} />)}</Row>
                <Toggle label="Delivery" value={s.offers_delivery} onChange={(v) => update({ offers_delivery: v })} />
                <Toggle label="Pickup" value={s.offers_pickup} onChange={(v) => update({ offers_pickup: v })} />
            </Card>
            <Text variant="caption" style={{ marginTop: 16 }}>Opening hours and holiday closures can be edited on the Zvino website admin under Stores.</Text>
        </Screen>
    );
}

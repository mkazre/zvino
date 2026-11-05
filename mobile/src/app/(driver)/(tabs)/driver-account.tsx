import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { type DriverMe } from '@/features/driver';
import { api } from '@/lib/api';
import { label } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Input, Row, Screen, Text, Toggle, Logo } from '@/ui';
import { LanguagePicker } from '@/features/language';
import { ThemePicker } from '@/features/theme-picker';
import { appVersion } from '@/lib/brand';

export default function DriverAccount() {
    const { signOut } = useSession();
    const [me, setMe] = useState<DriverMe | null>(null);
    const [daily, setDaily] = useState('');
    const [weekly, setWeekly] = useState('');
    useFocusEffect(useCallback(() => {
        api.get<DriverMe>('/driver/me').then((d) => {
            setMe(d);
            setDaily(d.preferences.daily_goal_zig ? String(d.preferences.daily_goal_zig) : '');
            setWeekly(d.preferences.weekly_goal_zig ? String(d.preferences.weekly_goal_zig) : '');
        }).catch(() => {});
    }, []));
    const save = (body: Record<string, unknown>) => api.patch<DriverMe>('/driver/preferences', body).then(setMe).catch(() => {});

    return (
        <Screen>
            <Text variant="title" style={{ marginTop: 8 }}>{me?.name}</Text>
            <Text color="muted">{label(me?.vehicle_type ?? '')} {me?.vehicle_plate ? `· ${me.vehicle_plate}` : ''}</Text>
            <Card style={{ marginTop: 16, gap: 10 }}>
                <Row justify="space-between"><Text variant="heading">Documents</Text><Button title="Update" size="sm" tone="outline" onPress={() => router.push('/driver-apply')} /></Row>
                {me?.required_documents.map((d) => {
                    const doc = me.documents.find((x) => x.type === d);
                    return <Row key={d} justify="space-between"><Text>{label(d)}</Text><Badge tone={doc?.status === 'approved' ? 'brand' : doc?.status === 'rejected' ? 'red' : doc ? 'gold' : 'neutral'}>{doc ? label(doc.status) : 'Missing'}</Badge></Row>;
                })}
            </Card>
            <Card style={{ marginTop: 12 }}>
                <Text variant="heading">Safety</Text>
                <Text variant="caption">Use the red SOS button on the Drive tab in an emergency. Zvino ops gets your live location instantly. Police 995 · Ambulance 994.</Text>
            </Card>
            {me?.night_zones_enabled && (
                <Card style={{ marginTop: 12 }}>
                    <Toggle value={me.preferences.avoid_night_zones} onChange={(v) => save({ avoid_night_zones: v })} label="Skip night safety zones" description="Don’t offer me drop-offs in areas Zvino has flagged as unsafe after dark." />
                </Card>
            )}
            <Card style={{ marginTop: 12, gap: 10 }}>
                <Text variant="heading">Earnings goals</Text>
                <Row gap={10}>
                    <View style={{ flex: 1 }}><Input label="Daily (ZiG)" value={daily} onChangeText={setDaily} keyboardType="number-pad" placeholder="e.g. 400" /></View>
                    <View style={{ flex: 1 }}><Input label="Weekly (ZiG)" value={weekly} onChangeText={setWeekly} keyboardType="number-pad" placeholder="e.g. 2500" /></View>
                </Row>
                <Button title="Save goals" size="md" tone="outline" onPress={() => save({ daily_goal_zig: daily ? Number(daily) : null, weekly_goal_zig: weekly ? Number(weekly) : null })} />
            </Card>
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

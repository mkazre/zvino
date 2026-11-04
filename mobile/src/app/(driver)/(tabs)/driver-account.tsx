import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { type DriverMe } from '@/features/driver';
import { api } from '@/lib/api';
import { label } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Row, Screen, Text } from '@/ui';

export default function DriverAccount() {
    const { signOut } = useSession();
    const [me, setMe] = useState<DriverMe | null>(null);
    useFocusEffect(useCallback(() => { api.get<DriverMe>('/driver/me').then(setMe).catch(() => {}); }, []));

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
            <Button title="Sign out" tone="ghost" onPress={signOut} style={{ marginTop: 24 }} />
        </Screen>
    );
}

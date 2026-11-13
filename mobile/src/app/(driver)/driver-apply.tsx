import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { type DriverMe } from '@/features/driver';
import { api, ApiError } from '@/lib/api';
import { label } from '@/lib/money';
import { useSession } from '@/lib/session';
import { Badge, Button, Card, Chip, Input, Row, Screen, Text, useTheme } from '@/ui';
import { shrinkPhoto } from '@/lib/photo';

/** Driver onboarding: details + documents (ID, licence, selfie…). Admin approves in Drivers. */
export default function DriverApply() {
    const t = useTheme();
    const { me: user } = useSession();
    const [driver, setDriver] = useState<DriverMe | null>(null);
    const [form, setForm] = useState({ name: user?.name ?? '', vehicle_type: 'motorbike', vehicle_make: '', vehicle_plate: '', national_id: '', licence_number: '' });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);

    const load = () => api.get<DriverMe>('/driver/me').then(setDriver).catch(() => setDriver(null));
    useEffect(() => { load(); }, []);

    const apply = async () => {
        setSaving(true);
        try {
            setDriver(await api.post<DriverMe>('/driver/apply', form));
        } catch (e) {
            Alert.alert('Application', e instanceof ApiError ? e.friendly : '');
        } finally {
            setSaving(false);
        }
    };

    const upload = async (type: string) => {
        const camera = type === 'selfie';
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
        const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7, cameraType: ImagePicker.CameraType.front }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
        if (r.canceled) return;
        setUploading(type);
        try {
            const f = new FormData();
            f.append('type', type);
            f.append('file', { uri: await shrinkPhoto(r.assets[0]), name: `${type}.jpg`, type: 'image/jpeg' } as unknown as Blob);
            await api.post('/driver/documents', f);
            await load();
        } catch (e) {
            Alert.alert('Upload failed', e instanceof ApiError ? e.friendly : '');
        } finally {
            setUploading(null);
        }
    };

    if (!driver) {
        return (
            <Screen>
                <Text variant="display" style={{ marginTop: 16 }}>Drive with Zvino</Text>
                <Text color="muted" style={{ marginBottom: 16 }}>Tell us about you and your vehicle.</Text>
                <View style={{ gap: 12 }}>
                    <Input label="Full name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
                    <Text variant="label">Vehicle</Text>
                    <Row gap={8} style={{ flexWrap: 'wrap' }}>{['motorbike', 'bicycle', 'car'].map((v) => <Chip key={v} label={label(v)} active={form.vehicle_type === v} onPress={() => setForm({ ...form, vehicle_type: v })} />)}</Row>
                    {form.vehicle_type !== 'bicycle' && <Input label="Make & model" value={form.vehicle_make} onChangeText={(v) => setForm({ ...form, vehicle_make: v })} placeholder="Honda Ace 125" />}
                    {form.vehicle_type !== 'bicycle' && <Input label="Number plate" value={form.vehicle_plate} onChangeText={(v) => setForm({ ...form, vehicle_plate: v.toUpperCase() })} placeholder="AEZ 1234" />}
                    <Input label="National ID number" value={form.national_id} onChangeText={(v) => setForm({ ...form, national_id: v.toUpperCase() })} placeholder="63-123456-A-42" />
                    {form.vehicle_type !== 'bicycle' && <Input label="Driver’s licence number" value={form.licence_number} onChangeText={(v) => setForm({ ...form, licence_number: v })} />}
                    <Button title="Continue" onPress={apply} loading={saving} disabled={!form.name || !form.national_id} />
                </View>
            </Screen>
        );
    }

    const done = driver.required_documents.every((d) => driver.documents.some((x) => x.type === d));
    return (
        <Screen>
            <Text variant="title" style={{ marginTop: 16 }}>Your documents</Text>
            <Text color="muted" style={{ marginBottom: 16 }}>Clear photos speed up approval.</Text>
            <View style={{ gap: 10 }}>
                {driver.required_documents.map((d) => {
                    const doc = driver.documents.find((x) => x.type === d);
                    return (
                        <Card key={d} onPress={() => upload(d)}>
                            <Row>
                                <Ionicons name={d === 'selfie' ? 'camera-outline' : 'document-outline'} size={24} color={t.ink} />
                                <View style={{ flex: 1 }}><Text variant="label">{label(d)}</Text>{doc?.note && <Text variant="caption" color="red">{doc.note}</Text>}</View>
                                {uploading === d ? <Text variant="caption">Uploading…</Text> : <Badge tone={doc?.status === 'approved' ? 'brand' : doc?.status === 'rejected' ? 'red' : doc ? 'gold' : 'neutral'}>{doc ? label(doc.status) : 'Upload'}</Badge>}
                            </Row>
                        </Card>
                    );
                })}
            </View>
            <Pressable style={{ marginTop: 24 }}>
                <Button title={done ? 'Done, we’ll notify you' : 'Upload all documents to continue'} disabled={!done} onPress={() => router.replace('/shift')} />
            </Pressable>
        </Screen>
    );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { navigateUrl, type Job } from '@/features/driver';
import { api, ApiError } from '@/lib/api';
import { zig } from '@/lib/money';
import { Badge, Button, Card, Loading, Row, Text, useTheme } from '@/ui';
import { useT } from '@/lib/i18n';
import { SafetyBanner } from '@/features/safety';
import { VoiceNotePlayer } from '@/features/voice-note';
import { API_URL } from '@/lib/config';
import { Image } from 'expo-image';

/** One delivery: go to store → pick up → go to customer → deliver (PIN / photo / cash). */
export default function JobScreen() {
    const tr = useT();
    const t = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [job, setJob] = useState<Job | null>(null);
    const [pin, setPin] = useState('');
    const [photo, setPhoto] = useState<string | null>(null);
    const [changeToWallet, setChangeToWallet] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const jobs = await api.get<Job[]>('/driver/jobs');
        const j = jobs.find((x) => String(x.id) === id);
        if (!j) router.replace('/shift');
        else setJob(j);
    }, [id]);
    useEffect(() => { load(); }, [load]);

    if (!job) return <Loading />;
    const delivering = ['picked_up', 'arriving'].includes(job.status);
    const target = delivering ? job.dropoff : job.store;

    const pickup = async () => {
        setBusy(true);
        try {
            setJob(await api.post<Job>(`/driver/jobs/${job.id}/pickup`));
        } catch (e) {
            Alert.alert('Pick up', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    const takePhoto = async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!r.canceled) setPhoto(r.assets[0].uri);
    };

    const deliver = async () => {
        setBusy(true);
        try {
            const form = new FormData();
            if (pin) form.append('pin', pin);
            if (changeToWallet) form.append('change_to_wallet_zig', changeToWallet);
            if (photo) form.append('photo', { uri: photo, name: 'proof.jpg', type: 'image/jpeg' } as unknown as Blob);
            const r = await api.post<{ earned: { zig: number } }>(`/driver/jobs/${job.id}/deliver`, form);
            Alert.alert('Delivered! 🎉', `You earned ${zig(r.earned.zig)}`, [{ text: 'Next job', onPress: () => router.replace('/shift') }]);
        } catch (e) {
            Alert.alert('Can’t complete', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="heading" style={{ flex: 1 }}>{job.reference}</Text>
                <Badge tone="brand">{zig(job.pay.zig)}</Badge>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
                <Card tone="inverse" style={{ gap: 6 }}>
                    <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>{delivering ? 'DELIVER TO' : 'PICK UP FROM'}</Text>
                    <Text variant="title" color="onInverse">{delivering ? job.customer.name ?? 'Customer' : job.store.name}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)' }}>{delivering ? `${job.dropoff?.line1}${job.dropoff?.suburb ? `, ${job.dropoff.suburb}` : ''}` : job.store.address}</Text>
                    {delivering && job.dropoff?.landmark && <Text style={{ color: '#5fe0b3' }}>📍 {job.dropoff.landmark}</Text>}
                    {delivering && job.dropoff?.instructions && <Text style={{ color: 'rgba(255,255,255,0.8)' }}>“{job.dropoff.instructions}”</Text>}
                    <Row gap={10} style={{ marginTop: 10 }}>
                        {target?.lat && <Button title={tr('Navigate')} tone="primary" size="md" style={{ flex: 1 }} onPress={() => Linking.openURL(navigateUrl(target.lat!, target.lng!))} icon={<Ionicons name="navigate" size={18} color="#fff" />} />}
                        {(delivering ? job.customer.phone : job.store.phone) && <Button title="Call" tone="soft" size="md" onPress={() => Linking.openURL(`tel:${delivering ? job.customer.phone : job.store.phone}`)} icon={<Ionicons name="call" size={18} color={t.ink} />} />}
                    </Row>
                </Card>

                <Card>
                    <Text variant="heading" style={{ marginBottom: 6 }}>Order ({job.items.reduce((s, i) => s + i.quantity, 0)} items)</Text>
                    {job.items.map((i, k) => <Text key={k}>{i.quantity}× {i.name}</Text>)}
                    {job.notes && <Text variant="caption" style={{ marginTop: 6 }}>Note: {job.notes}</Text>}
                    {job.safety && <View style={{ marginTop: 8 }}><SafetyBanner s={job.safety} /></View>}
                    {delivering && job.dropoff?.voice_note_path && <View style={{ marginTop: 8 }}><VoiceNotePlayer path={job.dropoff.voice_note_path} /></View>}
                    {delivering && job.dropoff?.gate_photo_path && <Image source={{ uri: `${API_URL}${job.dropoff.gate_photo_path}` }} style={{ marginTop: 8, height: 160, borderRadius: 12 }} contentFit="cover" />}
                </Card>

                {job.collect_cash && <Card tone="gold"><Text variant="heading" style={{ color: '#3d2c03' }}>Collect {zig(job.collect_cash.zig)} cash</Text><Text variant="caption" style={{ color: '#6b4e05' }}>USD or ZiG accepted. No small change? Credit it to the customer’s wallet below.</Text></Card>}

                {delivering && (
                    <Card style={{ gap: 12 }}>
                        <Text variant="heading">Complete delivery</Text>
                        {job.requires_pin && <TextInput value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="Customer’s 4-digit PIN" placeholderTextColor={t.faint} style={{ height: 56, borderRadius: 14, borderWidth: 2, borderColor: t.border, textAlign: 'center', fontSize: 24, letterSpacing: 10, color: t.ink }} />}
                        {job.dropoff_type === 'leave_at_door' && <Button title={photo ? 'Photo taken ✓' : 'Take photo of drop-off'} tone={photo ? 'soft' : 'outline'} onPress={takePhoto} icon={<Ionicons name="camera" size={18} color={t.ink} />} />}
                        {job.collect_cash && <TextInput value={changeToWallet} onChangeText={setChangeToWallet} keyboardType="decimal-pad" placeholder="Change credited to wallet (ZiG), optional" placeholderTextColor={t.faint} style={{ height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: t.border, paddingHorizontal: 14, color: t.ink }} />}
                    </Card>
                )}
            </ScrollView>
            <View style={{ padding: 16, borderTopWidth: 0.5, borderColor: t.border }}>
                {delivering ? (
                    <Button title={tr('Delivered')} tone="primary" loading={busy} disabled={(job.requires_pin && pin.length !== 4) || (job.dropoff_type === 'leave_at_door' && !photo)} onPress={deliver} />
                ) : (
                    <Button title={tr('Picked up')} loading={busy} onPress={pickup} />
                )}
            </View>
        </SafeAreaView>
    );
}

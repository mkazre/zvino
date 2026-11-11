import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Chip, Input, Row, Text, useTheme } from '@/ui';
import * as ImagePicker from 'expo-image-picker';
import { VoiceNoteRecorder } from '@/features/voice-note';
import { type SavedAddress, useLocation } from '@/lib/location';

interface Address { id: number; label: string; line1: string; landmark: string | null; suburb: string | null; city: string; is_default: boolean; voice_note_path: string | null; gate_photo_path: string | null }

/** Saved addresses + add new with landmark and GPS pin (Zimbabwean addresses are tricky). */
export default function Addresses() {
    const t = useTheme();
    const params = useLocalSearchParams<{ add?: string; lat?: string; lng?: string; line1?: string; suburb?: string; city?: string }>();
    const { chooseAddress, reloadAddresses } = useLocation();
    const [list, setList] = useState<Address[]>([]);
    // Opened from "Add this address" / the address picker: start with the form open and the GPS point.
    const [adding, setAdding] = useState(params.add === '1');
    const [form, setForm] = useState({
        label: 'Home', line1: params.line1 ?? '', landmark: '', suburb: params.suburb ?? '', city: params.city || 'Harare', instructions: '',
        lat: params.lat ? Number(params.lat) : (null as number | null), lng: params.lng ? Number(params.lng) : (null as number | null),
    });
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        api.get<Address[]>('/addresses').then(setList);
    }, []);
    useFocusEffect(load);

    const pin = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Location', 'Allow location to pin your exact gate.');
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude }));
        const r = await api.post<{ line1: string; suburb: string | null; city: string | null }[]>('/addresses/geocode', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => []);
        if (r[0]) setForm((f) => ({ ...f, line1: f.line1 || r[0].line1, suburb: f.suburb || (r[0].suburb ?? ''), city: r[0].city ?? f.city }));
    };

    const gatePhoto = async (id: number) => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: true });
        if (r.canceled) return;
        const fd = new FormData();
        fd.append('gate_photo', { uri: r.assets[0].uri, name: 'gate.jpg', type: 'image/jpeg' } as unknown as Blob);
        await api.post(`/addresses/${id}/media`, fd).then(load).catch((e) => Alert.alert('Photo', e instanceof ApiError ? e.friendly : 'Upload failed'));
    };

    const save = async () => {
        setSaving(true);
        try {
            const created = await api.post<SavedAddress>('/addresses', { ...form, is_default: list.length === 0 });
            if (created?.id) chooseAddress(created); // deliver here from now on
            reloadAddresses();
            setAdding(false);
            setForm({ ...form, line1: '', landmark: '', suburb: '', instructions: '', lat: null, lng: null });
            load();
            if (router.canGoBack()) router.back();
        } catch (e) {
            Alert.alert('Address', e instanceof ApiError ? e.friendly : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <Row style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <Text variant="title" style={{ fontSize: 22 }}>Addresses</Text>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
                {list.map((a) => (
                    <Card key={a.id}>
                        <Row align="flex-start">
                            <Ionicons name={a.label === 'Work' ? 'briefcase-outline' : 'home-outline'} size={22} color={t.ink} />
                            <View style={{ flex: 1 }}>
                                <Text variant="label">{a.label}{a.is_default ? '  · Default' : ''}</Text>
                                <Text variant="caption">{a.line1}{a.suburb ? `, ${a.suburb}` : ''}, {a.city}</Text>
                                {a.landmark && <Text variant="caption">{a.landmark}</Text>}
                                <VoiceNoteRecorder addressId={a.id} existing={a.voice_note_path} onSaved={load} />
                                <Pressable onPress={() => gatePhoto(a.id)} style={{ marginTop: 8 }}><Text variant="label" color="brand">{a.gate_photo_path ? 'Gate photo added · replace' : 'Add a photo of your gate'}</Text></Pressable>
                            </View>
                            <Pressable onPress={() => api.delete(`/addresses/${a.id}`).then(load)}><Ionicons name="trash-outline" size={20} color={t.muted} /></Pressable>
                        </Row>
                    </Card>
                ))}
                {!adding ? (
                    <Button title="Add address" tone="outline" onPress={() => setAdding(true)} icon={<Ionicons name="add" size={20} color={t.ink} />} />
                ) : (
                    <Card style={{ gap: 12 }}>
                        <Row gap={8}>{['Home', 'Work', 'Other'].map((l) => <Chip key={l} label={l} active={form.label === l} onPress={() => setForm({ ...form, label: l })} />)}</Row>
                        <Button title={form.lat ? 'Exact location pinned ✓' : 'Use my current location'} tone={form.lat ? 'soft' : 'primary'} size="md" onPress={pin} icon={<Ionicons name="locate" size={18} color={form.lat ? t.ink : '#fff'} />} />
                        <Input placeholder="Street address" value={form.line1} onChangeText={(v) => setForm({ ...form, line1: v })} />
                        <Input placeholder="Landmark, e.g. opposite OK Mart, blue gate" value={form.landmark} onChangeText={(v) => setForm({ ...form, landmark: v })} />
                        <Row gap={8}>
                            <View style={{ flex: 1 }}><Input placeholder="Suburb" value={form.suburb} onChangeText={(v) => setForm({ ...form, suburb: v })} /></View>
                            <View style={{ flex: 1 }}><Input placeholder="City" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} /></View>
                        </Row>
                        <Input placeholder="Instructions for driver (gate code, call when outside)" value={form.instructions} onChangeText={(v) => setForm({ ...form, instructions: v })} />
                        <Button title="Save address" onPress={save} loading={saving} disabled={!form.line1} />
                    </Card>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VoiceNoteRecorder } from '@/features/voice-note';
import { api, ApiError } from '@/lib/api';
import { type SavedAddress, useLocation } from '@/lib/location';
import { Button, Card, Input, Row, Text, useTheme } from '@/ui';
import { shrinkPhoto } from '@/lib/photo';

interface Address extends SavedAddress { landmark: string | null; is_default: boolean; voice_note_path: string | null; gate_photo_path: string | null }

const LABELS: { label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { label: 'Home', icon: 'home-outline' },
    { label: 'Work', icon: 'briefcase-outline' },
    { label: 'Other', icon: 'location-outline' },
];
const iconFor = (label: string) => LABELS.find((l) => l.label === label)?.icon ?? 'location-outline';

/** Saved addresses: tap one to deliver there. Add new ones with a GPS pin and landmark. */
export default function Addresses() {
    const t = useTheme();
    const params = useLocalSearchParams<{ add?: string; lat?: string; lng?: string; line1?: string; suburb?: string; city?: string }>();
    const { active, chooseAddress, reloadAddresses } = useLocation();
    const [list, setList] = useState<Address[]>([]);
    const [adding, setAdding] = useState(params.add === '1');
    const [form, setForm] = useState({
        label: 'Home', line1: params.line1 ?? '', landmark: '', suburb: params.suburb ?? '', city: params.city || 'Harare', instructions: '',
        lat: params.lat ? Number(params.lat) : (null as number | null), lng: params.lng ? Number(params.lng) : (null as number | null),
    });
    const [saving, setSaving] = useState(false);
    const [locating, setLocating] = useState(false);

    const load = useCallback(() => { api.get<Address[]>('/addresses').then(setList).catch(() => {}); }, []);
    useFocusEffect(load);

    const select = (a: Address) => {
        chooseAddress(a);
        if (router.canGoBack()) router.back();
    };
    const makeDefault = async (a: Address) => {
        await api.patch(`/addresses/${a.id}`, { is_default: true }).catch(() => {});
        load();
        reloadAddresses();
    };
    const remove = (a: Address) => Alert.alert('Delete this address?', `${a.label}: ${a.line1}`, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => api.delete(`/addresses/${a.id}`).then(() => { load(); reloadAddresses(); }).catch(() => {}) },
    ]);
    const more = (a: Address) => {
        const options = [...(a.is_default ? [] : ['Make default']), 'Delete', 'Cancel'];
        const run = (i: number) => { const o = options[i]; if (o === 'Make default') makeDefault(a); if (o === 'Delete') remove(a); };
        if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, destructiveButtonIndex: options.indexOf('Delete'), cancelButtonIndex: options.length - 1 }, run);
        else Alert.alert(a.label, a.line1, options.map((o, i) => ({ text: o, style: o === 'Delete' ? 'destructive' as const : o === 'Cancel' ? 'cancel' as const : 'default' as const, onPress: () => run(i) })));
    };

    const pin = async () => {
        setLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return Alert.alert('Location', 'Allow location to pin your exact gate.');
            const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setForm((f) => ({ ...f, lat: p.coords.latitude, lng: p.coords.longitude }));
            const r = await api.post<{ line1: string; suburb: string | null; city: string | null }[]>('/addresses/geocode', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => []);
            if (r[0]) setForm((f) => ({ ...f, line1: f.line1 || r[0].line1, suburb: f.suburb || (r[0].suburb ?? ''), city: r[0].city ?? f.city }));
        } finally {
            setLocating(false);
        }
    };

    const gatePhoto = async (id: number) => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
        const r = await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: true });
        if (r.canceled) return;
        const fd = new FormData();
        fd.append('gate_photo', { uri: await shrinkPhoto(r.assets[0], 1280), name: 'gate.jpg', type: 'image/jpeg' } as unknown as Blob);
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
            <Row style={{ paddingHorizontal: 16, paddingVertical: 10 }} gap={10}>
                <Pressable onPress={() => router.back()} style={{ padding: 6 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={24} color={t.ink} /></Pressable>
                <View style={{ flex: 1 }}>
                    <Text variant="title" style={{ fontSize: 22 }}>Delivery addresses</Text>
                    {list.length > 0 && <Text variant="caption">Tap an address to deliver there</Text>}
                </View>
            </Row>
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
                {list.map((a) => {
                    const on = active?.address_id === a.id;
                    return (
                        <Pressable key={a.id} onPress={() => select(a)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Deliver to ${a.label}, ${a.line1}`}
                            style={({ pressed }) => ({ borderRadius: 20, borderWidth: on ? 2 : 1, borderColor: on ? t.brand : t.border, backgroundColor: on ? t.brandSoft : t.surface, padding: 14, gap: 12, opacity: pressed ? 0.92 : 1 })}>
                            <Row align="flex-start" gap={12}>
                                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: on ? t.brand : t.subtle, alignItems: 'center', justifyContent: 'center' }}>
                                    <Ionicons name={iconFor(a.label)} size={22} color={on ? '#111' : t.ink} />
                                </View>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Row gap={8}>
                                        <Text variant="label" style={{ fontSize: 16 }}>{a.label}</Text>
                                        {a.is_default && <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: on ? 'rgba(0,0,0,0.06)' : t.subtle }}><Text variant="caption" style={{ fontWeight: '700' }}>Default</Text></View>}
                                    </Row>
                                    <Text variant="caption" numberOfLines={2}>{[a.line1, a.suburb, a.city].filter(Boolean).join(', ')}</Text>
                                    {a.landmark ? <Row gap={4}><Ionicons name="flag-outline" size={13} color={t.muted} /><Text variant="caption" numberOfLines={1} style={{ flex: 1 }}>{a.landmark}</Text></Row> : null}
                                </View>
                                <View style={{ alignItems: 'center', gap: 10 }}>
                                    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? t.brand : t.faint, backgroundColor: on ? t.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                                        {on ? <Ionicons name="checkmark" size={15} color="#111" /> : null}
                                    </View>
                                    <Pressable onPress={() => more(a)} hitSlop={10} accessibilityLabel="More options"><Ionicons name="ellipsis-horizontal" size={20} color={t.muted} /></Pressable>
                                </View>
                            </Row>
                            {on && <Row gap={6}><Ionicons name="bicycle-outline" size={15} color={t.brandText} /><Text variant="caption" style={{ color: t.brandText, fontWeight: '700' }}>Delivering here</Text></Row>}
                            <Row gap={8} style={{ flexWrap: 'wrap' }}>
                                <VoiceNoteRecorder addressId={a.id} existing={a.voice_note_path} onSaved={load} />
                                <Pressable onPress={() => gatePhoto(a.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 36, borderRadius: 99, backgroundColor: on ? 'rgba(0,0,0,0.06)' : t.subtle }}>
                                    <Ionicons name={a.gate_photo_path ? 'checkmark-circle' : 'camera-outline'} size={16} color={a.gate_photo_path ? t.brandText : t.ink} />
                                    <Text variant="caption" style={{ fontWeight: '700', color: t.ink }}>{a.gate_photo_path ? 'Gate photo added' : 'Add gate photo'}</Text>
                                </Pressable>
                            </Row>
                        </Pressable>
                    );
                })}

                {!adding ? (
                    <Pressable onPress={() => setAdding(true)} style={{ height: 64, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.faint, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={20} color={t.ink} /></View>
                        <Text variant="label">Add a new address</Text>
                    </Pressable>
                ) : (
                    <Card style={{ gap: 12 }}>
                        <Row justify="space-between"><Text variant="heading">New address</Text>{list.length > 0 && <Pressable onPress={() => setAdding(false)} hitSlop={10}><Ionicons name="close" size={22} color={t.muted} /></Pressable>}</Row>
                        <Row gap={8}>
                            {LABELS.map((l) => {
                                const on = form.label === l.label;
                                return (
                                    <Pressable key={l.label} onPress={() => setForm({ ...form, label: l.label })} style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? t.ink : t.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                        <Ionicons name={l.icon} size={17} color={t.ink} /><Text variant="label">{l.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </Row>
                        <Button title={form.lat ? 'Exact location pinned' : 'Use my current location'} tone={form.lat ? 'soft' : 'primary'} size="md" loading={locating} onPress={pin}
                            icon={<Ionicons name={form.lat ? 'checkmark-circle' : 'locate'} size={18} color={form.lat ? t.brandText : '#fff'} />} />
                        <Input placeholder="Street address" value={form.line1} onChangeText={(v) => setForm({ ...form, line1: v })} />
                        <Input placeholder="Landmark, e.g. opposite OK Mart, blue gate" value={form.landmark} onChangeText={(v) => setForm({ ...form, landmark: v })} />
                        <Row gap={8}>
                            <View style={{ flex: 1 }}><Input placeholder="Suburb" value={form.suburb} onChangeText={(v) => setForm({ ...form, suburb: v })} /></View>
                            <View style={{ flex: 1 }}><Input placeholder="City" value={form.city} onChangeText={(v) => setForm({ ...form, city: v })} /></View>
                        </Row>
                        <Input placeholder="Instructions for the driver (gate code, call when outside)" value={form.instructions} onChangeText={(v) => setForm({ ...form, instructions: v })} />
                        <Button title="Save address" onPress={save} loading={saving} disabled={!form.line1} />
                    </Card>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

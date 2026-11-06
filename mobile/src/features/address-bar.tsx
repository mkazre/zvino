import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocation } from '@/lib/location';
import { useSession } from '@/lib/session';
import { Button, Row, Text, useTheme } from '@/ui';

/** Opens the add-address form prefilled with the current GPS point. */
export function addAddressHere(loc: { lat: number | null; lng: number | null; line?: string | null; suburb?: string | null; city?: string | null } | null) {
    router.push({ pathname: '/addresses', params: { add: '1', ...(loc?.lat != null ? { lat: String(loc.lat), lng: String(loc.lng), line1: loc.line ?? '', suburb: loc.suburb ?? '', city: loc.city ?? '' } : {}) } });
}

/** "📍 Home · 21 Moepel Ave ⌄" at the top of Restaurants, Shops and Search. */
export function AddressBar() {
    const t = useTheme();
    const { active, status } = useLocation();
    const [open, setOpen] = useState(false);
    const title = active ? (active.address_id ? active.label : active.line || 'Current location') : status === 'locating' ? 'Finding you…' : 'Set your delivery address';
    const sub = active ? (active.address_id ? active.line : active.city) : null;
    return (
        <>
            <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Change delivery address" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.subtle, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 }}>
                {status === 'locating' ? <ActivityIndicator size="small" color={t.ink} /> : <Ionicons name="location-outline" size={22} color={t.ink} />}
                <View style={{ flex: 1 }}>
                    <Text variant="heading" numberOfLines={1} style={{ fontSize: 17 }}>{title}</Text>
                    {sub ? <Text variant="caption" numberOfLines={1}>{sub}</Text> : null}
                </View>
                <Ionicons name="chevron-down" size={20} color={t.ink} />
            </Pressable>
            <AddressSheet open={open} onClose={() => setOpen(false)} />
            <SavePrompt />
        </>
    );
}

export function AddressSheet({ open, onClose, intro }: { open: boolean; onClose: () => void; intro?: string }) {
    const t = useTheme();
    const { me } = useSession();
    const { active, addresses, chooseAddress, locate, status, reloadAddresses } = useLocation();
    useEffect(() => {
        if (open) reloadAddresses();
    }, [open, reloadAddresses]);
    return (
        <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
                <Row justify="space-between" style={{ padding: 20, paddingBottom: 8 }}>
                    <Text variant="title" style={{ fontSize: 22 }}>Deliver to</Text>
                    <Pressable onPress={onClose} accessibilityLabel="Close"><Ionicons name="close" size={26} color={t.ink} /></Pressable>
                </Row>
                {intro ? <Text color="muted" style={{ paddingHorizontal: 20 }}>{intro}</Text> : null}
                <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
                    <Pressable onPress={async () => { await locate(); onClose(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: t.subtle }}>
                        {status === 'locating' ? <ActivityIndicator color={t.ink} /> : <Ionicons name="navigate" size={22} color={t.brandText} />}
                        <View style={{ flex: 1 }}><Text variant="label">Use my current location</Text>{status === 'denied' ? <Text variant="caption" color="red">Location is off. Allow it in your phone settings.</Text> : null}</View>
                        {active && !active.address_id ? <Ionicons name="checkmark-circle" size={22} color={t.brand} /> : null}
                    </Pressable>
                    {addresses.map((a) => (
                        <Pressable key={a.id} onPress={() => { chooseAddress(a); onClose(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: active?.address_id === a.id ? t.brand : t.border }}>
                            <Ionicons name={a.label === 'Work' ? 'briefcase-outline' : 'home-outline'} size={22} color={t.ink} />
                            <View style={{ flex: 1 }}><Text variant="label">{a.label}</Text><Text variant="caption" numberOfLines={1}>{[a.line1, a.suburb, a.city].filter(Boolean).join(', ')}</Text></View>
                            {active?.address_id === a.id ? <Ionicons name="checkmark-circle" size={22} color={t.brand} /> : null}
                        </Pressable>
                    ))}
                    {me ? (
                        <Button title="Add a new address" tone="outline" onPress={() => { onClose(); addAddressHere(active && !active.address_id ? active : null); }} />
                    ) : (
                        <Button title="Sign in to use saved addresses" tone="outline" onPress={() => { onClose(); router.push('/sign-in'); }} />
                    )}
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}

/** After launch: "You're not at a saved address. Save this one?" */
function SavePrompt() {
    const t = useTheme();
    const { suggestSave, dismissSuggest, active } = useLocation();
    if (!suggestSave || !active) return null;
    return (
        <View style={{ marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: t.goldSoft, gap: 10 }}>
            <Text variant="label" style={{ color: '#3d2c03' }}>You’re not at one of your saved addresses.</Text>
            <Text variant="caption" style={{ color: '#3d2c03' }}>{active.line ? `Save ${active.line} so drivers find you easily.` : 'Save where you are so drivers find you easily.'}</Text>
            <Row gap={10}>
                <Button title="Add this address" size="md" onPress={() => { dismissSuggest(); addAddressHere(active); }} style={{ flex: 1 }} />
                <Button title="Not now" size="md" tone="ghost" onPress={dismissSuggest} />
            </Row>
        </View>
    );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { type CartSubstitute } from '@/lib/cart';
import { zig } from '@/lib/money';
import { useImg } from '@/lib/prefs';
import { Row, Text, useTheme } from '@/ui';

interface Option { id: number; name: string; image: string | null; size: string | null; price: { zig: number }; difference: { zig: number } }

/** "Select substitute": similar products from the same store; one per basket line. */
export function SubstitutePicker({ itemId, itemName, current, onPick, onClose }: { itemId: number; itemName: string; current?: CartSubstitute | null; onPick: (s: CartSubstitute | null) => void; onClose: () => void }) {
    const t = useTheme();
    const img = useImg();
    const [q, setQ] = useState('');
    const [options, setOptions] = useState<Option[] | null>(null);

    useEffect(() => {
        setOptions(null);
        const timer = setTimeout(() => api.get<{ options: Option[] }>(`/items/${itemId}/substitutes?q=${encodeURIComponent(q)}`).then((d) => setOptions(d.options)).catch(() => setOptions([])), q ? 300 : 0);
        return () => clearTimeout(timer);
    }, [itemId, q]);

    const pick = (s: CartSubstitute | null) => { onPick(s); onClose(); };

    return (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
                <Row justify="space-between" align="flex-start" style={{ padding: 20, paddingBottom: 8 }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text variant="title">Choose a substitute</Text>
                        <Text variant="caption">If {itemName} is out of stock, your shopper takes this instead.</Text>
                    </View>
                    <Pressable onPress={onClose} accessibilityLabel="Close" style={{ padding: 4 }}><Ionicons name="close" size={26} color={t.ink} /></Pressable>
                </Row>
                <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 12, backgroundColor: t.subtle, paddingHorizontal: 12 }}>
                        <Ionicons name="search" size={18} color={t.muted} />
                        <TextInput value={q} onChangeText={setQ} placeholder="Search this store…" placeholderTextColor={t.faint} style={{ flex: 1, color: t.ink, fontSize: 15 }} />
                    </View>
                </View>
                {options === null ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
                    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24, flexDirection: 'row', flexWrap: 'wrap' }}>
                        {options.length === 0 && <Text color="muted" style={{ padding: 10 }}>No similar products found. Try searching.</Text>}
                        {options.map((o) => {
                            const picked = current?.item_id === o.id;
                            const diff = o.difference.zig;
                            return (
                                <View key={o.id} style={{ width: '50%', padding: 6 }}>
                                    <Pressable onPress={() => pick({ item_id: o.id, name: o.name, image: o.image, price_zig: o.price.zig })}
                                        style={{ borderRadius: 16, borderWidth: picked ? 2 : 1, borderColor: picked ? t.brand : t.border, padding: 10, gap: 6, backgroundColor: t.surface }}>
                                        <View style={{ aspectRatio: 1, borderRadius: 12, backgroundColor: '#FFFFFF', padding: 8 }}>
                                            {o.image ? <Image source={{ uri: img(o.image, 300) ?? undefined }} style={{ flex: 1 }} contentFit="contain" /> : null}
                                            {picked && <View style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={16} color="#111" /></View>}
                                        </View>
                                        <Text variant="label" numberOfLines={2} style={{ minHeight: 36 }}>{o.name}</Text>
                                        {o.size ? <Text variant="caption">{o.size}</Text> : null}
                                        <Row justify="space-between">
                                            <Text variant="label">{zig(o.price.zig)}</Text>
                                            {Math.abs(diff) >= 0.01 ? (
                                                <View style={{ borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: diff > 0 ? t.goldSoft : t.brandSoft }}>
                                                    <Text variant="caption" style={{ fontWeight: '700', color: diff > 0 ? t.goldText : t.brandText }}>{diff > 0 ? `+${zig(diff)}` : 'Cheaper'}</Text>
                                                </View>
                                            ) : null}
                                        </Row>
                                    </Pressable>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
                <View style={{ padding: 16, borderTopWidth: 0.5, borderColor: t.border, gap: 8 }}>
                    <Text variant="caption">Dearer substitutes add a small buffer at checkout. Anything not used goes back to your Zvino wallet.</Text>
                    {current ? <Pressable onPress={() => pick(null)}><Text variant="label" color="red">Remove substitute</Text></Pressable> : null}
                </View>
            </SafeAreaView>
        </Modal>
    );
}

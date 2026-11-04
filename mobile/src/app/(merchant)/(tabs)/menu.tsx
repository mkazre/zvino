import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { api, type Money } from '@/lib/api';
import { zig } from '@/lib/money';
import { Badge, Row, Screen, SectionTitle, Text, useTheme } from '@/ui';

interface Item { id: number; name: string; price: Money; is_available: boolean; unavailable_until: string | null; needs_power: boolean }
interface Menu { power_out: boolean; categories: { id: number; name: string; items: Item[] }[] }

/** Quick stock control: tap an item → In stock / Sold out today / Sold out. */
export default function MenuScreen() {
    const t = useTheme();
    const [menu, setMenu] = useState<Menu | null>(null);
    const load = useCallback(() => { api.get<Menu>('/merchant/menu').then(setMenu); }, []);
    useFocusEffect(load);

    const set = (i: Item, state: 'on' | 'off' | 'off_today') => api.patch(`/merchant/items/${i.id}/availability`, { state }).then(load);
    const choose = (i: Item) => {
        const options = ['In stock', 'Sold out until tomorrow', 'Sold out (until I turn it on)', 'Cancel'];
        const map = ['on', 'off_today', 'off'] as const;
        if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 3, title: i.name }, (k) => k < 3 && set(i, map[k]));
        else Alert.alert(i.name, undefined, [...map.map((s, k) => ({ text: options[k], onPress: () => set(i, s) })), { text: 'Cancel', style: 'cancel' as const }]);
    };

    return (
        <Screen onRefresh={load}>
            <Text variant="title" style={{ marginTop: 8 }}>Menu</Text>
            <Text variant="caption">Tap an item to change stock. Prices are edited in the admin.</Text>
            {menu?.categories.map((c) => (
                <View key={c.id}>
                    <SectionTitle>{c.name}</SectionTitle>
                    {(Array.isArray(c.items) ? c.items : (c.items as unknown as { data: Item[] }).data ?? []).map((i) => {
                        const out = !i.is_available || (i.needs_power && menu.power_out);
                        return (
                            <Pressable key={i.id} onPress={() => choose(i)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderColor: t.border, opacity: out ? 0.55 : 1 }}>
                                <View style={{ flex: 1 }}><Text variant="label">{i.name}</Text><Text variant="caption">{zig(i.price.zig)}</Text></View>
                                <Row gap={6}>
                                    {i.needs_power && <Badge tone="gold">⚡</Badge>}
                                    <Badge tone={out ? 'red' : 'brand'}>{out ? (i.unavailable_until ? 'Off today' : i.needs_power && menu.power_out ? 'No power' : 'Sold out') : 'In stock'}</Badge>
                                </Row>
                            </Pressable>
                        );
                    })}
                </View>
            ))}
        </Screen>
    );
}

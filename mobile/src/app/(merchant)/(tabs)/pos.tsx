import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, type Money } from '@/lib/api';
import { normalisePhone, usd, zig } from '@/lib/money';
import { Button, Chip, Row, Text, useTheme } from '@/ui';

interface Item { id: number; name: string; price: Money; special_price: Money | null; is_available: boolean; category_id: number | null }
interface Menu { categories: { id: number; name: string; items: Item[] | { data: Item[] } }[] }
interface Line { item: Item; qty: number }

/** Counter POS: tap items, take USD/ZiG cash, card or mobile money. Sales land in the same orders table. */
export default function Pos() {
    const t = useTheme();
    const { width } = useWindowDimensions();
    const [menu, setMenu] = useState<Menu | null>(null);
    const [cat, setCat] = useState<number | null>(null);
    const [lines, setLines] = useState<Line[]>([]);
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);
    useFocusEffect(useCallback(() => { api.get<Menu>('/merchant/menu').then(setMenu); }, []));

    const items = useMemo(() => (menu?.categories ?? []).flatMap((c) => (Array.isArray(c.items) ? c.items : c.items.data).map((i) => ({ ...i, category_id: c.id }))).filter((i) => i.is_available && (!cat || i.category_id === cat)), [menu, cat]);
    const total = lines.reduce((s, l) => s + (l.item.special_price?.zig ?? l.item.price.zig) * l.qty, 0);
    const rate = total && lines[0] ? (lines[0].item.price.zig / (lines[0].item.price.usd || 1)) : 26.8;
    const add = (i: Item) => setLines((ls) => (ls.find((l) => l.item.id === i.id) ? ls.map((l) => (l.item.id === i.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { item: i, qty: 1 }]));
    const cols = width > 700 ? 4 : 3;

    const charge = async (method: string) => {
        if (['ecocash', 'innbucks', 'onemoney'].includes(method) && phone.replace(/\D/g, '').length < 9) return Alert.alert('Mobile money', 'Enter the customer’s number first.');
        setBusy(true);
        try {
            const r = await api.post<{ reference: string; total: Money; payment_status: string }>('/merchant/pos/sales', { method, phone: phone ? normalisePhone(phone) : null, lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.qty })) });
            Alert.alert('Sale complete ✓', `${r.reference} · ${zig(r.total.zig)} (${r.payment_status})`);
            setLines([]);
            setPhone('');
        } catch (e) {
            Alert.alert('Sale failed', e instanceof ApiError ? e.friendly : '');
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
                <Text variant="title">Point of sale</Text>
                <FlatList horizontal data={[{ id: 0, name: 'All' }, ...(menu?.categories ?? [])]} keyExtractor={(c) => String(c.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} renderItem={({ item: c }) => <Chip label={c.name} active={(cat ?? 0) === c.id} onPress={() => setCat(c.id || null)} />} />
            </View>
            <FlatList data={items} numColumns={cols} key={cols} keyExtractor={(i) => String(i.id)} contentContainerStyle={{ padding: 12, gap: 8 }} columnWrapperStyle={{ gap: 8 }} style={{ flex: 1 }}
                renderItem={({ item }) => {
                    const n = lines.find((l) => l.item.id === item.id)?.qty;
                    return (
                        <Pressable onPress={() => add(item)} style={({ pressed }) => ({ flex: 1 / cols, minHeight: 88, borderRadius: 14, padding: 12, backgroundColor: n ? t.brandSoft : t.subtle, borderWidth: n ? 2 : 0, borderColor: t.brand, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                            <Text variant="label" numberOfLines={2}>{item.name}</Text>
                            <Text variant="caption" style={{ marginTop: 'auto' }}>{zig(item.special_price?.zig ?? item.price.zig)}</Text>
                            {!!n && <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Text variant="caption" style={{ color: '#fff', fontWeight: '800' }}>{n}</Text></View>}
                        </Pressable>
                    );
                }} />
            <View style={{ borderTopWidth: 0.5, borderColor: t.border, padding: 16, gap: 10, backgroundColor: t.bg }}>
                <Row justify="space-between">
                    <Pressable onPress={() => setLines([])}><Text variant="label" color={lines.length ? 'red' : 'faint'}>Clear</Text></Pressable>
                    <View style={{ alignItems: 'flex-end' }}><Text variant="title" style={{ fontSize: 24 }}>{zig(total)}</Text><Text variant="caption">{usd(total / rate)}</Text></View>
                </Row>
                <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Customer number (mobile money)" placeholderTextColor={t.faint} style={{ height: 44, borderRadius: 12, backgroundColor: t.subtle, paddingHorizontal: 14, color: t.ink }} />
                <Row gap={8}>
                    <Button title="Cash" tone="primary" style={{ flex: 1 }} loading={busy} disabled={!lines.length} onPress={() => charge('cash')} />
                    <Button title="Card" tone="dark" style={{ flex: 1 }} disabled={!lines.length || busy} onPress={() => charge('card')} />
                    <Button title="EcoCash" tone="outline" style={{ flex: 1 }} disabled={!lines.length || busy} onPress={() => charge('ecocash')} />
                </Row>
            </View>
        </SafeAreaView>
    );
}

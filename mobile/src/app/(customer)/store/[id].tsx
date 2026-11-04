import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, SectionList, Share, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CartBar, Cover, DishRow, type MenuItem, type Store } from '@/features/cards';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { Button, Loading, Row, Text, useTheme } from '@/ui';
import { useSession } from '@/lib/session';

type Menu = Store & { accepts_catering?: boolean; description: string | null; categories: { id: number; name: string; items: { data?: MenuItem[] } | MenuItem[] }[] };

export default function StoreScreen() {
    const t = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [store, setStore] = useState<Menu | null>(null);
    const [deals, setDeals] = useState<{ id: number; headline: string; live: boolean }[]>([]);
    const [item, setItem] = useState<MenuItem | null>(null);

    useEffect(() => {
        api.get<{ data: Menu; deals?: { id: number; headline: string; live: boolean }[] }>(`/vendors/${id}/menu`).then((r) => { setStore(r.data); setDeals(r.deals ?? []); }).catch(() => Alert.alert('Store unavailable', 'This store isn’t taking orders right now.', [{ text: 'OK', onPress: () => router.back() }]));
    }, [id]);

    const sections = useMemo(
        () => (store?.categories ?? []).map((c) => ({ title: c.name, data: Array.isArray(c.items) ? c.items : (c.items?.data ?? []) })).filter((s) => s.data.length),
        [store],
    );

    if (!store) return <Loading />;

    return (
        <View style={{ flex: 1, backgroundColor: t.bg }}>
            <SectionList
                sections={sections}
                keyExtractor={(i) => String(i.id)}
                stickySectionHeadersEnabled
                contentContainerStyle={{ paddingBottom: 110 }}
                ListHeaderComponent={
                    <View>
                        <Cover uri={store.cover} seed={store.id} height={220} radius={0} />
                        <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back" size={20} color="#111412" /></Pressable>
                            <Pressable onPress={() => Share.share({ message: `Order from ${store.name} on Zvino: https://zvino.co.zw/store/${store.slug}` })} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="share-outline" size={20} color="#111412" /></Pressable>
                        </SafeAreaView>
                        <View style={{ padding: 20, gap: 6 }}>
                            <Text variant="display">{store.name}</Text>
                            <Text color="muted">{[store.cuisine, store.rating ? `★ ${store.rating.toFixed(1)}` : null, store.city].filter(Boolean).join(' · ')}</Text>
                            {store.description && <Text color="muted">{store.description}</Text>}
                            <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
                                <Pill icon="time-outline" text={`${store.eta_minutes[0]}–${store.eta_minutes[1]} min`} />
                                <Pill icon="bicycle-outline" text={store.delivery_fee.zig === 0 ? 'Free delivery' : `From ${zig(store.delivery_fee.zig)}`} />
                                {store.min_order.zig > 0 && <Pill icon="information-circle-outline" text={`${zig(store.min_order.zig)} min`} />}
                            </Row>
                            {store.accepts_catering && <Pressable onPress={() => router.push({ pathname: '/catering', params: { store: String(store.id), storeName: store.name } })} style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: t.subtle }}><Text variant="label">🍲  Cater an event: funerals, weddings, gatherings ›</Text></Pressable>}
                            {deals.map((d) => (
                                <View key={d.id} style={{ marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: d.live ? t.brandSoft : t.subtle }}>
                                    <Text variant="label" color={d.live ? 'brand' : 'muted'}>🏷️  {d.headline}{d.live ? '' : ' · later today'}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                }
                renderSectionHeader={({ section }) => <View style={{ backgroundColor: t.bg, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 6 }}><Text variant="title" style={{ fontSize: 20 }}>{section.title}</Text></View>}
                renderItem={({ item: i }) => <View style={{ paddingHorizontal: 20, borderBottomWidth: 0.5, borderColor: t.border }}><DishRow i={i} onPress={() => setItem(i)} /></View>}
            />
            <CartBar />
            {item && <ItemSheet item={item} store={store} onClose={() => setItem(null)} />}
        </View>
    );
}

function Pill({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    const t = useTheme();
    return <Row gap={6} style={{ backgroundColor: t.subtle, borderRadius: 99, paddingHorizontal: 12, height: 34 }}><Ionicons name={icon} size={15} color={t.ink} /><Text variant="label" style={{ fontSize: 13 }}>{text}</Text></Row>;
}

/** Item options: size, add-on groups (min/max), notes, quantity. */
function ItemSheet({ item, store, onClose }: { item: MenuItem; store: Store; onClose: () => void }) {
    const t = useTheme();
    const cart = useCart();
    const [variant, setVariant] = useState<string | null>(item.variants[0]?.name ?? null);
    const [mods, setMods] = useState<string[]>([]);
    const [qty, setQty] = useState(1);
    const [notes, setNotes] = useState('');
    const groups = item.modifier_groups ?? [];
    const perKg = item.sold_by === 'kg';
    const step = item.step_kg ?? 0.5;
    const kg = (n: number) => `${+(n * step).toFixed(3)} kg`;
    const base = (item.special_price?.zig ?? item.price.zig) * (perKg ? step : 1);
    const unit = base + (item.variants.find((v) => v.name === variant)?.price_delta_zig ?? 0) + mods.reduce((s, m) => s + (groups.flatMap((g) => g.options).find((o) => o.name === m)?.price_delta.zig ?? 0), 0);
    const missing = groups.find((g) => g.options.filter((o) => mods.includes(o.name)).length < g.min);

    const toggle = (g: (typeof groups)[number], name: string) => {
        const names = g.options.map((o) => o.name);
        if (mods.includes(name)) setMods(mods.filter((m) => m !== name));
        else if (g.max === 1) setMods([...mods.filter((m) => !names.includes(m)), name]);
        else if (mods.filter((m) => names.includes(m)).length < g.max) setMods([...mods, name]);
    };

    const add = (replace = false) => {
        const ok = cart.add({ id: store.id, name: store.name, min_order_zig: store.min_order.zig }, { item_id: item.id, name: perKg ? `${item.name} (per ${step} kg)` : item.name, image: item.image, unit_zig: unit, variant, modifiers: mods, notes: notes || undefined }, qty, replace);
        if (!ok) {
            Alert.alert('Start a new basket?', `Your basket has items from ${cart.store?.name}. Clear it and add from ${store.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'New basket', onPress: () => add(true) }]);
            return;
        }
        onClose();
    };

    const Choice = ({ on, label, extra, radio, onPress }: { on: boolean; label: string; extra?: string; radio?: boolean; onPress: () => void }) => (
        <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 0.5, borderColor: t.border }}>
            <Ionicons name={radio ? (on ? 'radio-button-on' : 'radio-button-off') : on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.ink : t.faint} />
            <Text style={{ flex: 1 }}>{label}</Text>
            {extra && <Text color="muted">{extra}</Text>}
        </Pressable>
    );

    return (
        <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: t.bg }}>
                <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                    <Cover uri={item.image} seed={item.id} height={240} radius={0} />
                    <Pressable onPress={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color="#111412" /></Pressable>
                    <View style={{ padding: 20, gap: 8 }}>
                        <Text variant="title">{item.name}</Text>
                        <Row justify="space-between">
                            <Text variant="heading">{zig(base)}</Text>
                            <WatchButton itemId={item.id} />
                        </Row>
                        {item.description && <Text color="muted">{item.description}</Text>}
                        {item.variants.length > 0 && (
                            <View style={{ marginTop: 16 }}>
                                <Row justify="space-between"><Text variant="heading">Size</Text><Text variant="caption">Required</Text></Row>
                                {item.variants.map((v) => <Choice key={v.name} radio on={variant === v.name} label={v.name} extra={v.price_delta_zig ? `+${zig(v.price_delta_zig)}` : undefined} onPress={() => setVariant(v.name)} />)}
                            </View>
                        )}
                        {groups.map((g) => (
                            <View key={g.id} style={{ marginTop: 16 }}>
                                <Row justify="space-between"><Text variant="heading">{g.name}</Text><Text variant="caption" color={missing?.id === g.id ? 'red' : 'muted'}>{g.required ? 'Required' : `Up to ${g.max}`}</Text></Row>
                                {g.options.map((o) => <Choice key={o.id} radio={g.max === 1} on={mods.includes(o.name)} label={o.name} extra={o.price_delta.zig ? `+${zig(o.price_delta.zig)}` : undefined} onPress={() => toggle(g, o.name)} />)}
                            </View>
                        ))}
                        <Text variant="heading" style={{ marginTop: 16 }}>Special instructions</Text>
                        <TextInput value={notes} onChangeText={setNotes} placeholder="e.g. no onions" placeholderTextColor={t.faint} multiline style={{ minHeight: 70, borderRadius: 12, backgroundColor: t.subtle, padding: 12, color: t.ink, fontSize: 15 }} />
                    </View>
                </ScrollView>
                <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.bg, borderTopWidth: 0.5, borderColor: t.border, padding: 16, flexDirection: 'row', gap: 12 }}>
                    <Row gap={0} style={{ backgroundColor: t.subtle, borderRadius: 99 }}>
                        <Pressable onPress={() => setQty(Math.max(1, qty - 1))} style={{ width: 48, height: 54, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="remove" size={20} color={t.ink} /></Pressable>
                        <Text variant="heading">{perKg ? kg(qty) : qty}</Text>
                        <Pressable onPress={() => setQty(qty + 1)} style={{ width: 48, height: 54, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={20} color={t.ink} /></Pressable>
                    </Row>
                    <Button style={{ flex: 1 }} disabled={!!missing} title={missing ? `Choose ${missing.name.toLowerCase()}` : `Add ${perKg ? kg(qty) : qty} · ${zig(unit * qty)}`} onPress={() => add()} />
                </SafeAreaView>
            </View>
        </Modal>
    );
}

/** Price-drop alert: get a push when this item gets cheaper. */
function WatchButton({ itemId }: { itemId: number }) {
    const t = useTheme();
    const { me } = useSession();
    const [on, setOn] = useState(false);
    useEffect(() => {
        if (me) api.get<{ item_id: number }[]>('/watches').then((w) => setOn(w.some((x) => x.item_id === itemId))).catch(() => {});
    }, [me, itemId]);
    if (!me) return null;
    const toggle = async () => {
        setOn(!on);
        await (on ? api.delete(`/items/${itemId}/watch`) : api.post(`/items/${itemId}/watch`)).catch(() => setOn(on));
    };
    return (
        <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: on ? t.brandSoft : t.subtle }}>
            <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={16} color={on ? t.brand : t.ink} />
            <Text variant="caption" color={on ? 'brand' : 'ink'}>{on ? 'Watching price' : 'Price-drop alert'}</Text>
        </Pressable>
    );
}

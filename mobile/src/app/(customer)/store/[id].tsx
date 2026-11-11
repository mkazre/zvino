import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, SectionList, Share, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CartBar, Cover, DishRow, closedLabel, type MenuItem, type Store } from '@/features/cards';
import { useLocation } from '@/lib/location';
import { useImg } from '@/lib/prefs';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { Button, Chip, Loading, Row, Text, useTheme } from '@/ui';
import { useSession } from '@/lib/session';

type Menu = Store & { accepts_catering?: boolean; description: string | null; address?: string | null; categories: { id: number; name: string; items: { data?: MenuItem[] } | MenuItem[] }[] };
type Extras = { availability?: Store['availability']; hours?: { weekday: number; opens_at: string; closes_at: string }[]; distance_km?: number | null; rating_count?: number; offers_pickup?: boolean };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Store page (MrD-style): cover with open/closed, highlights & specials cards, then the menu with category tabs. */
export default function StoreScreen() {
    const t = useTheme();
    const img = useImg();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { query } = useLocation();
    const [store, setStore] = useState<Menu | null>(null);
    const [extras, setExtras] = useState<Extras>({});
    const [deals, setDeals] = useState<{ id: number; headline: string; live: boolean }[]>([]);
    const [item, setItem] = useState<MenuItem | null>(null);
    const [q, setQ] = useState('');
    const [headerH, setHeaderH] = useState(9999);
    const [showTabs, setShowTabs] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const list = useRef<SectionList<MenuItem>>(null);
    const tabs = useRef<{ scrollTo: (o: { x: number; animated?: boolean }) => void } | null>(null);

    useEffect(() => {
        api.get<{ data: Menu; deals?: { id: number; headline: string; live: boolean }[] } & Extras>(`/vendors/${id}/menu${query ? `?${query}` : ''}`)
            .then((r) => { setStore(r.data); setDeals(r.deals ?? []); setExtras({ availability: r.availability, hours: r.hours, distance_km: r.distance_km, rating_count: r.rating_count, offers_pickup: r.offers_pickup }); })
            .catch(() => Alert.alert('Store unavailable', 'This store isn’t taking orders right now.', [{ text: 'OK', onPress: () => router.back() }]));
    }, [id, query]);

    const all = useMemo(() => (store?.categories ?? []).flatMap((c) => (Array.isArray(c.items) ? c.items : (c.items?.data ?? []))), [store]);
    const sections = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return (store?.categories ?? [])
            .map((c) => ({ title: c.name, data: (Array.isArray(c.items) ? c.items : (c.items?.data ?? [])).filter((i) => !needle || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(needle)) }))
            .filter((s) => s.data.length);
    }, [store, q]);
    const highlights = useMemo(() => all.filter((i) => i.is_popular && i.is_available).slice(0, 10), [all]);
    const specials = useMemo(() => all.filter((i) => i.special_price && i.is_available).slice(0, 10), [all]);

    if (!store) return <Loading />;
    const closed = closedLabel(extras.availability);
    const logo = img(store.logo, 200);

    const jump = (i: number) => {
        setActiveTab(i);
        list.current?.scrollToLocation({ sectionIndex: i, itemIndex: 0, viewOffset: 56, animated: true });
    };
    const moreInfo = () => {
        const hours = DAYS.map((d, i) => {
            const slots = (extras.hours ?? []).filter((h) => h.weekday === i);
            return `${d}  ${slots.length ? slots.map((h) => `${h.opens_at.slice(0, 5)}–${h.closes_at.slice(0, 5)}`).join(', ') : 'Closed'}`;
        }).join('\n');
        Alert.alert(store.name, [store.description, store.address ? `${store.address}, ${store.city}` : null, `Opening hours\n${hours}`, store.min_order.zig > 0 ? `Minimum order ${zig(store.min_order.zig)}` : null].filter(Boolean).join('\n\n'));
    };

    const Rail = ({ title, items, badge }: { title: string; items: MenuItem[]; badge?: string }) => (
        <View style={{ marginTop: 18 }}>
            <Text variant="title" style={{ fontSize: 22, paddingHorizontal: 20, marginBottom: 12 }}>{title}</Text>
            <FlatList horizontal data={items} keyExtractor={(i) => `${title}-${i.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                renderItem={({ item: i }) => (
                    <Pressable onPress={() => setItem(i)} style={{ width: 150 }}>
                        <View>
                            <Cover uri={i.image} seed={i.id} height={150} radius={18} />
                            {badge ? <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: t.red, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}><Text variant="caption" style={{ color: '#fff', fontWeight: '800' }}>{badge}</Text></View> : null}
                        </View>
                        <Text variant="label" numberOfLines={1} style={{ marginTop: 8 }}>{i.name}</Text>
                        <Row gap={6}>
                            <Text color={i.special_price ? 'red' : 'muted'} style={{ fontWeight: '600' }}>{i.variants.length ? 'from ' : ''}{zig(i.special_price?.zig ?? i.price.zig)}</Text>
                            {i.special_price ? <Text variant="caption" style={{ textDecorationLine: 'line-through' }}>{zig(i.price.zig)}</Text> : null}
                        </Row>
                    </Pressable>
                )} />
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: t.bg }}>
            <SectionList
                ref={list}
                sections={sections}
                keyExtractor={(i) => String(i.id)}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{ paddingBottom: 110 }}
                scrollEventThrottle={32}
                onScroll={(e) => setShowTabs(e.nativeEvent.contentOffset.y > headerH - 60)}
                onViewableItemsChanged={({ viewableItems }) => {
                    const first = viewableItems.find((v) => v.section);
                    if (!first) return;
                    const idx = sections.findIndex((s) => s.title === (first.section as { title: string }).title);
                    if (idx >= 0 && idx !== activeTab) {
                        setActiveTab(idx);
                        tabs.current?.scrollTo({ x: Math.max(0, idx * 110 - 60), animated: true });
                    }
                }}
                ListHeaderComponent={
                    <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
                        <View>
                            <Cover uri={store.cover} seed={store.id} height={240} radius={0} />
                            {closed && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                                <View style={{ backgroundColor: '#fff', borderRadius: 99, borderWidth: 2, borderColor: '#222222', paddingHorizontal: 16, paddingVertical: 7 }}>
                                    <Text style={{ color: '#222222', fontSize: 15 }}><Text style={{ color: '#222222', fontWeight: '800', fontSize: 15 }}>{closed.split(':')[0]}</Text>{closed.includes(':') ? `:${closed.split(':').slice(1).join(':')}` : ''}</Text>
                                </View>
                            </View>}
                            <SafeAreaView edges={['top']} style={{ position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
                                <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color="#fff" /></Pressable>
                                <Pressable onPress={() => Share.share({ message: `Order from ${store.name} on Zvino: https://zvino.online/store/${store.slug}` })} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Share"><Ionicons name="share-outline" size={20} color="#fff" /></Pressable>
                            </SafeAreaView>
                        </View>
                        <View style={{ padding: 20, gap: 10 }}>
                            <Row align="flex-start" gap={14}>
                                <Text variant="display" style={{ flex: 1, fontSize: 32, lineHeight: 36 }}>{store.name}</Text>
                                {logo ? <Image source={{ uri: logo }} style={{ width: 76, height: 76, borderRadius: 16, borderWidth: 1, borderColor: t.border, backgroundColor: '#fff' }} /> : null}
                            </Row>
                            <Row justify="space-between" style={{ borderBottomWidth: 1, borderColor: t.border, paddingBottom: 12 }}>
                                <Text color="muted" numberOfLines={1} style={{ flex: 1 }}>{[store.cuisine, store.kind && store.kind !== 'restaurant' ? store.kind : null].filter(Boolean).join(', ')}</Text>
                                <Pressable onPress={moreInfo}><Text variant="label" color="brand" style={{ fontSize: 16 }}>more info</Text></Pressable>
                            </Row>
                            <Text>
                                {[extras.distance_km != null ? `${extras.distance_km} km away` : store.city, `${store.eta_minutes[0]}–${store.eta_minutes[1]} min`].join('  •  ')}
                                {store.rating > 0 ? <Text color="brand" style={{ fontWeight: '700' }}>{`  •  ${store.rating.toFixed(1)} ★${extras.rating_count ? ` (${extras.rating_count >= 100 ? `${Math.floor(extras.rating_count / 100)}00+` : extras.rating_count})` : ''}`}</Text> : null}
                            </Text>
                            <Row gap={8} style={{ flexWrap: 'wrap' }}>
                                <Pill icon="bicycle-outline" text={store.delivery_fee.zig === 0 ? 'Free delivery' : `From ${zig(store.delivery_fee.zig)}`} />
                                {store.min_order.zig > 0 && <Pill icon="information-circle-outline" text={`${zig(store.min_order.zig)} min`} />}
                                {extras.offers_pickup && <Pill icon="walk-outline" text="Collect" />}
                            </Row>
                            <Row gap={10} style={{ height: 50, borderRadius: 16, backgroundColor: t.subtle, paddingHorizontal: 16, marginTop: 4 }}>
                                <Ionicons name="search" size={20} color={t.muted} />
                                <TextInput value={q} onChangeText={setQ} placeholder={`Search ${store.name}`} placeholderTextColor={t.faint} style={{ flex: 1, fontSize: 16, color: t.ink }} />
                                {!!q && <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={t.muted} /></Pressable>}
                            </Row>
                            {store.accepts_catering && <Pressable onPress={() => router.push({ pathname: '/catering', params: { store: String(store.id), storeName: store.name } })} style={{ padding: 12, borderRadius: 12, backgroundColor: t.subtle }}><Text variant="label">Cater an event: funerals, weddings, gatherings ›</Text></Pressable>}
                            {deals.map((d) => (
                                <View key={d.id} style={{ padding: 12, borderRadius: 12, backgroundColor: d.live ? t.brandSoft : t.subtle }}>
                                    <Text variant="label" color={d.live ? 'brand' : 'muted'}>{d.headline}{d.live ? '' : ' · later today'}</Text>
                                </View>
                            ))}
                        </View>
                        {!q && highlights.length > 0 && <Rail title="Highlights" items={highlights} />}
                        {!q && specials.length > 0 && <Rail title="Specials" items={specials} badge="Special" />}
                        {sections.length > 1 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 22 }}>
                                {sections.map((s, i) => <Chip key={s.title} label={s.title} active={false} onPress={() => jump(i)} />)}
                            </ScrollView>
                        )}
                    </View>
                }
                renderSectionHeader={({ section }) => <View style={{ backgroundColor: t.bg, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 }}><Text variant="title" style={{ fontSize: 22 }}>{section.title}</Text></View>}
                renderItem={({ item: i }) => <View style={{ paddingHorizontal: 20, borderBottomWidth: 0.5, borderColor: t.border }}><DishRow i={i} onPress={() => setItem(i)} /></View>}
                ListEmptyComponent={q ? <Text color="muted" style={{ textAlign: 'center', padding: 32 }}>No dishes match “{q}”.</Text> : undefined}
            />
            {showTabs && (
                <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: t.bg, borderBottomWidth: 1, borderColor: t.border }}>
                    <Row gap={6} style={{ paddingLeft: 8, paddingRight: 16, paddingTop: 4 }}>
                        <Pressable onPress={() => router.back()} style={{ padding: 8 }} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color={t.ink} /></Pressable>
                        <Row gap={8} style={{ flex: 1, height: 42, borderRadius: 14, backgroundColor: t.subtle, paddingHorizontal: 12 }}>
                            <Ionicons name="search" size={18} color={t.muted} />
                            <TextInput value={q} onChangeText={setQ} placeholder={`Search ${store.name}`} placeholderTextColor={t.faint} style={{ flex: 1, fontSize: 15, color: t.ink }} />
                            {!!q && <Pressable onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={t.muted} /></Pressable>}
                        </Row>
                    </Row>
                    {sections.length > 1 && <Row gap={0} style={{ paddingLeft: 8 }}>
                        <ScrollView ref={tabs as never} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
                            {sections.map((s, i) => (
                                <Pressable key={s.title} onPress={() => jump(i)} style={{ paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 3, borderColor: i === activeTab ? t.ink : 'transparent' }}>
                                    <Text variant="label" color={i === activeTab ? 'ink' : 'muted'} style={{ fontSize: 16 }}>{s.title}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </Row>}
                </SafeAreaView>
            )}
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
    const unit = base + Number(item.variants.find((v) => v.name === variant)?.price_delta_zig ?? 0) + mods.reduce((s, m) => s + Number(groups.flatMap((g) => g.options).find((o) => o.name === m)?.price_delta.zig ?? 0), 0);
    const missing = groups.find((g) => g.options.filter((o) => mods.includes(o.name)).length < g.min);

    const toggle = (g: (typeof groups)[number], name: string) => {
        const names = g.options.map((o) => o.name);
        if (mods.includes(name)) setMods(mods.filter((m) => m !== name));
        else if (g.max === 1) setMods([...mods.filter((m) => !names.includes(m)), name]);
        else if (mods.filter((m) => names.includes(m)).length < g.max) setMods([...mods, name]);
    };

    const add = (replace = false) => {
        const ok = cart.add({ id: store.id, name: store.name, min_order_zig: store.min_order.zig, is_shopper_store: !!store.is_shopper_store }, { item_id: item.id, name: perKg ? `${item.name} (per ${step} kg)` : item.name, image: item.image, unit_zig: unit, variant, modifiers: mods, notes: notes || undefined }, qty, replace);
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
                    <Cover uri={item.image} seed={item.id} height={store.kind && store.kind !== 'restaurant' ? 300 : 240} radius={0} fit={store.kind && store.kind !== 'restaurant' ? 'contain' : 'cover'} />
                    <Pressable onPress={onClose} style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color="#222222" /></Pressable>
                    <View style={{ padding: 20, gap: 8 }}>
                        <Text variant="title">{item.name}</Text>
                        <Row justify="space-between">
                            <Text variant="heading">{zig(base)}</Text>
                            <WatchButton itemId={item.id} />
                        </Row>
                        {item.description && <Text color="muted">{item.description}</Text>}
                        {item.size ? <Text variant="caption">Size: {item.size}</Text> : null}
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
                        <TextInput value={notes} onChangeText={setNotes} placeholder={store.kind && store.kind !== 'restaurant' ? 'e.g. ripe ones, or a specific brand' : 'e.g. no onions'} placeholderTextColor={t.faint} multiline style={{ minHeight: 70, borderRadius: 12, backgroundColor: t.subtle, padding: 12, color: t.ink, fontSize: 15 }} />
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

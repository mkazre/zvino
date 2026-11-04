import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { type Money } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { Row, Text, useTheme } from '@/ui';

export interface Store {
    id: number;
    name: string;
    slug: string;
    cuisine: string | null;
    logo: string | null;
    cover: string | null;
    rating: number;
    eta_minutes: [number, number];
    delivery_fee: Money;
    min_order: Money;
    is_featured: boolean;
    has_offers: boolean;
    city: string;
}

export interface MenuItem {
    id: number;
    vendor_id: number;
    category_id: number | null;
    name: string;
    description: string | null;
    image: string | null;
    price: Money;
    special_price: Money | null;
    is_available: boolean;
    is_popular: boolean;
    dietary: string[];
    variants: { name: string; price_delta_zig: number }[];
    modifier_groups?: { id: number; name: string; min: number; max: number; required: boolean; options: { id: number; name: string; price_delta: Money }[] }[];
    vendor?: { id: number; name: string; slug: string };
}

const GRADIENT = ['#0B6E4F', '#111412', '#8A6508', '#7A0A1C'];

export function Cover({ uri, seed = 0, height = 150, radius = 18 }: { uri: string | null; seed?: number; height?: number; radius?: number }) {
    return uri ? (
        <Image source={{ uri }} style={{ height, borderRadius: radius, width: '100%' }} contentFit="cover" transition={200} />
    ) : (
        <View style={{ height, borderRadius: radius, backgroundColor: GRADIENT[seed % GRADIENT.length], alignItems: 'flex-end', justifyContent: 'flex-end', overflow: 'hidden' }}>
            <Ionicons name="restaurant" size={height * 0.6} color="rgba(255,255,255,0.08)" style={{ marginRight: -12, marginBottom: -16 }} />
        </View>
    );
}

export function StoreCard({ s, width }: { s: Store; width?: number }) {
    const t = useTheme();
    return (
        <Pressable onPress={() => router.push(`/store/${s.id}`)} style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1 })}>
            <View>
                <Cover uri={s.cover} seed={s.id} height={width ? width * 0.58 : 170} />
                <Row gap={6} style={{ position: 'absolute', top: 10, left: 10 }}>
                    {s.has_offers && <View style={{ backgroundColor: t.red, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}><Text variant="caption" color="onBrand" style={{ fontWeight: '800', color: '#fff' }}>Offers</Text></View>}
                    {s.delivery_fee.zig === 0 && <View style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}><Text variant="caption" style={{ fontWeight: '800', color: '#111412' }}>Free delivery</Text></View>}
                </Row>
            </View>
            <Row justify="space-between" align="flex-start" style={{ marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                    <Text variant="heading" numberOfLines={1}>{s.name}</Text>
                    <Text variant="caption">{s.delivery_fee.zig === 0 ? 'Free delivery' : `${zig(s.delivery_fee.zig)} delivery`} · {s.eta_minutes[0]}–{s.eta_minutes[1]} min</Text>
                </View>
                {s.rating > 0 && <View style={{ backgroundColor: t.subtle, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 }}><Text variant="caption" style={{ fontWeight: '800', color: t.ink }}>★ {s.rating.toFixed(1)}</Text></View>}
            </Row>
        </Pressable>
    );
}

export function DishRow({ i, onPress }: { i: MenuItem; onPress: () => void }) {
    const t = useTheme();
    const price = i.special_price?.zig ?? i.price.zig;
    return (
        <Pressable disabled={!i.is_available} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingVertical: 14, opacity: !i.is_available ? 0.45 : pressed ? 0.8 : 1 })}>
            <View style={{ flex: 1, gap: 4 }}>
                <Row gap={6}><Text variant="heading" style={{ fontSize: 16 }} numberOfLines={1}>{i.name}</Text>{i.is_popular && <Text variant="caption" style={{ fontWeight: '800', color: t.ink }}>· POPULAR</Text>}</Row>
                {i.description && <Text variant="caption" numberOfLines={2}>{i.description}</Text>}
                <Row gap={6}>
                    <Text variant="label" color={i.special_price ? 'red' : 'ink'}>{zig(price)}</Text>
                    {i.special_price && <Text variant="caption" style={{ textDecorationLine: 'line-through' }}>{zig(i.price.zig)}</Text>}
                    {!i.is_available && <Text variant="caption">Sold out</Text>}
                </Row>
            </View>
            <View>
                {i.image ? <Image source={{ uri: i.image }} style={{ width: 96, height: 96, borderRadius: 14 }} contentFit="cover" /> : <View style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: t.subtle }} />}
                <View style={{ position: 'absolute', right: 6, bottom: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 }}>
                    <Ionicons name="add" size={20} color="#111412" />
                </View>
            </View>
        </Pressable>
    );
}

/** Floating "View basket" bar shown on browse screens. */
export function CartBar() {
    const t = useTheme();
    const { count, subtotal, store } = useCart();
    if (!count) return null;
    return (
        <Pressable onPress={() => router.push('/cart')} style={{ position: 'absolute', left: 16, right: 16, bottom: 16, height: 58, borderRadius: 99, backgroundColor: t.inverse, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 }}>
            <View>
                <Text variant="label" color="onInverse">View basket · {count}</Text>
                <Text variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }} numberOfLines={1}>{store?.name}</Text>
            </View>
            <Text variant="heading" color="onInverse">{zig(subtotal)}</Text>
        </Pressable>
    );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { type Money } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { Row, Text, useTheme } from '@/ui';
import { useImg } from '@/lib/prefs';

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
    kind?: string;
    rating_count?: number;
    distance_km?: number | null;
    availability?: { is_open: boolean; reason: string | null; next_open_at: string | null } | null;
}

/** "Closed: opens 08:00" (or null when open). */
export function closedLabel(a: Store['availability']): string | null {
    if (!a || a.is_open) return null;
    const at = a.next_open_at ? new Date(a.next_open_at) : null;
    const when = at ? (at.toDateString() === new Date().toDateString() ? at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) : null;
    return `${a.reason === 'paused' ? 'Paused' : 'Closed'}${when ? `: opens ${when}` : ''}`;
}

const countLabel = (n?: number) => (!n ? '' : n >= 1000 ? ` (${Math.floor(n / 1000)}000+)` : n >= 100 ? ` (${Math.floor(n / 100)}00+)` : n >= 50 ? ' (50+)' : ` (${n})`);

export interface MenuItem {
    id: number;
    vendor_id: number;
    category_id: number | null;
    name: string;
    description: string | null;
    image: string | null;
    price: Money;
    special_price: Money | null;
    sold_by?: 'unit' | 'kg';
    step_kg?: number;
    is_available: boolean;
    is_popular: boolean;
    dietary: string[];
    variants: { name: string; price_delta_zig: number }[];
    modifier_groups?: { id: number; name: string; min: number; max: number; required: boolean; options: { id: number; name: string; price_delta: Money }[] }[];
    vendor?: { id: number; name: string; slug: string };
}

const GRADIENT = ['#17C74A', '#222222', '#8A6508', '#7A0A1C'];

export function Cover({ uri: path, seed = 0, height = 150, radius = 18 }: { uri: string | null; seed?: number; height?: number; radius?: number }) {
    const uri = useImg()(path, 640);
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
    const closed = closedLabel(s.availability);
    const meta = [s.rating > 0 ? `${s.rating.toFixed(1)} ★${countLabel(s.rating_count)}` : null, `${s.eta_minutes[0]}–${s.eta_minutes[1]} min`, s.distance_km != null ? (s.distance_km < 1 ? "under 1 km" : `${s.distance_km} km`) : null, s.delivery_fee.zig === 0 ? 'Free delivery' : null].filter(Boolean).join(' · ');
    return (
        <Pressable onPress={() => router.push(`/store/${s.id}`)} style={({ pressed }) => ({ width, opacity: pressed ? 0.85 : 1, backgroundColor: t.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: t.border })}>
            <View>
                <Cover uri={s.cover} seed={s.id} height={width ? width * 0.5 : 180} radius={0} />
                {closed && <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />}
                <Row gap={6} style={{ position: 'absolute', top: 10, left: 10 }}>
                    {s.has_offers && <View style={{ backgroundColor: t.red, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}><Text variant="caption" style={{ fontWeight: '800', color: '#fff' }}>Offers</Text></View>}
                    {s.delivery_fee.zig === 0 && <View style={{ backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 3 }}><Text variant="caption" style={{ fontWeight: '800', color: '#222222' }}>Free delivery</Text></View>}
                </Row>
                {closed && (
                    <View style={{ position: 'absolute', left: 10, bottom: 10, backgroundColor: '#fff', borderRadius: 99, borderWidth: 2, borderColor: '#222222', paddingHorizontal: 12, paddingVertical: 5 }}>
                        <Text style={{ color: '#222222', fontSize: 13 }}><Text style={{ color: '#222222', fontSize: 13, fontWeight: '800' }}>{closed.split(':')[0]}</Text>{closed.includes(':') ? `:${closed.split(':').slice(1).join(':')}` : ''}</Text>
                    </View>
                )}
            </View>
            <View style={{ padding: 12 }}>
                <Text variant="heading" numberOfLines={1}>{s.name}</Text>
                <Text variant="caption" numberOfLines={1}>{meta}</Text>
            </View>
        </Pressable>
    );
}

/** Logo tile for "Shops near you" / "Popular brands". */
export function LogoTile({ s, ad = false, circle = false }: { s: Store; ad?: boolean; circle?: boolean }) {
    const t = useTheme();
    const img = useImg();
    const uri = img(s.logo, 240);
    return (
        <Pressable onPress={() => router.push(`/store/${s.id}`)} style={{ width: 92, alignItems: 'center', gap: 6 }}>
            <View style={{ width: 92, height: 92, borderRadius: circle ? 46 : 20, backgroundColor: '#fff', borderWidth: 1, borderColor: t.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', opacity: s.availability && !s.availability.is_open ? 0.6 : 1 }}>
                {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : <Text variant="label" style={{ color: '#222222', textAlign: 'center', paddingHorizontal: 6 }} numberOfLines={3}>{s.name}</Text>}
            </View>
            <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center' }}>{ad ? 'Ad · ' : ''}{s.name}</Text>
        </Pressable>
    );
}

export function DishRow({ i, onPress }: { i: MenuItem; onPress: () => void }) {
    const img = useImg();
    const t = useTheme();
    const price = i.special_price?.zig ?? i.price.zig;
    return (
        <Pressable disabled={!i.is_available} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', gap: 14, paddingVertical: 14, opacity: !i.is_available ? 0.45 : pressed ? 0.8 : 1 })}>
            <View style={{ flex: 1, gap: 4 }}>
                <Row gap={6}><Text variant="heading" style={{ fontSize: 16 }} numberOfLines={1}>{i.name}</Text>{i.is_popular && <Text variant="caption" style={{ fontWeight: '800', color: t.ink }}>· POPULAR</Text>}</Row>
                {i.description && <Text variant="caption" numberOfLines={2}>{i.description}</Text>}
                <Row gap={6}>
                    <Text variant="label" color={i.special_price ? 'red' : 'ink'}>{zig(price)}{i.sold_by === 'kg' ? ' / kg' : ''}</Text>
                    {i.special_price && <Text variant="caption" style={{ textDecorationLine: 'line-through' }}>{zig(i.price.zig)}</Text>}
                    {!i.is_available && <Text variant="caption">Sold out</Text>}
                </Row>
            </View>
            <View>
                {i.image ? <Image source={{ uri: img(i.image, 320)! }} style={{ width: 96, height: 96, borderRadius: 14 }} contentFit="cover" /> : <View style={{ width: 96, height: 96, borderRadius: 14, backgroundColor: t.subtle }} />}
                <View style={{ position: 'absolute', right: 6, bottom: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 }}>
                    <Ionicons name="add" size={20} color="#222222" />
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

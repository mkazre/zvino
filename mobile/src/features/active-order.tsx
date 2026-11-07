import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useChannel } from '@/lib/realtime';
import { Text, useTheme } from '@/ui';

interface ActiveOrder { id: number; reference: string; status: string; label: string; store: string | null; logo: string | null; eta: string | null; live: boolean; more: number }

const minutesLeft = (eta: string | null) => {
    if (!eta) return null;
    const m = Math.round((new Date(eta).getTime() - Date.now()) / 60000);
    return m > 0 ? m : null;
};

/** Floating "your order" bubble above the tab bar while an order is on its way. Tap → tracking. */
export function ActiveOrderBubble({ above = 64 }: { above?: number }) {
    const t = useTheme();
    const { count } = useCart();
    const bottom = above + (count ? 16 + 58 + 10 : 14); // sit above the basket bar when there is one
    const [o, setO] = useState<ActiveOrder | null>(null);
    const pulse = useRef(new Animated.Value(0)).current;

    const load = useCallback(() => { api.get<{ order: ActiveOrder | null }>('/orders/active').then((r) => setO(r?.order ?? null)).catch(() => {}); }, []);
    useFocusEffect(useCallback(() => { load(); }, [load]));
    useEffect(() => {
        const timer = setInterval(load, 30000);
        const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
        return () => { clearInterval(timer); sub.remove(); };
    }, [load]);
    useChannel(o ? `order.${o.id}` : null, 'order.updated', load);

    useEffect(() => {
        if (!o) return;
        const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true })]));
        loop.start();
        return () => loop.stop();
    }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!o) return null;
    const mins = minutesLeft(o.eta);

    return (
        <Pressable
            onPress={() => router.push(o.live ? `/order/${o.id}?live=1` : `/order/${o.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Track order ${o.reference}: ${o.label}`}
            style={({ pressed }) => ({
                position: 'absolute', right: 14, bottom, maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: '#1C1C1C', borderRadius: 999, paddingVertical: 7, paddingLeft: 7, paddingRight: 14,
                elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 6 },
                transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
        >
            <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                <Animated.View style={{ position: 'absolute', width: 42, height: 42, borderRadius: 21, backgroundColor: t.brand, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }] }} />
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: t.brand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                    {o.logo ? <Image source={{ uri: o.logo }} style={{ width: 42, height: 42 }} contentFit="cover" /> : <Ionicons name={o.live ? 'bicycle' : 'restaurant'} size={20} color="#111" />}
                </View>
                {o.live && <View style={{ position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, backgroundColor: t.brand, borderWidth: 2, borderColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="navigate" size={9} color="#111" /></View>}
            </View>
            <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{o.label}{mins !== null ? <Text style={{ color: t.brand, fontWeight: '800', fontSize: 15 }}>{` · ${mins} min`}</Text> : null}</Text>
                <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{o.live ? 'Tap to watch your driver live' : `${o.store ?? 'Your order'} · #${o.reference}`}{o.more > 0 ? ` · +${o.more} more` : ''}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.5)" />
        </Pressable>
    );
}

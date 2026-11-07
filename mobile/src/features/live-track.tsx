import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { label } from '@/lib/money';
import { Text, useTheme } from '@/ui';

const POLL_MS = 4000;

/** The fields of the order view the live map needs (same data as the website). */
export interface LiveView {
    id: number; reference: string; status: string;
    time: { at: string | null };
    store: { name: string; lat: number | null; lng: number | null };
    driver: { name: string; phone: string; vehicle: string; plate: string | null; lat: number | null; lng: number | null; located_at?: string | null; stops_before?: number } | null;
    details: { address_lat: number | null; address_lng: number | null };
}

type LatLng = { latitude: number; longitude: number };

function km(a: LatLng, b: LatLng) {
    const r = 6371, d = Math.PI / 180;
    const x = Math.sin(((b.latitude - a.latitude) * d) / 2) ** 2 + Math.cos(a.latitude * d) * Math.cos(b.latitude * d) * Math.sin(((b.longitude - a.longitude) * d) / 2) ** 2;
    return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function ago(iso: string | null | undefined, now: number) {
    if (!iso) return null;
    const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
    return s < 10 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
}

/**
 * Full-screen live map once the driver has the order: the store, the driver moving in real time,
 * the delivery address and the customer's own position (blue dot, if they allow location).
 */
export function LiveTrack<T extends LiveView>({ visible, view, onClose, onUpdate }: { visible: boolean; view: T; onClose: () => void; onUpdate: (v: T) => void }) {
    const t = useTheme();
    const map = useRef<MapView>(null);
    const [me, setMe] = useState<LatLng | null>(null);
    const [now, setNow] = useState(Date.now());
    const fitted = useRef(false);

    // Fast updates while open.
    useEffect(() => {
        if (!visible) return;
        const load = () => api.get<{ view: T }>(`/orders/${view.id}`).then((r) => r?.view && onUpdate(r.view)).catch(() => {});
        load();
        const p = setInterval(load, POLL_MS);
        const c = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(p); clearInterval(c); };
    }, [visible, view.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // The customer's own position (asked only when they open the live map).
    useEffect(() => {
        if (!visible) return;
        let sub: Location.LocationSubscription | null = null;
        let cancelled = false;
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' as const }));
            if (status !== 'granted' || cancelled) return;
            sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 15 }, (p) => setMe({ latitude: p.coords.latitude, longitude: p.coords.longitude })).catch(() => null);
        })();
        return () => { cancelled = true; sub?.remove(); };
    }, [visible]);

    const v = view;
    const driver = v.driver?.lat && v.driver.lng ? { latitude: v.driver.lat, longitude: v.driver.lng } : null;
    const home = v.details.address_lat && v.details.address_lng ? { latitude: v.details.address_lat, longitude: v.details.address_lng } : null;
    const store = v.store.lat && v.store.lng ? { latitude: v.store.lat, longitude: v.store.lng } : null;
    const everyone = [driver, home, store, me].filter(Boolean) as LatLng[];

    const fit = (animated = true) => everyone.length && map.current?.fitToCoordinates(everyone, { edgePadding: { top: 120, right: 60, bottom: 320, left: 60 }, animated });
    useEffect(() => {
        if (!visible) { fitted.current = false; return; }
        if (!fitted.current && everyone.length >= 2) {
            fitted.current = true;
            setTimeout(() => fit(false), 300);
        }
    }, [visible, everyone.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const away = driver && home ? km(driver, home) * 1.3 : null;
    const eta = v.time.at ? Math.max(0, Math.round((new Date(v.time.at).getTime() - now) / 60000)) : null;
    const delivered = v.status === 'delivered';
    const stopsBefore = v.driver?.stops_before ?? 0;
    const start = driver ?? home ?? store ?? { latitude: -17.8292, longitude: 31.0522 };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
            <View style={{ flex: 1, backgroundColor: t.bg }}>
                <MapView ref={map} style={{ flex: 1 }} initialRegion={{ ...start, latitudeDelta: 0.05, longitudeDelta: 0.05 }} showsUserLocation={!!me} showsMyLocationButton={false} toolbarEnabled={false}>
                    {store && (
                        <Marker coordinate={store} title={v.store.name} anchor={{ x: 0.5, y: 0.5 }}>
                            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}><Ionicons name="storefront" size={15} color="#fff" /></View>
                        </Marker>
                    )}
                    {home && (
                        <Marker coordinate={home} title="Delivery address" anchor={{ x: 0.5, y: 0.5 }}>
                            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#1C1C1C' }}><Ionicons name="home" size={16} color="#1C1C1C" /></View>
                        </Marker>
                    )}
                    {driver && home && <Polyline coordinates={[driver, home]} strokeColor="#1C1C1C" strokeWidth={3} lineDashPattern={[6, 8]} />}
                    {driver && (
                        <Marker coordinate={driver} title={v.driver?.name} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                            <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(23,199,74,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}><Ionicons name="bicycle" size={18} color="#111" /></View>
                            </View>
                        </Marker>
                    )}
                </MapView>

                <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0 }} pointerEvents="box-none">
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 }} pointerEvents="box-none">
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 }}>
                            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.brand }} />
                            <Text variant="label">Live · #{v.reference}</Text>
                        </View>
                        <Pressable onPress={onClose} accessibilityLabel="Close live map" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 }}><Ionicons name="close" size={22} color={t.ink} /></Pressable>
                    </View>
                </SafeAreaView>

                <Pressable onPress={() => fit()} accessibilityLabel="Show everyone on the map" style={{ position: 'absolute', right: 16, bottom: 300, width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8 }}><Ionicons name="scan" size={20} color={t.ink} /></Pressable>

                <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12 }}>
                    <View style={{ backgroundColor: t.surface, borderRadius: 26, padding: 18, gap: 12, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20 }}>
                        {delivered ? (
                            <View style={{ alignItems: 'center', gap: 6 }}>
                                <Text variant="title">Delivered 🎉</Text>
                                <Text color="muted">Enjoy your order!</Text>
                                <Pressable onPress={onClose} style={{ marginTop: 8, alignSelf: 'stretch', height: 48, borderRadius: 24, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Text variant="label" style={{ color: '#111' }}>Done</Text></Pressable>
                            </View>
                        ) : (
                            <>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                    <View>
                                        <Text variant="caption" style={{ fontWeight: '700', textTransform: 'uppercase' }}>{v.status === 'arriving' ? 'Almost there' : 'On the way'}</Text>
                                        <Text variant="display" style={{ fontSize: 30 }}>{eta !== null ? (eta <= 1 ? 'Any moment' : `${eta} min`) : '—'}</Text>
                                    </View>
                                    {away !== null && <View style={{ alignItems: 'flex-end' }}><Text variant="heading">{away < 1 ? `${Math.round(away * 1000)} m` : `${away.toFixed(1)} km`}</Text><Text variant="caption">away</Text></View>}
                                </View>
                                {stopsBefore > 0 && <View style={{ backgroundColor: t.subtle, borderRadius: 12, padding: 10 }}><Text>Your driver has {stopsBefore} drop-off{stopsBefore > 1 ? 's' : ''} before you.</Text></View>}
                                {v.driver ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderColor: t.border, paddingTop: 12 }}>
                                        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}><Text variant="heading" style={{ color: '#111' }}>{v.driver.name[0]}</Text></View>
                                        <View style={{ flex: 1 }}>
                                            <Text variant="label" numberOfLines={1}>{v.driver.name}</Text>
                                            <Text variant="caption" numberOfLines={1}>{label(v.driver.vehicle ?? 'motorbike')}{v.driver.plate ? ` · ${v.driver.plate}` : ''}{v.driver.located_at ? ` · updated ${ago(v.driver.located_at, now)}` : ''}</Text>
                                        </View>
                                        <Pressable onPress={() => Linking.openURL(`tel:${v.driver!.phone}`)} accessibilityLabel="Call driver" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="call" size={20} color={t.ink} /></Pressable>
                                    </View>
                                ) : null}
                                {!driver && <Text color="muted">Waiting for your driver’s location…</Text>}
                            </>
                        )}
                    </View>
                </SafeAreaView>
            </View>
        </Modal>
    );
}

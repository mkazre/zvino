import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { VARIANT } from './config';
import { useSession } from './session';

/**
 * The customer's active delivery location (MrD-style): on launch the app reads the phone's GPS,
 * picks the saved address it's standing at (within ~75 m, decided by the server), otherwise uses
 * "Current location" and offers to save it. Home, Shops and Search load stores for this location.
 */
export interface ActiveLocation { lat: number | null; lng: number | null; address_id: number | null; label: string | null; line: string | null; city: string | null; suburb?: string | null }
export interface SavedAddress { id: number; label: string; line1: string; suburb: string | null; city: string; lat: number | null; lng: number | null; is_default?: boolean }

const KEY = 'zvino.location';

interface Ctx {
    active: ActiveLocation | null;
    status: 'idle' | 'locating' | 'denied' | 'ready';
    /** True when GPS found the customer away from every saved address (offer to save it). */
    suggestSave: boolean;
    dismissSuggest: () => void;
    addresses: SavedAddress[];
    reloadAddresses: () => Promise<SavedAddress[]>;
    chooseAddress: (a: SavedAddress) => void;
    locate: () => Promise<void>;
    /** Query string for API calls: lat, lng, address_id. */
    query: string;
}

const LocationCtx = createContext<Ctx>({
    active: null, status: 'idle', suggestSave: false, dismissSuggest: () => {}, addresses: [], reloadAddresses: async () => [], chooseAddress: () => {}, locate: async () => {}, query: '',
});

export const fromAddress = (a: SavedAddress): ActiveLocation => ({ lat: a.lat, lng: a.lng, address_id: a.id, label: a.label || 'Home', line: [a.line1, a.suburb].filter(Boolean).join(', '), city: a.city });

export function LocationProvider({ children }: { children: ReactNode }) {
    const { me, ready } = useSession();
    const [active, setActiveState] = useState<ActiveLocation | null>(null);
    const [status, setStatus] = useState<Ctx['status']>('idle');
    const [suggestSave, setSuggestSave] = useState(false);
    const [addresses, setAddresses] = useState<SavedAddress[]>([]);
    const started = useRef(false);

    const setActive = useCallback((loc: ActiveLocation | null) => {
        setActiveState(loc);
        if (loc) AsyncStorage.setItem(KEY, JSON.stringify(loc)).catch(() => {});
    }, []);

    const reloadAddresses = useCallback(async () => {
        if (!me) {
            setAddresses([]);
            return [];
        }
        const list = await api.get<SavedAddress[]>('/addresses').catch(() => [] as SavedAddress[]);
        setAddresses(list);
        return list;
    }, [me]);

    const locate = useCallback(async () => {
        setStatus('locating');
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (perm.status !== 'granted') {
                setStatus('denied');
                return;
            }
            const pos = (await Location.getLastKnownPositionAsync({ maxAge: 120000, requiredAccuracy: 200 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
            const r = await api.post<{ matched: boolean; location: ActiveLocation }>('/location/resolve', { lat: pos.coords.latitude, lng: pos.coords.longitude });
            setActive(r.location);
            setSuggestSave(!r.matched && !!me);
            setStatus('ready');
        } catch {
            setStatus((s) => (s === 'locating' ? 'ready' : s));
        }
    }, [me, setActive]);

    // Launch: show the last location instantly, then refresh from GPS once the session is known.
    useEffect(() => {
        AsyncStorage.getItem(KEY).then((raw) => raw && setActiveState((cur) => cur ?? JSON.parse(raw))).catch(() => {});
    }, []);
    useEffect(() => {
        if (!ready || started.current || VARIANT !== 'customer') return;
        started.current = true;
        reloadAddresses();
        locate();
    }, [ready, locate, reloadAddresses]);
    useEffect(() => {
        if (ready) reloadAddresses();
    }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const query = active?.lat != null ? `lat=${active.lat}&lng=${active.lng}${active.address_id ? `&address_id=${active.address_id}` : ''}` : '';

    return (
        <LocationCtx.Provider value={{
            active, status, suggestSave, dismissSuggest: () => setSuggestSave(false), addresses, reloadAddresses,
            chooseAddress: (a) => { setActive(fromAddress(a)); setSuggestSave(false); }, locate, query,
        }}>
            {children}
        </LocationCtx.Provider>
    );
}

export const useLocation = () => useContext(LocationCtx);

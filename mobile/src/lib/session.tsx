import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, auth } from './api';
import { registerForPush } from './push';
import { disconnectRealtime } from './realtime';
import { identify } from './sentry';

export interface Me {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: 'customer' | 'driver' | 'vendor_manager' | 'cashier' | 'kitchen' | string;
    preferred_currency: string;
    locale: string;
    wallet_balance_zig: number;
    points: number;
    tier: string;
    zvino_plus: { status: string; current_period_end: string } | null;
    is_driver: boolean;
    vendor_id?: number | null;
}

interface Session {
    ready: boolean;
    me: Me | null;
    signIn: (token: string) => Promise<void>;
    signOut: () => Promise<void>;
    refresh: () => Promise<void>;
}

const Ctx = createContext<Session>({ ready: false, me: null, signIn: async () => {}, signOut: async () => {}, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
    const [ready, setReady] = useState(false);
    const [me, setMe] = useState<Me | null>(null);

    const refresh = useCallback(async () => {
        try {
            setMe(await api.get<Me>('/me'));
        } catch {
            setMe(null);
        }
    }, []);

    useEffect(() => {
        auth.onUnauthorized(() => setMe(null));
        auth.load().then(async (t) => {
            if (t) await refresh();
            setReady(true);
        });
    }, [refresh]);

    // Register this device for push once signed in (Expo push → FCM/APNs).
    useEffect(() => {
        if (me) registerForPush().catch(() => {});
        identify(me ? { id: me.id, role: me.role } : null);
    }, [me?.id]);

    const signIn = useCallback(async (token: string) => {
        await auth.set(token);
        await refresh();
    }, [refresh]);

    const signOut = useCallback(async () => {
        await api.post('/auth/logout').catch(() => {});
        await auth.set(null);
        disconnectRealtime();
        setMe(null);
    }, []);

    return <Ctx.Provider value={{ ready, me, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

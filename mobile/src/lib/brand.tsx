import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useEffect, useSyncExternalStore } from 'react';
import { setBrandColors } from '@/ui/theme';
import { api } from './api';
import { setCurrency } from './money';
import { updateLabel } from './updates';

/** Brand colours + logo from Admin → Settings → Branding, cached for offline launches. */
interface RemoteBrand { primary: string; primary_dark: string; primary_soft: string; on_primary: string; accent: string; accent_dark: string; accent_soft: string; danger: string; danger_soft: string; logo: string; logo_dark: string; mark: string }
const KEY = 'zvino.brand';
let logos: { logo: string | null; logo_dark: string | null } = { logo: null, logo_dark: null };
const listeners = new Set<() => void>();

function apply(b: RemoteBrand) {
    setBrandColors({ brand: b.primary, brandText: b.primary_dark, brandSoft: b.primary_soft, onBrand: b.on_primary, gold: b.accent, goldText: b.accent_dark, goldSoft: b.accent_soft, red: b.danger, redSoft: b.danger_soft });
    logos = { logo: b.logo, logo_dark: b.logo_dark };
    listeners.forEach((l) => l());
}

export function useLoadBrand() {
    useEffect(() => {
        AsyncStorage.getItem('zvino.currency').then((raw) => raw && setCurrency(JSON.parse(raw))).catch(() => {});
        AsyncStorage.getItem(KEY).then((raw) => raw && apply(JSON.parse(raw))).catch(() => {});
        api.get<{ brand?: RemoteBrand; zig_per_usd?: number; currencies?: { primary?: string } }>('/config').then((c) => {
            const cur = { primary: c.currencies?.primary, zig_per_usd: c.zig_per_usd };
            setCurrency(cur);
            AsyncStorage.setItem('zvino.currency', JSON.stringify(cur)).catch(() => {});
            if (!c.brand) return;
            apply(c.brand);
            AsyncStorage.setItem(KEY, JSON.stringify(c.brand)).catch(() => {});
        }).catch(() => {});
    }, []);
}

export function useBrandLogo(inverse: boolean): string | null {
    const l = useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => logos);
    const url = inverse ? l.logo_dark : l.logo;
    // Bundled copy is sharper and instant for the default logo; use the remote one only if the admin uploaded a new logo.
    return url && !/\/brand\/logo(-inverse)?\.png$/.test(url) ? url : null;
}

/** "1.0.0 (12)" for About screens. */
export const appVersion = () => {
    const v = Constants.expoConfig?.version ?? '1.0.0';
    const b = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber;
    return `${b ? `${v} (${b})` : v} · ${updateLabel()}`;
};

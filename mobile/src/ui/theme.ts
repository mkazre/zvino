import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

/**
 * Zvino palette from the logo: white surfaces, green actions, yellow highlights, red alerts.
 * The brand colours can be changed in Admin → Settings → Branding; the apps load them at launch
 * (see lib/brand.tsx) and fall back to these defaults offline.
 */
const light = {
    bg: '#FFFFFF',
    canvas: '#F7F7F5',
    surface: '#FFFFFF',
    subtle: '#F4F4F2',
    ink: '#222222',
    muted: '#6B6B6B',
    faint: '#A6A6A6',
    border: '#ECECEA',
    brand: '#17C74A',       // fills: buttons, toggles, active states
    brandText: '#108B34',   // green text on white (readable)
    brandSoft: '#E3F8E9',
    onBrand: '#111111',
    gold: '#FDE500',        // yellow fills
    goldText: '#8B7E00',
    goldSoft: '#FFFBD9',
    red: '#DF302D',
    redSoft: '#FCEAEA',
    inverse: '#222222',
    onInverse: '#FFFFFF',
    /** Secondary text, input fill and green accent on inverse surfaces (basket bar, wallet card…). */
    onInverseMuted: 'rgba(255,255,255,0.68)',
    onInverseFaint: 'rgba(255,255,255,0.4)',
    onInverseFill: 'rgba(255,255,255,0.12)',
    onInverseAccent: '#17C74A',
};

const dark: typeof light = {
    bg: '#111111',
    canvas: '#111111',
    surface: '#1A1A1A',
    subtle: '#232323',
    ink: '#F2F2F2',
    muted: '#A0A0A0',
    faint: '#666666',
    border: '#2C2C2C',
    brand: '#17C74A',
    brandText: '#3DDC6B',
    brandSoft: '#0F2E18',
    onBrand: '#111111',
    gold: '#FDE500',
    goldText: '#FDE500',
    goldSoft: '#2E2A05',
    red: '#EF4A47',
    redSoft: '#2E1414',
    inverse: '#F2F2F2',
    onInverse: '#111111',
    onInverseMuted: 'rgba(17,17,17,0.62)',
    onInverseFaint: 'rgba(17,17,17,0.4)',
    onInverseFill: 'rgba(17,17,17,0.07)',
    onInverseAccent: '#108B34',
};

export type Theme = typeof light;

// Remote brand overrides (from /api/config), applied to both schemes.
let overrides: Partial<Theme> = {};
const listeners = new Set<() => void>();
export function setBrandColors(next: Partial<Theme>) {
    overrides = next;
    listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

export function useTheme(): Theme {
    const o = useSyncExternalStore(subscribe, () => overrides);
    const base = useColorScheme() === 'dark' ? dark : light;
    return { ...base, ...o };
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, full: 999 };
export const space = (n: number) => n * 4;
export const font = {
    // Inter is the brand font; system font is used until it's bundled (see README).
    regular: undefined as string | undefined,
};

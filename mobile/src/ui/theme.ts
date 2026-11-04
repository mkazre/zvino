import { useColorScheme } from 'react-native';

/** Same tokens as the website/admin: monochrome surfaces, Zvino green for primary actions. */
const light = {
    bg: '#FFFFFF',
    canvas: '#F6F6F4',
    surface: '#FFFFFF',
    subtle: '#F1F1EF',
    ink: '#111412',
    muted: '#6B716D',
    faint: '#A4AAA6',
    border: '#E7E7E4',
    brand: '#0B6E4F',
    brandSoft: '#E8F3EE',
    gold: '#C99412',
    goldSoft: '#FDF6E3',
    red: '#C8102E',
    redSoft: '#FDECEE',
    onBrand: '#FFFFFF',
    inverse: '#111412',
    onInverse: '#FFFFFF',
};

const dark: typeof light = {
    bg: '#0C0E0D',
    canvas: '#0C0E0D',
    surface: '#141716',
    subtle: '#1F2321',
    ink: '#EEF0EF',
    muted: '#959C98',
    faint: '#5E6561',
    border: '#262A28',
    brand: '#22A27A',
    brandSoft: '#0E2A20',
    gold: '#E0B23A',
    goldSoft: '#2A2210',
    red: '#EF4459',
    redSoft: '#2C1216',
    onBrand: '#04130D',
    inverse: '#EEF0EF',
    onInverse: '#0C0E0D',
};

export type Theme = typeof light;

export function useTheme(): Theme {
    return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, full: 999 };
export const space = (n: number) => n * 4;
export const font = {
    // Inter is the brand font; system font is used until it's bundled (see README).
    regular: undefined as string | undefined,
};

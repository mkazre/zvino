import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { api } from './api';
import { VARIANT } from './config';

export type Overlay = { type: 'none' | 'solid' | 'gradient'; from: string; to: string; opacity: number; direction: 'to_top' | 'to_bottom' | 'diagonal' };
export interface Slide { image: string | null; heading: string | null; body: string | null; button_label: string | null; text_color: string; text_position: 'top' | 'middle' | 'bottom'; overlay: Overlay }
export interface Launch { version: number; background?: string; gradient_to?: string | null; tagline?: string | null; text_color?: string; show_logo?: boolean; duration_ms?: number; image?: string | null }
export interface AppContent { onboarding: { version: number; slides: Slide[] } | null; launch: Launch | null }

const KEY = `zvino.appContent.${VARIANT}`;
const SEEN = `zvino.onboardingSeen.${VARIANT}`;

/** Cached copy (instant, works offline); then refresh from the server for next launch. */
export async function loadAppContent(): Promise<AppContent> {
    const cached: AppContent | null = JSON.parse((await AsyncStorage.getItem(KEY).catch(() => null)) ?? 'null');
    const fresh = api.get<AppContent>(`/app-content?app=${VARIANT}`).then(async (c) => {
        await AsyncStorage.setItem(KEY, JSON.stringify(c)).catch(() => {});
        // Download images now so onboarding / launch show instantly next time
        const urls = [c.launch?.image, ...(c.onboarding?.slides ?? []).map((s) => s.image)].filter(Boolean) as string[];
        if (urls.length) Image.prefetch(urls).catch(() => {});
        return c;
    }).catch(() => null);
    if (cached) return cached;
    // First ever launch: wait briefly for the server
    return (await Promise.race([fresh, new Promise<null>((r) => setTimeout(() => r(null), 2500))])) ?? { onboarding: null, launch: null };
}

export async function onboardingSeenVersion(): Promise<number> {
    return Number((await AsyncStorage.getItem(SEEN).catch(() => null)) ?? 0);
}
export async function markOnboardingSeen(version: number) {
    await AsyncStorage.setItem(SEEN, String(version)).catch(() => {});
}

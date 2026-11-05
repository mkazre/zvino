import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

/**
 * Light / dark / follow-the-phone. The apps open in light mode by default; people can change it on
 * their account screen. Appearance.setColorScheme overrides useColorScheme() everywhere (and native
 * pickers/alerts), so every screen follows without extra wiring.
 */
export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'zvino.theme';

let mode: ThemeMode = 'light';
const listeners = new Set<() => void>();

function apply(next: ThemeMode) {
    mode = next;
    try {
        Appearance.setColorScheme(next === 'system' ? 'unspecified' : next);
    } catch {
        // Older runtimes without the override: fall back to the system scheme.
    }
    listeners.forEach((l) => l());
}

// Light straight away (before storage loads) so there's no dark flash on launch.
apply('light');
AsyncStorage.getItem(KEY)
    .then((v) => { if (v === 'dark' || v === 'system') apply(v); })
    .catch(() => {});

export function setThemeMode(next: ThemeMode) {
    apply(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
}

const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
};

export function useThemeMode(): [ThemeMode, (m: ThemeMode) => void] {
    return [useSyncExternalStore(subscribe, () => mode), setThemeMode];
}

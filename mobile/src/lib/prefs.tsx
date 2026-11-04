import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { API_URL } from './config';

/**
 * Data-light mode (#1) for customers on expensive bundles: small compressed images (served by the
 * API's /img resizer), no map tiles on tracking, and slower background refresh.
 */
const KEY = 'zvino.dataLight';
const Ctx = createContext<{ dataLight: boolean; setDataLight: (v: boolean) => void }>({ dataLight: false, setDataLight: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
    const [dataLight, set] = useState(false);
    useEffect(() => { AsyncStorage.getItem(KEY).then((v) => set(v === '1')).catch(() => {}); }, []);
    const setDataLight = useCallback((v: boolean) => { set(v); AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {}); }, []);
    return <Ctx.Provider value={{ dataLight, setDataLight }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);

/** Absolute, resized image URL for a /storage/… path (full URLs pass through). */
export function useImg() {
    const { dataLight } = usePrefs();
    return (path: string | null | undefined, width = 640) => {
        if (!path) return null;
        if (/^https?:/.test(path)) return path;
        const rel = path.replace(/^\/?storage\//, '');
        return `${API_URL}/img/${dataLight ? Math.min(width, 320) : width}/${rel}`;
    };
}

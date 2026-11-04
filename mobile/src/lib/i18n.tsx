import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session';

/**
 * English / chiShona / isiNdebele. The phrasebook lives on the server (api/lang/*.json) so it can be
 * corrected without an app release; it is cached on the device for offline use. Keys are the English
 * text, so anything untranslated stays English.
 */
const KEY = 'zvino.locale';
const DICT_KEY = (l: string) => `zvino.i18n.${l}`;

export const LANGUAGES: Record<string, string> = { en: 'English', sn: 'chiShona', nd: 'isiNdebele' };

interface I18n {
    locale: string;
    setLocale: (l: string) => Promise<void>;
    t: (text: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n>({ locale: 'en', setLocale: async () => {}, t: (s) => s });

export function I18nProvider({ children }: { children: ReactNode }) {
    const { me, refresh } = useSession();
    const [locale, setLocaleState] = useState('en');
    const [strings, setStrings] = useState<Record<string, string>>({});

    // Signed-in users carry their language across devices; otherwise use the device choice.
    useEffect(() => {
        if (me?.locale) setLocaleState(me.locale);
        else AsyncStorage.getItem(KEY).then((l) => l && setLocaleState(l)).catch(() => {});
    }, [me?.locale]);

    useEffect(() => {
        if (locale === 'en') return setStrings({});
        AsyncStorage.getItem(DICT_KEY(locale)).then((raw) => raw && setStrings(JSON.parse(raw))).catch(() => {});
        api.get<{ strings: Record<string, string> }>(`/i18n/${locale}`)
            .then((r) => { setStrings(r.strings); AsyncStorage.setItem(DICT_KEY(locale), JSON.stringify(r.strings)).catch(() => {}); })
            .catch(() => {});
    }, [locale]);

    const setLocale = useCallback(async (l: string) => {
        setLocaleState(l);
        await AsyncStorage.setItem(KEY, l).catch(() => {});
        if (me) {
            await api.patch('/me', { locale: l }).catch(() => {});
            await refresh();
        }
    }, [me, refresh]);

    const t = useCallback((text: string, vars?: Record<string, string | number>) => {
        let out = strings[text] ?? text;
        if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
        return out;
    }, [strings]);

    return <Ctx.Provider value={{ locale, setLocale, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;

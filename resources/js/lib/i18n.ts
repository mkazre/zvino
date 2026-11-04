import { usePage } from '@inertiajs/react';

interface I18nProps { locale: string; languages: Record<string, string>; strings: Record<string, string> }

/** Shona / Ndebele phrasebook (lang/*.json). Keys are the English text, so untranslated phrases stay English. */
export function useT() {
    const { i18n } = usePage<{ i18n?: I18nProps }>().props;
    return (text: string, vars?: Record<string, string | number>) => {
        let out = i18n?.strings?.[text] ?? text;
        if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
        return out;
    };
}

export function useLocale() {
    const { i18n } = usePage<{ i18n?: I18nProps }>().props;
    return { locale: i18n?.locale ?? 'en', languages: i18n?.languages ?? { en: 'English' } };
}

<?php

namespace App\Support;

/**
 * Shona (sn) and Ndebele (nd) phrasebook shared by push/SMS, the website and the apps.
 * Keys are the English text, so anything untranslated simply stays in English.
 */
class I18n
{
    public const LOCALES = ['en' => 'English', 'sn' => 'chiShona', 'nd' => 'isiNdebele'];

    private static array $loaded = [];

    public static function dictionary(string $locale): array
    {
        if ($locale === 'en' || ! isset(self::LOCALES[$locale])) {
            return [];
        }

        return self::$loaded[$locale] ??= collect(json_decode((string) @file_get_contents(lang_path("$locale.json")), true) ?: [])
            ->except('_meta')->all();
    }

    public static function t(string $text, ?string $locale, array $vars = []): string
    {
        $out = self::dictionary($locale ?? 'en')[$text] ?? $text;

        return strtr($out, collect($vars)->mapWithKeys(fn ($v, $k) => ['{'.$k.'}' => (string) $v])->all());
    }
}

import { LANGUAGES, useI18n } from '@/lib/i18n';
import { Card, Chip, Row, Text } from '@/ui';

/** English / chiShona / isiNdebele switcher, used on every app's account screen. */
export function LanguagePicker() {
    const { locale, setLocale, t } = useI18n();
    return (
        <Card style={{ marginTop: 16, gap: 10 }}>
            <Text variant="heading">{t('Language')}</Text>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {Object.entries(LANGUAGES).map(([code, name]) => <Chip key={code} label={name} active={locale === code} onPress={() => setLocale(code)} />)}
            </Row>
        </Card>
    );
}

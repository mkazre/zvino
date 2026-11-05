import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';
import { type ThemeMode, useThemeMode } from '@/lib/appearance';
import { useI18n } from '@/lib/i18n';
import { Card, Text, useTheme } from '@/ui';

const OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { value: 'light', label: 'Light', icon: 'sunny-outline' },
    { value: 'dark', label: 'Dark', icon: 'moon-outline' },
    { value: 'system', label: 'Phone setting', icon: 'phone-portrait-outline' },
];

/** Light / Dark / Phone setting, shown on every app's account screen. */
export function ThemePicker() {
    const t = useTheme();
    const { t: tr } = useI18n();
    const [mode, setMode] = useThemeMode();
    return (
        <Card style={{ marginTop: 16, gap: 10 }}>
            <Text variant="heading">{tr('Appearance')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {OPTIONS.map((o) => {
                    const active = mode === o.value;
                    return (
                        <Pressable
                            key={o.value}
                            onPress={() => setMode(o.value)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: active ? 2 : 1, borderColor: active ? t.brand : t.border, backgroundColor: active ? t.brandSoft : t.surface }}
                        >
                            <Ionicons name={o.icon} size={22} color={active ? t.brandText : t.ink} />
                            <Text variant="caption" style={{ color: active ? t.brandText : t.ink, fontWeight: '600', textAlign: 'center' }}>{tr(o.label)}</Text>
                        </Pressable>
                    );
                })}
            </View>
        </Card>
    );
}

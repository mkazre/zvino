import { View } from 'react-native';
import { type Safety } from '@/features/driver';
import { useT } from '@/lib/i18n';
import { Text } from '@/ui';

/** Night safety zone warning on driver offers and jobs. */
export function SafetyBanner({ s }: { s: Safety }) {
    const tr = useT();
    return (
        <View style={{ backgroundColor: '#fdecee', borderRadius: 12, padding: 12, gap: 2 }}>
            <Text variant="label" style={{ color: '#a00d25' }}>{tr('Safety warning')}: {s.zone}</Text>
            <Text variant="caption" style={{ color: '#7a0a1c' }}>{s.note || tr('This drop-off is in a night safety zone. Stay alert and keep the app open.')}</Text>
        </View>
    );
}

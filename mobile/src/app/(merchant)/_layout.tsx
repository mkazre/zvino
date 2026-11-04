import { Stack } from 'expo-router';
import { useTheme } from '@/ui';

export default function MerchantLayout() {
    const t = useTheme();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="promos" />
        </Stack>
    );
}

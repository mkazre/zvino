import { Stack } from 'expo-router';
import { useTheme } from '@/ui';

export default function DriverLayout() {
    const t = useTheme();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="driver-apply" />
            <Stack.Screen name="job/[id]" />
            <Stack.Screen name="shop/[id]" />
        </Stack>
    );
}

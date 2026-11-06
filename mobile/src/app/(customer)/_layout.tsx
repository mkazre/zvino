import { Stack } from 'expo-router';
import { useTheme } from '@/ui';
import { useOrderAlerts } from '@/features/order-alerts';

export default function CustomerLayout() {
    const t = useTheme();
    useOrderAlerts();
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="store/[id]" />
            <Stack.Screen name="cart" options={{ presentation: 'modal' }} />
            <Stack.Screen name="checkout" />
            <Stack.Screen name="order/[id]" />
            <Stack.Screen name="addresses" />
            <Stack.Screen name="wallet" />
            <Stack.Screen name="plans" />
            <Stack.Screen name="catering" />
            <Stack.Screen name="hampers" />
        </Stack>
    );
}

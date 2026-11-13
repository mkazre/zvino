import { Stack } from 'expo-router';
import { View } from 'react-native';
import { OfferCenter } from '@/features/offer-popup';
import { useTheme } from '@/ui';

export default function DriverLayout() {
    const t = useTheme();
    // Job offers pop up over every driver screen, so busy drivers can stack jobs while shopping or delivering.
    return (
        <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="driver-apply" />
            <Stack.Screen name="job/[id]" />
            <Stack.Screen name="shop/[id]" />
        </Stack>
        <OfferCenter />
        </View>
    );
}

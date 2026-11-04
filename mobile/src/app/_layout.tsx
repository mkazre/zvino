import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '@/lib/cart';
import { VARIANT } from '@/lib/config';
import { SessionProvider, useSession } from '@/lib/session';
import { Loading, useTheme } from '@/ui';

/**
 * Root navigator for all three apps. Stack.Protected keeps each build to its own screens:
 * the customer app can browse signed-out, driver & merchant apps require sign-in.
 */
function RootNavigator() {
    const { ready, me } = useSession();
    const t = useTheme();
    if (!ready) return <Loading />;

    const signedIn = !!me;
    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="index" />

            <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="sign-in" />
                <Stack.Screen name="verify" />
                <Stack.Screen name="staff-login" />
            </Stack.Protected>

            <Stack.Protected guard={VARIANT === 'customer'}>
                <Stack.Screen name="(customer)" />
            </Stack.Protected>

            <Stack.Protected guard={VARIANT === 'driver' && signedIn} redirectTo="/sign-in">
                <Stack.Screen name="(driver)" />
            </Stack.Protected>

            <Stack.Protected guard={VARIANT === 'merchant' && signedIn} redirectTo="/staff-login">
                <Stack.Screen name="(merchant)" />
            </Stack.Protected>
        </Stack>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <SessionProvider>
                    <CartProvider>
                        <StatusBar style="auto" />
                        <RootNavigator />
                    </CartProvider>
                </SessionProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

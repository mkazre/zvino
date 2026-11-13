import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { CartProvider } from '@/lib/cart';
import { VARIANT } from '@/lib/config';
import { I18nProvider } from '@/lib/i18n';
import { PrefsProvider } from '@/lib/prefs';
import { LocationProvider } from '@/lib/location';
import { SessionProvider, useSession } from '@/lib/session';
import { Loading, useTheme } from '@/ui';
import { SENTRY_ENABLED, Sentry } from '@/lib/sentry';
import { useLoadBrand } from '@/lib/brand';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Startup } from '@/features/startup';
import { OfflineBanner } from '@/features/offline-banner';
import { openLink } from '@/lib/links';
import '@/lib/appearance'; // light mode by default; applies the saved Light/Dark choice
import '@/features/driver-background'; // registers the background GPS task
import { DeviceInsetsProvider } from '@/lib/insets';

/**
 * Root navigator for all three apps. Stack.Protected keeps each build to its own screens:
 * the customer app can browse signed-out, driver & merchant apps require sign-in.
 */
function RootNavigator() {
    const { ready, me } = useSession();
    useLoadBrand();
    // Tapping a push notification: open the store / promo / page / order it points to.
    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener((r) => {
            const data = r.notification.request.content.data as Record<string, unknown>;
            openLink(data?.link_to as string | undefined, data);
        });
        return () => sub.remove();
    }, []);
    const t = useTheme();
    const insets = useSafeAreaInsets();
    if (!ready) return <Loading />;

    const signedIn = !!me;
    // Android draws apps edge-to-edge: keep every screen (tab bar, basket bar, last cards) above the
    // system navigation bar. Screens below see no bottom inset, so nothing is padded twice.
    return (
        <DeviceInsetsProvider value={insets}>
        <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: t.bg }}>
        <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
            <Stack.Screen name="index" />

            <Stack.Protected guard={signedIn}>
                <Stack.Screen name="inbox" />
            </Stack.Protected>

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
        </SafeAreaInsetsContext.Provider>
        </View>
        </DeviceInsetsProvider>
    );
}

function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <SessionProvider>
                    <I18nProvider>
                        <PrefsProvider>
                        <LocationProvider>
                            <CartProvider>
                                <StatusBar style="auto" />
                                <Startup>
                                    <RootNavigator />
                                </Startup>
                                <OfflineBanner />
                            </CartProvider>
                        </LocationProvider>
                        </PrefsProvider>
                    </I18nProvider>
                </SessionProvider>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}

export default SENTRY_ENABLED ? Sentry.wrap(RootLayout) : RootLayout;

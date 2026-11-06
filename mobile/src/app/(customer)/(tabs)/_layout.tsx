import { Tabs } from 'expo-router';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';
import { useT } from '@/lib/i18n';

/** Restaurants · Shops · Search · Orders · Profile */
export default function CustomerTabs() {
    const tr = useT();
    const t = useTheme();
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.brandText, tabBarInactiveTintColor: t.muted, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border, height: 64, paddingBottom: 8, paddingTop: 6 }, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 } }}>
            <Tabs.Screen name="home" options={{ title: tr('Restaurants'), tabBarIcon: tabIcon('fast-food') }} />
            <Tabs.Screen name="shops" options={{ title: tr('Shops'), tabBarIcon: tabIcon('storefront') }} />
            <Tabs.Screen name="search" options={{ title: tr('Search'), tabBarIcon: tabIcon('search') }} />
            <Tabs.Screen name="orders" options={{ title: tr('Orders'), tabBarIcon: tabIcon('receipt') }} />
            <Tabs.Screen name="account" options={{ title: tr('Profile'), tabBarIcon: tabIcon('person') }} />
        </Tabs>
    );
}

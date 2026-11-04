import { Tabs } from 'expo-router';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';
import { useT } from '@/lib/i18n';

export default function CustomerTabs() {
    const tr = useT();
    const t = useTheme();
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.faint, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
            <Tabs.Screen name="home" options={{ title: tr('Home'), tabBarIcon: tabIcon('home') }} />
            <Tabs.Screen name="search" options={{ title: tr('Search'), tabBarIcon: tabIcon('search') }} />
            <Tabs.Screen name="orders" options={{ title: tr('Orders'), tabBarIcon: tabIcon('receipt') }} />
            <Tabs.Screen name="account" options={{ title: tr('Account'), tabBarIcon: tabIcon('person') }} />
        </Tabs>
    );
}

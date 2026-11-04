import { Tabs } from 'expo-router';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';

export default function CustomerTabs() {
    const t = useTheme();
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.faint, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
            <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
            <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('search') }} />
            <Tabs.Screen name="orders" options={{ title: 'Orders', tabBarIcon: tabIcon('receipt') }} />
            <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tabIcon('person') }} />
        </Tabs>
    );
}

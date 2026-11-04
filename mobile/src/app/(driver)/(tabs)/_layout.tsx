import { Tabs } from 'expo-router';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';

export default function DriverTabs() {
    const t = useTheme();
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.faint, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
            <Tabs.Screen name="shift" options={{ title: 'Drive', tabBarIcon: tabIcon('bicycle') }} />
            <Tabs.Screen name="earnings" options={{ title: 'Earnings', tabBarIcon: tabIcon('wallet') }} />
            <Tabs.Screen name="driver-account" options={{ title: 'Account', tabBarIcon: tabIcon('person') }} />
        </Tabs>
    );
}

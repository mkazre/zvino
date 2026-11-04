import { Tabs } from 'expo-router';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';
import { useT } from '@/lib/i18n';

export default function DriverTabs() {
    const tr = useT();
    const t = useTheme();
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.faint, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
            <Tabs.Screen name="shift" options={{ title: tr('Drive'), tabBarIcon: tabIcon('bicycle') }} />
            <Tabs.Screen name="earnings" options={{ title: tr('Earnings'), tabBarIcon: tabIcon('wallet') }} />
            <Tabs.Screen name="driver-account" options={{ title: tr('Account'), tabBarIcon: tabIcon('person') }} />
        </Tabs>
    );
}

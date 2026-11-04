import { Tabs } from 'expo-router';
import { useSession } from '@/lib/session';
import { useTheme } from '@/ui';
import { tabIcon } from '@/ui/tab-icon';

/** Tabs follow the staff role: manager sees everything, cashier gets POS, kitchen gets the board. */
export default function MerchantTabs() {
    const t = useTheme();
    const { me } = useSession();
    const role = me?.role;
    const manager = role === 'vendor_manager';
    return (
        <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: t.ink, tabBarInactiveTintColor: t.faint, tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.border }, tabBarLabelStyle: { fontWeight: '600', fontSize: 11 } }}>
            <Tabs.Screen name="board" options={{ title: role === 'kitchen' ? 'Kitchen' : 'Orders', tabBarIcon: tabIcon(role === 'kitchen' ? 'restaurant' : 'receipt'), href: role === 'cashier' ? null : undefined }} />
            <Tabs.Screen name="pos" options={{ title: 'POS', tabBarIcon: tabIcon('calculator'), href: manager || role === 'cashier' ? undefined : null }} />
            <Tabs.Screen name="menu" options={{ title: 'Menu', tabBarIcon: tabIcon('fast-food'), href: manager ? undefined : null }} />
            <Tabs.Screen name="store" options={{ title: 'Store', tabBarIcon: tabIcon('storefront'), href: manager ? undefined : null }} />
            <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('ellipsis-horizontal-circle') }} />
        </Tabs>
    );
}

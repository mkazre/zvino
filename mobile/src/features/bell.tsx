import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Text, useTheme } from '@/ui';

/** Bell with unread count; opens the notifications inbox. */
export function Bell() {
    const t = useTheme();
    const { me } = useSession();
    const [n, setN] = useState(0);
    useFocusEffect(useCallback(() => { if (me) api.get<{ count: number }>('/notifications/unread').then((r) => setN(r.count)).catch(() => {}); }, [me]));
    if (!me) return null;
    return (
        <Pressable onPress={() => router.push('/inbox')} hitSlop={10} accessibilityLabel={`Notifications, ${n} unread`} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.subtle, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="notifications-outline" size={20} color={t.ink} />
            {n > 0 && <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: t.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{n > 99 ? '99+' : n}</Text></View>}
        </Pressable>
    );
}

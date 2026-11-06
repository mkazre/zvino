import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { api } from '@/lib/api';
import { pushState } from '@/lib/push';
import { useSession } from '@/lib/session';

const LAST = 'zvino.alerts.last';
type Note = { id: number; type: string; title: string; body: string; data: { order_id?: number } | null };

/**
 * Safety net for order updates while the app is open: if this phone has no working push token yet
 * (e.g. Firebase isn't set up for Android builds), check for new order notifications every 20 s
 * and show them as a local notification with sound (the same banner a push would show).
 */
export function useOrderAlerts() {
    const { me } = useSession();
    useEffect(() => {
        if (!me) return;
        let last = 0;
        const tick = async () => {
            if (pushState.ready || AppState.currentState !== 'active') return;
            try {
                const r = await api.get<{ data: Note[] }>('/notifications');
                const newest = r.data.reduce((m, n) => Math.max(m, n.id), 0);
                if (!last) {
                    last = Math.max(Number((await AsyncStorage.getItem(LAST)) ?? 0), newest);
                } else {
                    for (const n of r.data.filter((x) => x.id > last && x.type === 'order_status').sort((a, b) => a.id - b.id)) {
                        await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body, sound: true, data: { order_id: n.data?.order_id } }, trigger: null });
                    }
                    last = Math.max(last, newest);
                }
                AsyncStorage.setItem(LAST, String(last)).catch(() => {});
            } catch {
                /* offline */
            }
        };
        tick();
        const timer = setInterval(tick, 20000);
        return () => clearInterval(timer);
    }, [me]);
}

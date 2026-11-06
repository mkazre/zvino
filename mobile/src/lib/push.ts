import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

// Show notifications while the app is open (order updates, job offers).
Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Ask permission, get an Expo push token and give it to the API (POST /api/devices).
 * Needs a development or store build: Expo Go can't receive remote push on Android.
 */
/** True once this phone has a working push token (then the in-app fallback stays quiet). */
export const pushState = { ready: false };

export async function registerForPush(): Promise<string | null> {
    if (!Device.isDevice) return null;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('orders', { name: 'Orders & deliveries', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#0B6E4F' });
        await Notifications.setNotificationChannelAsync('marketing', { name: 'Deals & offers', importance: Notifications.AndroidImportance.DEFAULT });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null; // set EAS_PROJECT_ID once the EAS project exists

    try {
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
        await api.post('/devices', { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
        pushState.ready = true;
        return data;
    } catch {
        return null; // offline: retried on next launch
    }
}

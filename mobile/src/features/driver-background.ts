import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, auth } from '@/lib/api';

/**
 * Background GPS for the Driver app: keeps sharing location while the phone is locked or the driver
 * is in Google Maps. Android shows a persistent "Zvino Driver is online" notification (required by the OS).
 * The task is defined at import time (root layout) so the OS can wake it.
 */
export const LOCATION_TASK = 'zvino-driver-location';

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data as { locations: Location.LocationObject[] };
    const p = locations[locations.length - 1];
    if (!p) return;
    if (!auth.get()) await auth.load(); // the app may have been woken from the background
    await api.background('POST', '/driver/location', { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading ?? null });
});

/** Start background sharing if the driver allows "always"; returns false to fall back to foreground-only. */
export async function startBackgroundLocation(intervalSeconds = 15): Promise<boolean> {
    try {
        const fg = await Location.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') return false;
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status !== 'granted') return false;
        if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return true;
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
            accuracy: Location.Accuracy.High,
            timeInterval: intervalSeconds * 1000,
            distanceInterval: 30,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
            activityType: Location.ActivityType.AutomotiveNavigation,
            foregroundService: { notificationTitle: 'Zvino Driver is online', notificationBody: 'Sharing your location for deliveries. Go offline to stop.', notificationColor: '#0B6E4F' },
        });
        return true;
    } catch {
        return false;
    }
}

export async function stopBackgroundLocation() {
    try {
        if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    } catch {
        // not running
    }
}

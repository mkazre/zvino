import * as Location from 'expo-location';
import { useEffect, useRef } from 'react';
import { type Money, api } from '@/lib/api';
import { startBackgroundLocation, stopBackgroundLocation } from './driver-background';

export interface DriverMe {
    id: number;
    status: 'applied' | 'approved' | 'suspended' | 'rejected';
    vehicle_type: string;
    vehicle_plate: string | null;
    is_online: boolean;
    rating: number;
    completed_deliveries: number;
    acceptance_rate: number;
    name: string;
    documents: { id: number; type: string; status: string; note: string | null }[];
    required_documents: string[];
    balance: Money;
    cash_held: Money;
    today: Money;
    location_interval_seconds: number;
    tier: string;
    preferences: { avoid_night_zones: boolean; daily_goal_zig: number | null; weekly_goal_zig: number | null };
    night_zones_enabled: boolean;
}

export interface Safety { zone: string; note: string | null; until: string }
export interface HeatCell { lat: number; lng: number; intensity: number; orders_last_hour: number; label: string; km: number | null }

export interface Offer {
    id: number;
    seconds_left: number;
    pay: Money;
    tip: Money;
    pickup_km: number | null;
    dropoff_km: number | null;
    payment_method: string;
    collect_cash: Money | null;
    store: { name: string; address: string | null; lat: number; lng: number };
    dropoff_area: string | null;
    items_count: number;
    safety: Safety | null;
}

export interface Job {
    id: number;
    reference: string;
    status: string;
    store: { name: string; phone: string | null; address: string | null; lat: number; lng: number };
    customer: { name: string | null; phone: string | null };
    dropoff: { line1: string; landmark: string | null; suburb: string | null; city: string; lat: number | null; lng: number | null; instructions: string | null; voice_note_path?: string | null; gate_photo_path?: string | null } | null;
    dropoff_type: 'hand_to_me' | 'leave_at_door';
    requires_pin: boolean;
    collect_cash: Money | null;
    items: { name: string; quantity: number }[];
    pay: Money;
    notes: string | null;
    safety: Safety | null;
}

/**
 * While online, share GPS with the API every few seconds (foreground). The API moves the
 * pin on the customer's map, marks "arriving" near the gate and finds nearby jobs.
 */
export function useLocationSharing(enabled: boolean, intervalSeconds = 10) {
    const sub = useRef<Location.LocationSubscription | null>(null);
    useEffect(() => {
        if (!enabled) {
            stopBackgroundLocation();
            return;
        }
        let cancelled = false;
        (async () => {
            // Prefer background sharing (works with the screen off); fall back to foreground watching.
            if (await startBackgroundLocation(intervalSeconds)) return;
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted' || cancelled) return;
            sub.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: intervalSeconds * 1000, distanceInterval: 25 },
                (p) => {
                    api.background('POST', '/driver/location', { lat: p.coords.latitude, lng: p.coords.longitude, heading: p.coords.heading ?? null });
                },
            );
        })();
        return () => {
            cancelled = true;
            sub.current?.remove();
            sub.current = null;
        };
    }, [enabled, intervalSeconds]);
}

export async function currentPosition() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Location permission is needed to go online.');
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
}

/** Hand off turn-by-turn navigation to Google Maps / Apple Maps. */
export const navigateUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

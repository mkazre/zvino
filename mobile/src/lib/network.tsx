import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Online/offline state for the whole app. When the connection comes back:
 *   - queued background requests (location pings, "mark as read", etc.) are resent
 *   - screens subscribed with useOnReconnect() refresh themselves
 * Orders and payments are never resent automatically (no double charges); people tap again.
 */
let online = true;
const listeners = new Set<() => void>();
const reconnectHandlers = new Set<() => void>();
const QUEUE_KEY = 'zvino.retryQueue';
type Queued = { method: string; path: string; body?: Record<string, unknown>; at: number };
let flushing = false;
let sender: ((q: Queued) => Promise<unknown>) | null = null;

export function setQueueSender(fn: (q: Queued) => Promise<unknown>) {
    sender = fn;
}

NetInfo.addEventListener((s) => {
    const next = s.isConnected !== false && s.isInternetReachable !== false;
    if (next === online) return;
    online = next;
    listeners.forEach((l) => l());
    if (online) {
        flushQueue();
        reconnectHandlers.forEach((h) => h());
    }
});

export const isOnline = () => online;

export function useOnline(): boolean {
    return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => online);
}

/** Refresh a screen when the connection comes back. */
export function useOnReconnect(fn: () => void) {
    const ref = useRef(fn);
    ref.current = fn;
    useEffect(() => {
        const h = () => ref.current();
        reconnectHandlers.add(h);
        return () => { reconnectHandlers.delete(h); };
    }, []);
}

export async function enqueue(q: Omit<Queued, 'at'>) {
    const list: Queued[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY).catch(() => null)) ?? '[]');
    list.push({ ...q, at: Date.now() });
    // keep the last 50, drop anything older than a day
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(list.filter((x) => Date.now() - x.at < 864e5).slice(-50))).catch(() => {});
}

export async function flushQueue() {
    if (flushing || !sender) return;
    flushing = true;
    try {
        const list: Queued[] = JSON.parse((await AsyncStorage.getItem(QUEUE_KEY).catch(() => null)) ?? '[]');
        const left: Queued[] = [];
        for (const q of list) {
            try {
                await sender(q);
            } catch (e) {
                if ((e as { status?: number }).status === 0) left.push(q); // still offline
            }
        }
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(left)).catch(() => {});
    } finally {
        flushing = false;
    }
}

/** Slide-in banner while offline (mounted once at the root). */
export function useOfflineBanner() {
    const on = useOnline();
    const [visible, setVisible] = useState(!on);
    useEffect(() => {
        if (!on) setVisible(true);
        else {
            const t = setTimeout(() => setVisible(false), 1800); // show "Back online" briefly
            return () => clearTimeout(t);
        }
    }, [on]);
    return { online: on, visible };
}

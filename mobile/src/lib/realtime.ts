import Pusher, { type Channel } from 'pusher-js/react-native';
import { useEffect, useRef } from 'react';
import { api, auth } from './api';
import { API_URL } from './config';

/**
 * Live updates over Pusher (order status, driver location, job offers, new store orders).
 * Off until the server has PUSHER_* keys; screens keep polling as a fallback either way.
 */
let client: Pusher | null = null;
let loading: Promise<Pusher | null> | null = null;

async function connect(): Promise<Pusher | null> {
    if (client) return client;
    loading ??= api.get<{ pusher: { key: string | null; cluster: string | null } }>('/config')
        .then(({ pusher }) => {
            if (!pusher?.key) return null;
            client = new Pusher(pusher.key, {
                cluster: pusher.cluster ?? 'mt1',
                forceTLS: true,
                channelAuthorization: {
                    endpoint: `${API_URL}/api/broadcasting/auth`,
                    transport: 'ajax',
                    headersProvider: () => ({ Authorization: `Bearer ${auth.get() ?? ''}`, Accept: 'application/json' }),
                },
            });
            return client;
        })
        .catch(() => null)
        .finally(() => { loading = null; });
    return loading;
}

export function disconnectRealtime() {
    client?.disconnect();
    client = null;
}

/** Subscribe to a private channel event while the screen is mounted. */
export function useChannel<T = unknown>(channel: string | null, event: string, handler: (data: T) => void) {
    const ref = useRef(handler);
    ref.current = handler;
    useEffect(() => {
        if (!channel) return;
        let ch: Channel | null = null;
        let cancelled = false;
        const cb = (d: T) => ref.current(d);
        connect().then((p) => {
            if (!p || cancelled) return;
            ch = p.subscribe(`private-${channel}`);
            ch.bind(event, cb);
        });
        return () => {
            cancelled = true;
            ch?.unbind(event, cb);
            if (ch) client?.unsubscribe(ch.name);
        };
    }, [channel, event]);
}

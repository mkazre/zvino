import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { useEffect } from 'react';

let echo: Echo<'pusher'> | null = null;

function getEcho(key: string, cluster: string) {
    if (!echo) {
        (window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher;
        const csrf = document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1];
        echo = new Echo({
            broadcaster: 'pusher',
            key,
            cluster,
            forceTLS: true,
            authEndpoint: '/broadcasting/auth',
            auth: { headers: { 'X-XSRF-TOKEN': csrf ? decodeURIComponent(csrf) : '' } },
        });
    }
    return echo;
}

/**
 * Reloads the given Inertia props when an order for this vendor changes.
 * Uses Pusher when keys are configured; otherwise falls back to polling
 * so the kitchen display and dashboard still work on plain shared hosting.
 */
export function useLiveOrders(vendorId: number | null | undefined, only: string[], pollMs = 15000) {
    const { pusher } = usePage<SharedData>().props;

    useEffect(() => {
        const reload = () => router.reload({ only });

        if (pusher.key && pusher.cluster && vendorId) {
            const channel = getEcho(pusher.key, pusher.cluster).private(`vendor.${vendorId}.orders`);
            channel.listen('.order.updated', reload);
            // Slow safety-net poll in case a socket message is missed.
            const t = setInterval(reload, 60000);
            return () => {
                channel.stopListening('.order.updated');
                clearInterval(t);
            };
        }

        const t = setInterval(reload, pollMs);
        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vendorId, pusher.key]);
}

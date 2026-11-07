import { useCart } from '@/lib/cart';
import { cn } from '@/lib/utils';
import { Link, router, usePage } from '@inertiajs/react';
import { Bike, ChevronRight, Navigation, Store } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface ActiveOrder {
    id: number;
    reference: string;
    status: string;
    label: string;
    store: string | null;
    logo: string | null;
    eta: string | null;
    live: boolean;
    more: number;
}

function minutesLeft(eta: string | null): number | null {
    if (!eta) return null;
    const m = Math.round((new Date(eta).getTime() - Date.now()) / 60000);
    return m > 0 ? m : null;
}

/**
 * Floating "your order" button, on every page while an order is on its way (not on that order's own
 * page). Tapping it opens the tracking page.
 */
export function ActiveOrderButton() {
    const { activeOrder: o } = usePage<{ activeOrder: ActiveOrder | null }>().props;
    const { count } = useCart();
    const [, tick] = useState(0);
    const here = typeof window !== 'undefined' ? window.location.pathname : '';

    // Keep the label fresh: order alerts trigger a refresh, plus a gentle poll and a minute timer.
    useEffect(() => {
        if (!o) return;
        const reload = () => router.reload({ only: ['activeOrder'] });
        const onAlert = () => reload();
        window.addEventListener('zvino:order-update', onAlert);
        const poll = setInterval(reload, 60000);
        const clock = setInterval(() => tick((n) => n + 1), 30000);
        return () => { window.removeEventListener('zvino:order-update', onAlert); clearInterval(poll); clearInterval(clock); };
    }, [o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!o || here === `/orders/${o.id}` || here.startsWith('/checkout')) return null;
    const mins = minutesLeft(o.eta);

    return (
        <Link
            href={o.live ? `/orders/${o.id}?live=1` : `/orders/${o.id}`}
            aria-label={`Track order #${o.reference}: ${o.label}`}
            className={cn(
                'group fixed right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full bg-[#1c1c1c] py-2 pr-4 pl-2 text-white shadow-[0_10px_40px_-8px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-black md:right-6 md:bottom-6',
                'animate-in fade-in slide-in-from-bottom-4 duration-300',
                count ? 'bottom-[88px] md:bottom-6' : 'bottom-4',
            )}
        >
            <span className="relative flex size-11 shrink-0 items-center justify-center">
                <span className="bg-brand/50 absolute inset-0 animate-ping rounded-full [animation-duration:2.2s]" />
                <span className="bg-brand relative flex size-11 items-center justify-center overflow-hidden rounded-full ring-2 ring-[#1c1c1c]">
                    {o.logo ? <img src={o.logo} alt="" className="size-full object-cover" /> : o.live ? <Bike className="size-5 text-black" /> : <Store className="size-5 text-black" />}
                </span>
                {o.live && <span className="bg-brand absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full ring-2 ring-[#1c1c1c]"><Navigation className="size-2.5 fill-black text-black" /></span>}
            </span>
            <span className="min-w-0 leading-tight">
                <span className="block truncate text-[15px] font-bold">{o.label}{mins !== null && <span className="text-brand"> · {mins} min</span>}</span>
                <span className="block truncate text-[12.5px] text-white/65">
                    {o.live ? 'Tap to watch your driver live' : `${o.store ?? 'Your order'} · #${o.reference}`}
                    {o.more > 0 && ` · +${o.more} more`}
                </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white" />
        </Link>
    );
}

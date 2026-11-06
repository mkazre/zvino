import { Button } from '@/components/ui/button';
import { router } from '@inertiajs/react';
import { BellRing, Check, ExternalLink, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface Alert { id: number; type: string; title: string; body: string; data: { url?: string; order_id?: number; alarm?: boolean } | null; created_at: string }

const SOUND = 'zvino.admin.sound';
export const soundOn = () => { try { return localStorage.getItem(SOUND) !== 'off'; } catch { return true; } };
export const setSoundOn = (on: boolean) => { try { localStorage.setItem(SOUND, on ? 'on' : 'off'); } catch { /* ignore */ } };

// One audio context for the page. Browsers start it "suspended" until someone clicks; we resume on any click.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
    try {
        ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        return ctx;
    } catch {
        return null;
    }
}
function tone(notes: [number, number, number][], volume = 0.3) {
    const c = audio();
    if (!c || !soundOn()) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    for (const [freq, at, len] of notes) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'triangle';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, c.currentTime + at);
        g.gain.exponentialRampToValueAtTime(volume, c.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + len);
        o.connect(g).connect(c.destination);
        o.start(c.currentTime + at);
        o.stop(c.currentTime + at + len + 0.05);
    }
}
/** Soft two-note chime for normal alerts. */
export const chime = () => tone([[880, 0, 0.3], [1320, 0.15, 0.4]], 0.2);
/** New-order bell: three rising notes, repeated until acknowledged. */
const ring = () => tone([[784, 0, 0.25], [988, 0.18, 0.25], [1319, 0.36, 0.5], [784, 0.9, 0.25], [988, 1.08, 0.25], [1319, 1.26, 0.5]], 0.35);

/**
 * Admin panel + kitchen alerts: every staff member's bell notifications arrive here (polled every
 * 8 s). New orders open a pop-up that rings until someone acknowledges it (or the store accepts /
 * declines the order). Other alerts show a toast and a soft chime.
 */
export function StaffAlerts() {
    const last = useRef<number | null>(null);
    const [ringing, setRinging] = useState<Alert[]>([]);
    const [locked, setLocked] = useState(false);

    const poll = useCallback(async () => {
        try {
            const r = await fetch(`/admin/alerts${last.current !== null ? `?after=${last.current}` : ''}`, { headers: { Accept: 'application/json' } });
            if (!r.ok) return;
            const d: { latest_id: number; items: Alert[]; ringing: Alert[] } = await r.json();
            if (last.current !== null && d.items.length) {
                for (const n of d.items) {
                    if (n.type === 'new_order') continue; // shown in the pop-up below
                    chime();
                    toast(n.title, { description: n.body, duration: 8000, action: n.data?.url ? { label: 'Open', onClick: () => router.visit(n.data!.url!) } : undefined });
                    systemNotify(n);
                }
                d.items.filter((n) => n.type === 'new_order').forEach(systemNotify);
                router.reload({ only: ['notifications', 'badges'] });
            }
            last.current = d.latest_id;
            setRinging(d.ringing ?? []);
        } catch {
            /* offline: next tick */
        }
    }, []);

    useEffect(() => {
        poll();
        const t = setInterval(poll, 8000);
        const unlock = () => { audio()?.resume().catch(() => {}); setLocked(false); };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        return () => { clearInterval(t); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
    }, [poll]);

    // Ring every 4 s while there's an unacknowledged new order.
    useEffect(() => {
        if (!ringing.length) return;
        const go = () => { ring(); setLocked(audio()?.state === 'suspended'); };
        go();
        const t = setInterval(go, 4000);
        return () => clearInterval(t);
    }, [ringing.length]);

    const ack = async (n: Alert, open = false) => {
        setRinging((r) => r.filter((x) => x.id !== n.id));
        const token = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1] ?? '');
        await fetch(`/admin/alerts/${n.id}/ack`, { method: 'POST', headers: { Accept: 'application/json', 'X-XSRF-TOKEN': token, 'X-Requested-With': 'XMLHttpRequest' } }).catch(() => {});
        router.reload({ only: ['notifications', 'badges'] });
        if (open && n.data?.url) router.visit(n.data.url);
    };

    if (!ringing.length) return null;
    const n = ringing[0];
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="alertdialog" aria-labelledby="new-order-title">
            <div className="bg-surface w-full max-w-md animate-[pulse_2s_ease-in-out_1] rounded-3xl border p-6 shadow-2xl">
                <div className="flex items-center gap-3">
                    <span className="bg-brand flex size-14 items-center justify-center rounded-2xl text-black"><BellRing className="size-7 animate-bounce" /></span>
                    <div className="min-w-0">
                        <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">New order{ringing.length > 1 ? ` · ${ringing.length} waiting` : ''}</div>
                        <h2 id="new-order-title" className="truncate text-2xl font-extrabold tracking-tight">{n.title.replace('New order ', '')}</h2>
                    </div>
                </div>
                <p className="mt-4 text-[15px]">{n.body}</p>
                <p className="text-muted-foreground mt-1 text-xs">{new Date(n.created_at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</p>
                {locked && <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><Volume2 className="size-4" /> Click anywhere to turn the sound on.</p>}
                <div className="mt-6 grid grid-cols-2 gap-2">
                    <Button variant="outline" className="h-12" onClick={() => ack(n)}><Check /> Acknowledge</Button>
                    <Button className="h-12" onClick={() => ack(n, true)}><ExternalLink /> Open order</Button>
                </div>
            </div>
        </div>
    );
}

function systemNotify(n: Alert) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    const s = new Notification(n.title, { body: n.body, icon: '/brand/icon-192.png', tag: `zvino-admin-${n.id}`, requireInteraction: n.type === 'new_order' });
    s.onclick = () => { window.focus(); if (n.data?.url) router.visit(n.data.url); s.close(); };
}

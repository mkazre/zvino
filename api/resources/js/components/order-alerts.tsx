import { Button } from '@/components/ui/button';
import { Modal } from '@/components/z';
import { router, useForm, usePage } from '@inertiajs/react';
import { BellRing, Mail, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type User = { role: string; email: string | null } | null | undefined;
const LAST = 'zvino.alerts.last';

/** A short two-note chime (no audio file needed). Browsers only allow it after the visitor has clicked once. */
function chime() {
    try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        [[880, 0], [1320, 0.16]].forEach(([f, at]) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
            g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
            o.connect(g).connect(ctx.destination);
            o.start(ctx.currentTime + at);
            o.stop(ctx.currentTime + at + 0.4);
        });
        setTimeout(() => ctx.close(), 1200);
    } catch {
        /* no audio */
    }
}

export const browserAlertsSupported = () => typeof window !== 'undefined' && 'Notification' in window;

/**
 * Order updates while the website is open (any page, even in a background tab): pop-up, chime and a
 * system notification when allowed. Uses the same notifications the apps get as push.
 */
export function OrderAlerts() {
    const { auth } = usePage<{ auth?: { user?: User } }>().props;
    const user = auth?.user;
    const customer = !!user && ['customer', 'driver'].includes(user.role);
    const last = useRef<number | null>(null);

    useEffect(() => {
        if (!customer) return;
        let stopped = false;
        const tick = async () => {
            try {
                const r = await fetch(`/account/alerts${last.current !== null ? `?after=${last.current}` : ''}`, { headers: { Accept: 'application/json' } });
                if (!r.ok) return;
                const d: { latest_id: number; items: { id: number; title: string; body: string; data: { order_id?: number } | null }[] } = await r.json();
                if (last.current === null) {
                    const saved = Number(localStorage.getItem(LAST) ?? 0);
                    last.current = Math.max(saved, d.latest_id);
                    // Updates that arrived while the site was closed (since this browser last looked).
                    if (saved && d.latest_id > saved) {
                        last.current = saved;
                        return tick();
                    }
                } else {
                    for (const n of d.items) show(n);
                    last.current = d.latest_id;
                }
                localStorage.setItem(LAST, String(last.current));
            } catch {
                /* offline: try again next tick */
            }
        };
        const show = (n: { id: number; title: string; body: string; data: { order_id?: number } | null }) => {
            const url = n.data?.order_id ? `/orders/${n.data.order_id}` : '/account?tab=orders';
            window.dispatchEvent(new CustomEvent('zvino:order-update', { detail: n }));
            chime();
            toast(n.title, { description: n.body, duration: 8000, action: { label: 'View', onClick: () => router.visit(url) } });
            if (browserAlertsSupported() && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
                const sys = new Notification(n.title, { body: n.body, icon: '/brand/icon-192.png', tag: `zvino-${n.id}` });
                sys.onclick = () => { window.focus(); router.visit(url); sys.close(); };
            }
        };
        tick();
        const timer = setInterval(() => !stopped && tick(), 15000);
        return () => { stopped = true; clearInterval(timer); };
    }, [customer]);

    return customer ? <EmailPrompt email={user?.email ?? null} /> : null;
}

/** "Turn on order alerts" card for the order page. */
export function EnableAlertsCard() {
    const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(() => (browserAlertsSupported() ? Notification.permission : 'unsupported'));
    if (perm !== 'default') return null;
    return (
        <div className="flex items-center gap-4 rounded-3xl border p-5">
            <span className="bg-brand/15 flex size-11 shrink-0 items-center justify-center rounded-full"><BellRing className="size-5" /></span>
            <div className="min-w-0 flex-1"><div className="font-bold">Get order alerts in this browser</div><div className="text-muted-foreground text-sm">A pop-up and a sound when your order moves on, even in another tab.</div></div>
            <Button className="rounded-full" onClick={async () => { const p = await Notification.requestPermission(); setPerm(p); if (p === 'granted') { chime(); toast.success('Order alerts are on'); } }}>Turn on</Button>
        </div>
    );
}

const ASKED = 'zvino.email.asked';

/** Customers without an email: ask once per visit, so receipts and order updates can reach them. */
function EmailPrompt({ email }: { email: string | null }) {
    const [open, setOpen] = useState(false);
    const { data, setData, post, processing, errors } = useForm({ email: '' });
    useEffect(() => {
        if (email) return;
        try {
            if (sessionStorage.getItem(ASKED)) return;
        } catch {
            return;
        }
        const t = setTimeout(() => setOpen(true), 2500);
        return () => clearTimeout(t);
    }, [email]);
    const close = () => {
        try {
            sessionStorage.setItem(ASKED, '1');
        } catch {
            /* ignore */
        }
        setOpen(false);
    };
    if (email || !open) return null;
    return (
        <Modal open onClose={close} size="sm" title="Add your email" description="Get your receipts and order updates by email."
            footer={<><Button variant="outline" onClick={close}><X /> Not now</Button><Button disabled={processing || !data.email} onClick={() => post('/account/profile', { preserveScroll: true, onSuccess: close })}><Mail /> Save</Button></>}>
            <input type="email" autoFocus value={data.email} onChange={(e) => setData('email', e.target.value)} placeholder="you@example.com" className="h-12 w-full rounded-xl border px-4 outline-none focus:border-[#222222] dark:bg-white/5" />
            {errors.email && <p className="text-zred mt-1.5 text-sm">{errors.email}</p>}
        </Modal>
    );
}

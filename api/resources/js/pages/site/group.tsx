import { Button } from '@/components/ui/button';
import { DishCard, type MenuItem } from '@/components/site';
import { Input } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { cart } from '@/lib/cart';
import { zig } from '@/lib/money';
import { type Money, type SharedData } from '@/types';
import { Head, router, usePage } from '@inertiajs/react';
import { Copy, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface Group {
    code: string; status: string; host: { id: number; name: string }; spend_limit: Money | null; deadline_at: string | null; share_url: string;
    participants: { name: string; items: { id: number; name: string; quantity: number; total: Money }[]; subtotal: Money }[];
    subtotal: Money;
}

const headers = () => ({ 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '') });

export default function GroupPage({ code, store, menu, seo }: { code: string; store: { name: string; slug: string; cover_path: string | null }; menu: { data: MenuItem[] }; seo: { title: string } }) {
    const { auth } = usePage<SharedData>().props;
    const [group, setGroup] = useState<Group | null>(null);
    const [guest, setGuest] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('zvino.guest') ?? '' : ''));
    const load = useCallback(() => fetch(`/group/${code}/data`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).then(setGroup), [code]);
    useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
    const isHost = auth?.user?.id === group?.host.id;

    const add = async (i: MenuItem) => {
        if (!auth?.user && !guest) return toast.error('Enter your name first');
        localStorage.setItem('zvino.guest', guest);
        const r = await fetch(`/group/${code}/items`, { method: 'POST', credentials: 'include', headers: headers(), body: JSON.stringify({ item_id: i.id, quantity: 1, variant: i.variants[0]?.name ?? null, modifiers: [], guest_name: auth?.user ? undefined : guest }) });
        const d = await r.json();
        if (r.ok) { setGroup(d); toast.success(`${i.name} added for ${auth?.user?.name ?? guest}`); } else toast.error(d.message);
    };

    const checkout = async () => {
        // Host: move everything into their basket via the API, then continue with normal checkout.
        cart.clear(); // the group's items are now in the host's server cart
        router.visit('/checkout');
    };

    return (
        <SiteLayout hideCart>
            <Head title={seo.title} />
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[1fr_360px]">
                <div>
                    <p className="text-muted-foreground flex items-center gap-2 text-sm font-semibold"><Users className="size-4" /> Group order</p>
                    <h1 className="mt-1 text-[32px] font-extrabold tracking-[-0.04em]">{store.name}</h1>
                    <p className="text-muted-foreground">{group ? `Hosted by ${group.host.name}` : 'Loading…'}{group?.spend_limit && ` · up to ${zig(group.spend_limit.zig)} each`}</p>
                    {!auth?.user && <div className="mt-5 flex max-w-sm gap-2"><Input className="h-12" placeholder="Your name" value={guest} onChange={(e) => setGuest(e.target.value)} /></div>}
                    <div className="mt-6 grid gap-4 md:grid-cols-2">{menu.data.map((i) => <DishCard key={i.id} i={i} onClick={() => add(i)} />)}</div>
                </div>
                <aside className="lg:sticky lg:top-24 lg:self-start">
                    <div className="rounded-3xl border p-6">
                        <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Link copied. Share it with your group'); }} className="bg-muted flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold"><span>Invite link</span><Copy className="size-4" /></button>
                        <div className="mt-5 grid gap-4">
                            {group?.participants.map((p) => (
                                <div key={p.name}><div className="flex justify-between font-semibold"><span>{p.name}</span><span className="tabular">{zig(p.subtotal.zig)}</span></div>{p.items.map((i) => <div key={i.id} className="text-muted-foreground text-sm">{i.quantity}× {i.name}</div>)}</div>
                            ))}
                            {group && group.participants.length === 0 && <p className="text-muted-foreground text-sm">Nobody has added anything yet.</p>}
                        </div>
                        <div className="mt-5 flex justify-between border-t pt-4 font-bold"><span>Group total</span><span className="tabular">{zig(group?.subtotal.zig ?? 0)}</span></div>
                        {isHost && <Button variant="dark" className="mt-4 h-12 w-full rounded-full" disabled={!group?.participants.length} onClick={async () => { const r = await fetch(`/group/${code}/checkout`, { method: 'POST', credentials: 'include', headers: headers() }); r.ok ? checkout() : toast.error('Could not lock the group order'); }}>Lock & check out</Button>}
                    </div>
                </aside>
            </div>
        </SiteLayout>
    );
}

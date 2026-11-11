import { Button } from '@/components/ui/button';
import { StoreCard, type StoreCardData } from '@/components/site';
import { Input, Progress, Select, Switch } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { alt, label, timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Money, type Order } from '@/types';
import { Head, Link, router, useForm } from '@inertiajs/react';
import { Copy, Gift, Heart, Home, MapPin, Plus, ReceiptText, Share2, Trash2, User, Wallet, Crown } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AddressModal } from '@/components/site-address';

interface Props {
    tab: string;
    welcome: boolean;
    profile: { id: number; name: string; email: string | null; phone: string; locale: string; marketing_opt_in: boolean };
    orders: { data: (Order & { review?: unknown })[] };
    addresses: { id: number; label: string; line1: string; landmark: string | null; suburb: string | null; city: string; is_default: boolean }[];
    wallet: { balance: Money; transactions: { id: number; type: 'credit' | 'debit'; amount_zig: number; reason: string; created_at: string }[] };
    loyalty: { points: number; lifetime: number; tier: string; next: { name: string; points_needed: number; threshold: number } | null };
    rewards: { id: number; name: string; description: string | null; points_cost: number; type: string }[];
    favorites: StoreCardData[];
    referral: { code: string; you_get: number; friend_gets: number; invited: number };
    giftCards: { id: number; code: string; amount_zig: number; status: string; recipient_name: string | null; recipient_phone: string | null; created_at: string }[];
    plus: { status: string; current_period_end: string; plan: { name: string } } | null;
    cities: string[];
}

const TABS = [
    ['orders', 'Orders', ReceiptText], ['wallet', 'Wallet & rewards', Wallet], ['addresses', 'Addresses', MapPin], ['favorites', 'Favourites', Heart],
    ['refer', 'Invite friends', Share2], ['gifts', 'Gift cards', Gift], ['plus', 'Zvino+', Crown], ['profile', 'Profile', User],
] as const;

export default function Account(p: Props) {
    const [tab, setTab] = useState(p.tab);
    const go = (t: string) => { setTab(t); window.history.replaceState({}, '', `/account?tab=${t}`); };

    return (
        <SiteLayout>
            <Head title="My account · Zvino" />
            <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
                <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">{p.welcome ? 'Welcome to Zvino 👋' : `Hi ${p.profile.name?.split(' ')[0] || 'there'}`}</h1>
                {p.welcome && <p className="text-muted-foreground mt-1">Add your name and an address and you’re ready to order.</p>}
                <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
                    <nav className="scroll-quiet -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:grid md:content-start md:px-0">
                        {TABS.map(([k, l, Icon]) => (
                            <button key={k} onClick={() => go(k)} className={cn('flex h-11 shrink-0 items-center gap-3 rounded-xl px-4 text-left text-[15px] font-semibold transition', tab === k ? 'bg-[#1c1c1c] text-white dark:bg-white dark:text-black' : 'hover:bg-muted')}>
                                <Icon className="size-[18px]" />{l}
                            </button>
                        ))}
                    </nav>
                    <div className="min-w-0">
                        {tab === 'orders' && <Orders orders={p.orders.data} />}
                        {tab === 'wallet' && <WalletTab {...p} />}
                        {tab === 'addresses' && <Addresses addresses={p.addresses} cities={p.cities} />}
                        {tab === 'favorites' && (p.favorites.length ? <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2">{p.favorites.map((s) => <StoreCard key={s.id} s={s} compact />)}</div> : <Empty icon={Heart} text="Tap the heart on any store to save it here." />)}
                        {tab === 'refer' && <Refer r={p.referral} />}
                        {tab === 'gifts' && <Gifts cards={p.giftCards} />}
                        {tab === 'plus' && <Plus_ plus={p.plus} />}
                        {tab === 'profile' && <Profile profile={p.profile} />}
                    </div>
                </div>
            </div>
        </SiteLayout>
    );
}

function Empty({ icon: Icon, text, action }: { icon: typeof Heart; text: string; action?: React.ReactNode }) {
    return <div className="rounded-3xl border border-dashed px-6 py-16 text-center"><Icon className="text-muted-foreground mx-auto size-8" /><p className="text-muted-foreground mt-3">{text}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function Orders({ orders }: { orders: Props['orders']['data'] }) {
    if (!orders.length) return <Empty icon={ReceiptText} text="No orders yet. Your first one is a few taps away." action={<Button variant="dark" className="rounded-full" asChild><Link href="/stores">Browse stores</Link></Button>} />;
    const live = orders.filter((o) => !['delivered', 'cancelled', 'rejected'].includes(o.status));
    const past = orders.filter((o) => ['delivered', 'cancelled', 'rejected'].includes(o.status));
    return (
        <div className="grid min-w-0 grid-cols-1 gap-8">
            {live.length > 0 && <div className="grid min-w-0 grid-cols-1 gap-3"><h2 className="font-bold">In progress</h2>{live.map((o) => <OrderRow key={o.id} o={o} live />)}</div>}
            {past.length > 0 && <div className="grid min-w-0 grid-cols-1 gap-3"><h2 className="font-bold">Past orders</h2>{past.map((o) => <OrderRow key={o.id} o={o} />)}</div>}
        </div>
    );
}

function OrderRow({ o, live }: { o: Order & { review?: unknown }; live?: boolean }) {
    return (
        <div className={cn('flex min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border p-4 sm:flex-row sm:items-center sm:gap-4', live && 'border-brand bg-brand-50/40')}>
            <Link href={`/orders/${o.id}`} className="block w-full min-w-0 sm:flex-1">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="truncate font-bold">{o.vendor?.name}</div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', live ? 'bg-brand/15 text-brand-700' : o.status === 'delivered' ? 'bg-muted' : 'bg-zred/10 text-zred')}>{label(o.status === 'picked_up' ? 'on_the_way' : o.status)}</span>
                </div>
                <div className="text-muted-foreground mt-0.5 line-clamp-2 text-sm break-words">{o.items?.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
                <div className="text-muted-foreground mt-1 text-xs">#{o.reference} · {new Date(o.created_at).toLocaleDateString('en-ZW', { dateStyle: 'medium' })} · <span className="tabular">{zig(o.totals.total.zig)}</span></div>
            </Link>
            {live ? <Button variant="dark" size="sm" className="w-full shrink-0 rounded-full sm:w-auto" asChild><Link href={`/orders/${o.id}`}>Track</Link></Button> : o.status === 'delivered' && (
                <div className="flex shrink-0 gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
                    {!o.review && <Button variant="outline" size="sm" className="rounded-full" asChild><Link href={`/orders/${o.id}`}>Rate</Link></Button>}
                    <Button variant="dark" size="sm" className="rounded-full" onClick={() => router.post(`/orders/${o.id}/reorder`)}>Order again</Button>
                </div>
            )}
        </div>
    );
}

function WalletTab({ wallet, loyalty, rewards }: Props) {
    const [code, setCode] = useState('');
    const pct = loyalty.next ? (loyalty.lifetime / loyalty.next.threshold) * 100 : 100;
    return (
        <div className="grid gap-6">
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-[#222222] p-6 text-white">
                    <div className="text-sm text-white/60">Zvino wallet</div>
                    <div className="tabular mt-1 text-4xl font-extrabold tracking-tight">{zig(wallet.balance.zig)}</div>
                    <div className="tabular text-sm text-white/60">{alt(wallet.balance.zig)}</div>
                    <form onSubmit={(e) => { e.preventDefault(); router.post('/account/gift-cards/redeem', { code }, { preserveScroll: true, onSuccess: () => setCode('') }); }} className="mt-5 flex gap-2">
                        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Gift card code" className="h-11 flex-1 rounded-xl bg-white/10 px-3 font-mono text-sm outline-none placeholder:text-white/40" />
                        <Button className="h-11 rounded-xl bg-white text-black hover:bg-white/90" disabled={!code}>Redeem</Button>
                    </form>
                </div>
                <div className="rounded-3xl bg-sun-50 p-6 text-ink">
                    <div className="flex items-center justify-between"><span className="text-sm opacity-70">Zvino Rewards</span><span className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold">{loyalty.tier}</span></div>
                    <div className="tabular mt-1 text-4xl font-extrabold tracking-tight">{loyalty.points.toLocaleString()} <span className="text-lg font-bold">pts</span></div>
                    {loyalty.next ? <><Progress value={Math.min(100, Math.max(4, pct))} tone="gold" className="mt-4 bg-white/60" /><p className="mt-2 text-xs opacity-70">{loyalty.next.points_needed.toLocaleString()} points to {loyalty.next.name}</p></> : <p className="mt-4 text-sm">You’re at the top tier 👑</p>}
                </div>
            </div>
            <div>
                <h2 className="mb-3 font-bold">Spend your points</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                    {rewards.map((r) => (
                        <div key={r.id} className="flex items-center gap-4 rounded-2xl border p-4">
                            <span className="flex size-11 items-center justify-center rounded-xl bg-sun-50 text-gold"><Gift className="size-5" /></span>
                            <div className="flex-1"><div className="font-semibold">{r.name}</div><div className="tabular text-muted-foreground text-sm">{r.points_cost.toLocaleString()} pts</div></div>
                            <Button size="sm" variant="dark" className="rounded-full" disabled={loyalty.points < r.points_cost} onClick={() => router.post('/account/rewards', { reward_id: r.id }, { preserveScroll: true })}>Redeem</Button>
                        </div>
                    ))}
                </div>
            </div>
            <div>
                <h2 className="mb-3 font-bold">Wallet activity</h2>
                <ul className="divide-y rounded-2xl border">
                    {wallet.transactions.length === 0 && <li className="text-muted-foreground px-5 py-8 text-center text-sm">No activity yet.</li>}
                    {wallet.transactions.map((t) => <li key={t.id} className="flex items-center justify-between px-5 py-3 text-sm"><span><span className="block font-medium">{t.reason}</span><span className="text-muted-foreground text-xs">{timeAgo(t.created_at)}</span></span><span className={cn('tabular font-semibold', t.type === 'credit' && 'text-brand-600')}>{t.type === 'credit' ? '+' : '−'}{zig(t.amount_zig)}</span></li>)}
                </ul>
            </div>
        </div>
    );
}

function Addresses({ addresses, cities }: { addresses: Props['addresses']; cities: string[] }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="grid gap-3">
            {addresses.map((a) => (
                <div key={a.id} className="flex items-start gap-4 rounded-2xl border p-4">
                    <Home className="mt-0.5 size-5" />
                    <div className="flex-1"><div className="font-semibold">{a.label} {a.is_default && <span className="bg-muted ml-1 rounded px-1.5 py-0.5 text-[11px]">Default</span>}</div><div className="text-muted-foreground text-sm">{a.line1}{a.suburb && `, ${a.suburb}`}, {a.city}</div>{a.landmark && <div className="text-muted-foreground text-xs">📍 {a.landmark}</div>}</div>
                    <button onClick={() => router.delete(`/account/addresses/${a.id}`, { preserveScroll: true })} className="text-muted-foreground hover:text-zred p-1" aria-label="Remove"><Trash2 className="size-4" /></button>
                </div>
            ))}
            <button onClick={() => setOpen(true)} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 font-semibold"><Plus className="size-5" /> Add address</button>
            <AddressModal open={open} onClose={() => setOpen(false)} cities={cities} />
        </div>
    );
}

function Refer({ r }: { r: Props['referral'] }) {
    const link = `${window.location.origin}/signin?ref=${r.code}`;
    const msg = `Get ${zig(r.friend_gets)} off your first Zvino order with my code ${r.code} 🍲 ${link}`;
    return (
        <div className="grid gap-6">
            <div className="rounded-3xl bg-brand p-8 text-white">
                <h2 className="text-3xl font-extrabold tracking-tight">Give {zig(r.friend_gets)}, get {zig(r.you_get)}</h2>
                <p className="mt-2 max-w-md text-white/75">When a friend places their first order with your code, you both get wallet credit.</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <span className="rounded-xl bg-white/15 px-5 py-3 font-mono text-2xl font-bold tracking-widest">{r.code}</span>
                    <Button className="h-12 rounded-full bg-white text-black hover:bg-white/90" onClick={() => { navigator.clipboard.writeText(r.code); toast.success('Code copied'); }}><Copy /> Copy</Button>
                    <Button className="h-12 rounded-full bg-[#25D366] text-white hover:bg-[#1ebe5b]" asChild><a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Share on WhatsApp</a></Button>
                </div>
            </div>
            <p className="text-muted-foreground">You’ve invited <b className="text-foreground">{r.invited}</b> friend{r.invited === 1 ? '' : 's'} so far.</p>
            <form onSubmit={(e) => { e.preventDefault(); const c = new FormData(e.currentTarget).get('code'); router.post('/account/referral', { code: c }, { preserveScroll: true }); }} className="flex max-w-sm gap-2">
                <Input name="code" placeholder="Got a friend’s code?" className="h-11 font-mono uppercase" />
                <Button variant="outline" className="h-11">Apply</Button>
            </form>
        </div>
    );
}

function Gifts({ cards }: { cards: Props['giftCards'] }) {
    return (
        <div className="grid gap-4">
            <Button variant="dark" className="w-fit rounded-full" asChild><Link href="/gift-cards"><Gift /> Send a gift card</Link></Button>
            {cards.length === 0 ? <Empty icon={Gift} text="Gift cards you buy will appear here with their codes." /> : cards.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4">
                    <div className="flex h-14 w-24 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-[#073e2c] font-bold text-white">{zig(c.amount_zig)}</div>
                    <div className="flex-1"><div className="font-mono font-bold tracking-wide">{c.code}</div><div className="text-muted-foreground text-sm">{c.recipient_name ? `For ${c.recipient_name}` : 'No recipient'} {c.recipient_phone && `· ${c.recipient_phone}`}</div></div>
                    <span className="bg-muted rounded-full px-3 py-1 text-xs font-semibold">{label(c.status)}</span>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => { navigator.clipboard.writeText(c.code); toast.success('Code copied'); }}><Copy /> Copy</Button>
                </div>
            ))}
        </div>
    );
}

function Plus_({ plus }: { plus: Props['plus'] }) {
    return plus ? (
        <div className="rounded-3xl bg-[#222222] p-8 text-white">
            <span className="text-sm font-bold text-brand">ACTIVE MEMBER</span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">{plus.plan.name}</h2>
            <p className="mt-2 text-white/60">Renews {new Date(plus.current_period_end).toLocaleDateString('en-ZW', { dateStyle: 'long' })}</p>
        </div>
    ) : <Empty icon={Crown} text="Free delivery and half-price service fees on every order." action={<Button variant="dark" className="rounded-full" asChild><Link href="/plus">Join Zvino+</Link></Button>} />;
}

function Profile({ profile }: { profile: Props['profile'] }) {
    const { data, setData, post, processing, isDirty } = useForm({ name: profile.name ?? '', email: profile.email ?? '', locale: profile.locale, marketing_opt_in: profile.marketing_opt_in });
    return (
        <div className="grid max-w-lg gap-4">
            <label className="grid gap-1.5 text-sm font-semibold">Name<Input className="h-12" value={data.name} onChange={(e) => setData('name', e.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Email (for receipts)<Input className="h-12" type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Phone<Input className="h-12" value={profile.phone} disabled /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Language<Select className="h-12" value={data.locale} onChange={(e) => setData('locale', e.target.value)}><option value="en">English</option><option value="sn">ChiShona</option><option value="nd">isiNdebele</option></Select></label>
            <Switch checked={data.marketing_opt_in} onChange={(v) => setData('marketing_opt_in', v)} label="Deals and offers" description="Occasional push and SMS offers. Never during quiet hours." />
            <Button variant="dark" className="h-12 w-fit rounded-full px-8" disabled={processing || !isDirty} onClick={() => post('/account/profile', { preserveScroll: true })}>Save</Button>
        </div>
    );
}

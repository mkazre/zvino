import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, Field, Grid, Input, KeyValue, Modal, Money, Page, Segmented, StatCard, StatusPill, Textarea } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Order } from '@/types';
import { Link, router } from '@inertiajs/react';
import { ArrowLeft, Ban, MapPin, Wallet } from 'lucide-react';
import { useState } from 'react';

interface Props {
    customer: {
        id: number; name: string; phone: string; email: string | null; created_at: string; banned_at: string | null; last_seen_at: string | null; marketing_opt_in: boolean; locale: string;
        wallet_zig: number; referral_code: string | null; zvino_plus: { status: string; current_period_end: string } | null;
        loyalty?: { points: number; lifetime_points: number; tier: string } | null;
        addresses: { id: number; label: string; line1: string; landmark?: string; suburb?: string; city: string; is_default: boolean }[];
    };
    stats: { orders: number; spend_zig: number; avg_zig: number; refunds_zig: number; cancelled: number };
    orders: { data: Order[] };
    wallet: { id: number; type: 'credit' | 'debit'; amount_zig: number; reason: string; created_at: string }[];
    tickets: { id: number; subject: string; status: string; created_at: string }[];
}

export default function CustomerShow({ customer: c, stats, orders, wallet, tickets }: Props) {
    const [walletOpen, setWalletOpen] = useState(false);
    const [banOpen, setBanOpen] = useState(false);

    return (
        <AdminLayout title={c.name || c.phone}>
            <Page>
                <Link href="/admin/users" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" /> Customers</Link>
                <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={c.name || c.phone} size={64} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">{c.name || 'No name yet'}</h1>
                            <Badge tone={c.loyalty?.tier === 'Gold' ? 'warning' : c.loyalty?.tier === 'Platinum' ? 'dark' : 'neutral'}>{c.loyalty?.tier ?? 'Bronze'}</Badge>
                            {c.zvino_plus && <Badge tone="success">Zvino+</Badge>}
                            {c.banned_at && <Badge tone="danger">Blocked</Badge>}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">{c.phone}{c.email && ` · ${c.email}`} · joined {timeAgo(c.created_at)}{c.last_seen_at && ` · last seen ${timeAgo(c.last_seen_at)}`}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setWalletOpen(true)}><Wallet /> Adjust wallet</Button>
                        <Button variant="outline" size="sm" className={c.banned_at ? '' : 'text-zred'} onClick={() => (c.banned_at ? router.post(`/admin/users/${c.id}/ban`) : setBanOpen(true))}><Ban /> {c.banned_at ? 'Unblock' : 'Block'}</Button>
                    </div>
                </div>

                <Grid cols={4}>
                    <StatCard label="Orders" value={stats.orders} hint={`${stats.cancelled} cancelled`} />
                    <StatCard label="Lifetime spend" value={zig(stats.spend_zig)} hint={`Avg ${zig(stats.avg_zig)}`} />
                    <StatCard label="Wallet" value={zig(c.wallet_zig)} hint={`${c.loyalty?.points ?? 0} points`} />
                    <StatCard label="Refunded" value={zig(stats.refunds_zig)} hint={stats.spend_zig ? `${Math.round((stats.refunds_zig / stats.spend_zig) * 100)}% of spend` : undefined} />
                </Grid>

                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Orders" />
                            <ul className="divide-y border-t">
                                {orders.data.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No orders yet.</li>}
                                {orders.data.map((o) => (
                                    <li key={o.id}>
                                        <Link href={`/admin/orders/${o.id}`} className="hover:bg-subtle flex items-center gap-4 px-5 py-3 text-sm">
                                            <span className="w-24 font-mono text-[13px] font-semibold">{o.reference}</span>
                                            <span className="text-muted-foreground flex-1 truncate">{o.vendor?.name} · {timeAgo(o.created_at)}</span>
                                            <Money zig={o.totals.total.zig} usd={o.totals.total.usd} size="sm" />
                                            <StatusPill status={o.status} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card>
                            <CardHeader title="Wallet activity" />
                            <ul className="divide-y border-t text-sm">
                                {wallet.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center">No wallet activity.</li>}
                                {wallet.map((w) => (
                                    <li key={w.id} className="flex items-center gap-3 px-5 py-2.5">
                                        <span className="text-muted-foreground w-24 text-xs">{new Date(w.created_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}</span>
                                        <span className="flex-1 truncate">{w.reason}</span>
                                        <span className={cn('tabular font-medium', w.type === 'credit' ? 'text-brand' : '')}>{w.type === 'credit' ? '+' : '−'}{zig(w.amount_zig)}</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Profile" />
                            <CardBody>
                                <KeyValue items={[
                                    ['Language', { en: 'English', sn: 'Shona', nd: 'Ndebele' }[c.locale] ?? c.locale],
                                    ['Marketing', c.marketing_opt_in ? 'Opted in' : 'Opted out'],
                                    ['Referral code', c.referral_code ? <code key="r" className="font-mono">{c.referral_code}</code> : '–'],
                                    ['Zvino+', c.zvino_plus ? `Until ${new Date(c.zvino_plus.current_period_end).toLocaleDateString('en-ZW')}` : 'Not a member'],
                                    ['Lifetime points', c.loyalty?.lifetime_points ?? 0],
                                ]} />
                            </CardBody>
                        </Card>
                        <Card>
                            <CardHeader title="Addresses" />
                            <ul className="divide-y border-t">
                                {c.addresses.length === 0 && <li className="text-muted-foreground px-5 py-4 text-sm">None saved.</li>}
                                {c.addresses.map((a) => (
                                    <li key={a.id} className="flex gap-3 px-5 py-3 text-sm">
                                        <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                        <div><div className="font-medium">{a.label} {a.is_default && <Badge className="ml-1">Default</Badge>}</div><div className="text-muted-foreground">{a.line1}{a.landmark && ` · ${a.landmark}`}, {a.suburb ? `${a.suburb}, ` : ''}{a.city}</div></div>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        {tickets.length > 0 && (
                            <Card>
                                <CardHeader title="Support tickets" />
                                <ul className="divide-y border-t">
                                    {tickets.map((t) => (
                                        <li key={t.id}><Link href={`/admin/support/${t.id}`} className="hover:bg-subtle flex items-center justify-between px-5 py-2.5 text-sm"><span className="truncate">{t.subject}</span><StatusPill status={t.status} /></Link></li>
                                    ))}
                                </ul>
                            </Card>
                        )}
                    </div>
                </div>
            </Page>
            <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} id={c.id} balance={c.wallet_zig} />
            <BanModal open={banOpen} onClose={() => setBanOpen(false)} id={c.id} />
        </AdminLayout>
    );
}

function WalletModal({ open, onClose, id, balance }: { open: boolean; onClose: () => void; id: number; balance: number }) {
    const [type, setType] = useState<'credit' | 'debit'>('credit');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    return (
        <Modal open={open} onClose={onClose} title="Adjust wallet" description={`Current balance ${zig(balance)}. Every adjustment is recorded in the audit log.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!amount || !reason} onClick={() => router.post(`/admin/users/${id}/wallet`, { type, amount_zig: amount, reason }, { onSuccess: onClose, preserveScroll: true })}>{type === 'credit' ? 'Add credit' : 'Remove credit'}</Button></>}>
            <div className="grid gap-4">
                <Segmented value={type} onChange={setType} options={[{ value: 'credit', label: 'Add credit' }, { value: 'debit', label: 'Remove credit' }]} />
                <Field label="Amount"><Input type="number" step="0.01" prefix="ZiG" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Goodwill: late delivery" /></Field>
            </div>
        </Modal>
    );
}

function BanModal({ open, onClose, id }: { open: boolean; onClose: () => void; id: number }) {
    const [reason, setReason] = useState('');
    return (
        <Modal open={open} onClose={onClose} size="sm" title="Block this customer?" description="They’ll be signed out of all devices and can’t order until unblocked."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" onClick={() => router.post(`/admin/users/${id}/ban`, { reason }, { onSuccess: onClose })}>Block customer</Button></>}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (internal), e.g. repeated fraudulent refund claims" />
        </Modal>
    );
}

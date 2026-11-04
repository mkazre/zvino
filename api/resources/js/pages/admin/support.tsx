import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, EmptyState, Page, PageHeader, Select, StatusPill, TabBar, Textarea } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type PageLink } from '@/types';
import { Link, router } from '@inertiajs/react';
import { LifeBuoy, Send } from 'lucide-react';
import { useState } from 'react';

interface Ticket {
    id: number;
    subject: string;
    message: string;
    status: 'open' | 'pending' | 'resolved';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    created_at: string;
    updated_at: string;
    user: { id: number; name: string; phone: string; email?: string };
    assignee?: { name: string } | null;
    assigned_to: number | null;
}

interface Detail extends Ticket {
    messages: { id: number; body: string; is_staff: boolean; created_at: string; sender?: { name: string } }[];
    order?: { id: number; reference: string; status: string; total_zig: number; vendor?: { name: string } } | null;
    customer_orders: { id: number; reference: string; status: string; total_zig: number; created_at: string }[];
    wallet_zig: number;
}

interface Props {
    tickets: { data: Ticket[]; links: PageLink[] };
    counts: Record<string, number>;
    status: string;
    active: Detail | null;
    agents: { id: number; name: string }[];
}

const PRIORITY_TONE = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' } as const;
const QUICK = ['Sorry about that! We’ve added a credit to your Zvino wallet.', 'Thanks for letting us know. Your driver is on the way and should arrive shortly.', 'We’ve passed this to the restaurant and will update you within 30 minutes.'];

export default function Support({ tickets, counts, status, active, agents }: Props) {
    const [reply, setReply] = useState('');
    const open = (id: number) => router.get('/admin/support', { status, ticket: id }, { preserveState: true, preserveScroll: true, only: ['active'] });

    return (
        <AdminLayout title="Support">
            <Page wide>
                <PageHeader title="Support inbox" description="Customer questions and complaints from the apps and website." />
                <TabBar value={status} onChange={(s) => router.get('/admin/support', { status: s })} options={['open', 'pending', 'resolved', 'all'].map((s) => ({ value: s, label: s === 'pending' ? 'Waiting on customer' : label(s), count: s === 'all' ? undefined : counts[s] ?? 0 }))} />
                <Card className="grid min-h-[600px] overflow-hidden lg:grid-cols-[380px_1fr]">
                    <ul className="scroll-quiet max-h-[70vh] divide-y overflow-y-auto border-b lg:border-r lg:border-b-0">
                        {tickets.data.length === 0 && <EmptyState icon={LifeBuoy} title="Inbox zero" description="No tickets here." />}
                        {tickets.data.map((t) => (
                            <li key={t.id}>
                                <button onClick={() => open(t.id)} className={cn('w-full px-4 py-3.5 text-left transition', active?.id === t.id ? 'bg-muted' : 'hover:bg-subtle')}>
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-semibold">{t.user.name || t.user.phone}</span>
                                        {t.priority !== 'normal' && <Badge tone={PRIORITY_TONE[t.priority]}>{label(t.priority)}</Badge>}
                                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">{timeAgo(t.updated_at)}</span>
                                    </div>
                                    <div className="mt-0.5 truncate text-[13px] font-medium">{t.subject}</div>
                                    <div className="text-muted-foreground truncate text-xs">{t.message}</div>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {active ? (
                        <div className="flex min-h-0 flex-col">
                            <header className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <h2 className="truncate font-semibold">{active.subject}</h2>
                                    <p className="text-muted-foreground text-xs">#{active.id} · {active.user.name} · {active.user.phone}</p>
                                </div>
                                <Select className="h-8 w-auto text-[13px]" value={active.priority} onChange={(e) => router.patch(`/admin/support/${active.id}`, { priority: e.target.value }, { preserveScroll: true })}>
                                    {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{label(p)} priority</option>)}
                                </Select>
                                <Select className="h-8 w-auto text-[13px]" value={active.assigned_to ?? ''} onChange={(e) => router.patch(`/admin/support/${active.id}`, { assigned_to: e.target.value || null }, { preserveScroll: true })}>
                                    <option value="">Unassigned</option>
                                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </Select>
                                {active.status !== 'resolved' ? (
                                    <Button size="sm" variant="outline" onClick={() => router.patch(`/admin/support/${active.id}`, { status: 'resolved' })}>Resolve</Button>
                                ) : (
                                    <Button size="sm" variant="outline" onClick={() => router.patch(`/admin/support/${active.id}`, { status: 'open' })}>Reopen</Button>
                                )}
                            </header>
                            <div className="grid min-h-0 flex-1 xl:grid-cols-[1fr_260px]">
                                <div className="flex min-h-0 flex-col">
                                    <div className="scroll-quiet flex flex-1 flex-col gap-3 overflow-y-auto p-5">
                                        <Bubble name={active.user.name} at={active.created_at} body={active.message} />
                                        {active.messages.map((m) => <Bubble key={m.id} staff={m.is_staff} name={m.sender?.name ?? ''} at={m.created_at} body={m.body} />)}
                                    </div>
                                    <form className="border-t p-4" onSubmit={(e) => { e.preventDefault(); router.post(`/admin/support/${active.id}/reply`, { body: reply }, { preserveScroll: true, onSuccess: () => setReply('') }); }}>
                                        <div className="mb-2 flex flex-wrap gap-1.5">
                                            {QUICK.map((q) => <button type="button" key={q} onClick={() => setReply(q)} className="bg-muted hover:bg-muted/70 max-w-64 truncate rounded-full px-2.5 py-1 text-xs">{q}</button>)}
                                        </div>
                                        <div className="flex gap-2">
                                            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply… The customer gets a push notification." className="min-h-[72px]" />
                                            <Button disabled={!reply} className="self-end"><Send /> Send</Button>
                                        </div>
                                    </form>
                                </div>
                                <aside className="bg-subtle hidden border-l p-4 text-sm xl:block">
                                    <div className="mb-4 flex items-center gap-3">
                                        <Avatar name={active.user.name} size={36} />
                                        <div><Link href={`/admin/users/${active.user.id}`} className="font-semibold hover:underline">{active.user.name}</Link><div className="text-muted-foreground text-xs">Wallet {zig(active.wallet_zig)}</div></div>
                                    </div>
                                    {active.order && (
                                        <div className="mb-4">
                                            <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Related order</div>
                                            <Link href={`/admin/orders/${active.order.id}`} className="bg-surface flex items-center justify-between rounded-lg border p-2.5 hover:shadow-(--shadow-card)">
                                                <span className="font-mono text-[13px] font-semibold">{active.order.reference}</span><StatusPill status={active.order.status} />
                                            </Link>
                                        </div>
                                    )}
                                    <div className="text-muted-foreground mb-1 text-xs font-medium uppercase">Recent orders</div>
                                    <ul className="grid gap-1">
                                        {active.customer_orders.map((o) => (
                                            <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="hover:bg-surface flex justify-between rounded-md px-2 py-1.5 text-xs"><span className="font-mono">{o.reference}</span><span>{zig(o.total_zig)}</span></Link></li>
                                        ))}
                                    </ul>
                                </aside>
                            </div>
                        </div>
                    ) : (
                        <EmptyState icon={LifeBuoy} title="Select a conversation" description="Pick a ticket on the left to read and reply." />
                    )}
                </Card>
            </Page>
        </AdminLayout>
    );
}

function Bubble({ staff = false, name, at, body }: { staff?: boolean; name: string; at: string; body: string }) {
    return (
        <div className={cn('flex max-w-[80%] flex-col gap-1', staff ? 'self-end items-end' : 'self-start')}>
            <span className="text-muted-foreground text-[11px]">{staff ? `${name} (Zvino)` : name} · {timeAgo(at)}</span>
            <div className={cn('rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap', staff ? 'bg-foreground text-background rounded-br-md' : 'bg-muted rounded-bl-md')}>{body}</div>
        </div>
    );
}

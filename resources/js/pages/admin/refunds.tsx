import { Button } from '@/components/ui/button';
import { Card, DataTable, Field, Grid, Input, Modal, Page, PageHeader, Select, StatCard, StatusPill, TabBar, Textarea, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, usd, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { Link, router } from '@inertiajs/react';
import { Check, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';

interface Refund {
    id: number;
    amount_zig: number;
    destination: 'wallet' | 'original';
    status: string;
    reason: string;
    items: string[] | null;
    note: string | null;
    evidence_path: string | null;
    created_at: string;
    requester?: { name: string } | null;
    order: { id: number; reference: string; total_zig: number; refunded_zig: number; payment_method: string; zig_per_usd: number; vendor?: { name: string }; user?: { name: string; phone: string } };
}

interface Props {
    refunds: { data: Refund[]; links: PageLink[]; total: number };
    counts: Record<string, number>;
    status: string;
    totals: { pending_zig: number; paid_30d_zig: number };
}

export default function Refunds({ refunds, counts, status, totals }: Props) {
    const [active, setActive] = useState<Refund | null>(null);

    const columns: Column<Refund>[] = [
        { key: 'order', header: 'Order', cell: (r) => <Link href={`/admin/orders/${r.order.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] font-semibold hover:underline">{r.order.reference}</Link> },
        { key: 'customer', header: 'Customer', cell: (r) => <div><div className="font-medium">{r.order.user?.name}</div><div className="text-muted-foreground text-xs">{r.order.vendor?.name}</div></div> },
        { key: 'reason', header: 'Reason', cell: (r) => <div><div className="font-medium">{label(r.reason)}</div>{r.items?.length ? <div className="text-muted-foreground max-w-56 truncate text-xs">{r.items.join(', ')}</div> : null}</div> },
        { key: 'amount', header: 'Amount', align: 'right', sort: (r) => r.amount_zig, cell: (r) => <span className="tabular font-semibold">{zig(r.amount_zig)}</span> },
        { key: 'to', header: 'To', hideOnMobile: true, cell: (r) => <span className="text-[13px]">{r.destination === 'wallet' ? 'Wallet' : label(r.order.payment_method)}</span> },
        { key: 'when', header: 'Requested', hideOnMobile: true, sort: (r) => r.created_at, cell: (r) => <span className="text-muted-foreground text-[13px]">{timeAgo(r.created_at)}</span> },
        { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
    ];

    return (
        <AdminLayout title="Refunds">
            <Page wide>
                <PageHeader title="Refunds" description="Customer claims and goodwill refunds. Wallet refunds are instant; reversals to EcoCash or card are processed by finance." />
                <Grid cols={3}>
                    <StatCard label="Waiting for review" value={counts.requested ?? 0} hint={zig(totals.pending_zig)} icon={RotateCcw} />
                    <StatCard label="Approved, awaiting reversal" value={counts.approved ?? 0} hint="Refunds to original payment method" />
                    <StatCard label="Refunded (30 days)" value={zig(totals.paid_30d_zig)} />
                </Grid>
                <TabBar value={status} onChange={(s) => router.get('/admin/refunds', { status: s }, { preserveState: true })} options={['requested', 'approved', 'paid', 'rejected', 'all'].map((s) => ({ value: s, label: s === 'requested' ? 'To review' : label(s), count: s === 'all' ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[s] ?? 0 }))} />
                <Card>
                    <DataTable rows={refunds.data} columns={columns} onRowClick={setActive} links={refunds.links} />
                </Card>
            </Page>
            {active && <ReviewModal refund={active} onClose={() => setActive(null)} />}
        </AdminLayout>
    );
}

function ReviewModal({ refund: r, onClose }: { refund: Refund; onClose: () => void }) {
    const [amount, setAmount] = useState(String(r.amount_zig));
    const [destination, setDestination] = useState(r.destination);
    const [note, setNote] = useState('');
    const [reference, setReference] = useState('');
    const max = r.order.total_zig - r.order.refunded_zig;

    const footer =
        r.status === 'requested' ? (
            <>
                <Button variant="outline" className="text-zred" disabled={!note} onClick={() => router.post(`/admin/refunds/${r.id}/reject`, { note }, { onSuccess: onClose })}><X /> Reject</Button>
                <Button onClick={() => router.post(`/admin/refunds/${r.id}/approve`, { amount_zig: amount, destination }, { onSuccess: onClose })}><Check /> Approve {zig(Number(amount) || 0)}</Button>
            </>
        ) : r.status === 'approved' ? (
            <Button disabled={!reference} onClick={() => router.post(`/admin/refunds/${r.id}/paid`, { reference }, { onSuccess: onClose })}>Mark reversal done</Button>
        ) : (
            <Button variant="outline" onClick={onClose}>Close</Button>
        );

    return (
        <Modal open onClose={onClose} title={`Refund · ${r.order.reference}`} description={`${r.order.user?.name} · ${r.order.vendor?.name} · requested ${timeAgo(r.created_at)}`} footer={footer}>
            <div className="grid gap-4 text-sm">
                <div className="bg-subtle grid gap-1 rounded-lg border p-3">
                    <div><b>{label(r.reason)}</b>{r.items?.length ? `: ${r.items.join(', ')}` : ''}</div>
                    {r.note && <div className="text-muted-foreground">“{r.note}”</div>}
                    <div className="text-muted-foreground text-xs">Order total {zig(r.order.total_zig)} · already refunded {zig(r.order.refunded_zig)}</div>
                </div>
                {r.evidence_path && <img src={r.evidence_path} alt="Customer photo" className="max-h-64 w-full rounded-lg object-cover" />}
                {r.status === 'requested' && (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Amount" hint={`Max ${zig(max)} · ≈ ${usd((Number(amount) || 0) / r.order.zig_per_usd)}`}><Input type="number" step="0.01" prefix="ZiG" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                            <Field label="Refund to"><Select value={destination} onChange={(e) => setDestination(e.target.value as Refund['destination'])}><option value="wallet">Zvino wallet</option><option value="original">{label(r.order.payment_method)}</option></Select></Field>
                        </div>
                        <Field label="Note to customer (required to reject)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[64px]" /></Field>
                    </>
                )}
                {r.status === 'approved' && <Field label="EcoCash / Paynow reversal reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>}
            </div>
        </Modal>
    );
}

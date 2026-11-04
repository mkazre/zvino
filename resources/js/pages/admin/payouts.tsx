import { Button } from '@/components/ui/button';
import { Card, DataTable, Field, Grid, Input, Modal, Page, PageHeader, Segmented, StatCard, StatusPill, TabBar, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { router } from '@inertiajs/react';
import { Banknote, Bike, RefreshCw, Store } from 'lucide-react';
import { useState } from 'react';

interface Payout { id: number; account_type: 'vendor' | 'driver'; account_id: number; account_name: string; amount_zig: number; period_start: string; period_end: string; status: string; method: string | null; reference: string | null; paid_at: string | null; is_instant: boolean; fee_zig: number; payout_details: Record<string, string> | null }
interface Props {
    payouts: { data: Payout[]; links: PageLink[] };
    filters: { status: string; type?: string };
    summary: { pending_zig: number; paid_30d_zig: number; unbatched_vendors_zig: number; unbatched_drivers_zig: number; driver_cash_held_zig: number };
    schedule: { frequency: string; day: string; min: number };
}

export default function Payouts({ payouts, filters, summary, schedule }: Props) {
    const [paying, setPaying] = useState<Payout | null>(null);
    const go = (p: Record<string, string | undefined>) => router.get('/admin/payouts', { ...filters, ...p }, { preserveState: true });

    const columns: Column<Payout>[] = [
        { key: 'who', header: 'Payee', cell: (p) => <span className="flex items-center gap-2.5"><span className="bg-muted flex size-8 items-center justify-center rounded-lg">{p.account_type === 'vendor' ? <Store className="size-4" /> : <Bike className="size-4" />}</span><span><span className="block font-semibold">{p.account_name}</span><span className="text-muted-foreground text-xs">{label(p.account_type === 'vendor' ? 'store' : 'driver')}</span>{p.is_instant && <span className="bg-gold/15 text-gold ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase">Instant · today</span>}</span></span> },
        { key: 'period', header: 'Period', hideOnMobile: true, cell: (p) => <span className="text-[13px]">{new Date(p.period_start).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })} – {new Date(p.period_end).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}</span> },
        { key: 'method', header: 'Pay to', hideOnMobile: true, cell: (p) => <span className="text-[13px]">{label(p.method ?? 'ecocash')}{p.payout_details?.number && <span className="text-muted-foreground block font-mono text-xs">{p.payout_details.number}</span>}</span> },
        { key: 'amount', header: 'Amount', align: 'right', sort: (p) => p.amount_zig, cell: (p) => <span className="tabular font-semibold">{zig(p.amount_zig)}{p.fee_zig > 0 && <span className="text-muted-foreground block text-[11px] font-normal">fee {zig(p.fee_zig)}</span>}</span> },
        { key: 'status', header: 'Status', cell: (p) => <div><StatusPill status={p.status} />{p.reference && <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">{p.reference}</div>}</div> },
        { key: 'act', header: '', align: 'right', cell: (p) => p.status === 'pending' && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setPaying(p); }}>Mark paid</Button> },
    ];

    return (
        <AdminLayout title="Payouts">
            <Page wide>
                <PageHeader title="Payouts" description={`Stores and drivers are paid ${schedule.frequency}${schedule.frequency !== 'daily' ? ` on ${label(schedule.day)}` : ''}. Balances under ${zig(schedule.min)} roll over.`}
                    actions={<Button variant="dark" onClick={() => router.post('/admin/payouts/generate')}><RefreshCw /> Generate payouts now</Button>} />
                <Grid cols={4}>
                    <StatCard tone="inverse" label="Ready to pay" value={zig(summary.pending_zig)} icon={Banknote} />
                    <StatCard label="Owed to stores (not yet batched)" value={zig(summary.unbatched_vendors_zig)} icon={Store} />
                    <StatCard label="Owed to drivers (not yet batched)" value={zig(summary.unbatched_drivers_zig)} icon={Bike} />
                    <StatCard label="Cash held by drivers" value={zig(summary.driver_cash_held_zig)} hint="From cash-on-delivery orders" />
                </Grid>
                <TabBar value={filters.status} onChange={(s) => go({ status: s })} options={['pending', 'paid', 'all'].map((s) => ({ value: s, label: label(s) }))} />
                <Card>
                    <Toolbar><Segmented size="sm" value={filters.type ?? ''} onChange={(t) => go({ type: t || undefined })} options={[{ value: '', label: 'Everyone' }, { value: 'vendor', label: 'Stores' }, { value: 'driver', label: 'Drivers' }]} /></Toolbar>
                    <DataTable rows={payouts.data} columns={columns} links={payouts.links} />
                </Card>
            </Page>
            {paying && <PaidModal p={paying} onClose={() => setPaying(null)} />}
        </AdminLayout>
    );
}

function PaidModal({ p, onClose }: { p: Payout; onClose: () => void }) {
    const [reference, setReference] = useState('');
    return (
        <Modal open onClose={onClose} title={`Pay ${p.account_name}`} description={`Send ${zig(p.amount_zig)} via ${label(p.method ?? 'ecocash')}, then record the transaction reference here.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!reference} onClick={() => router.post(`/admin/payouts/${p.id}/paid`, { reference }, { onSuccess: onClose })}>Confirm paid</Button></>}>
            {p.payout_details && <div className="bg-subtle mb-4 rounded-lg border p-3 font-mono text-sm">{Object.entries(p.payout_details).map(([k, v]) => <div key={k}><span className="text-muted-foreground">{label(k)}:</span> {v}</div>)}</div>}
            <Field label="Transaction reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. MP240512.1532.A12345" /></Field>
        </Modal>
    );
}

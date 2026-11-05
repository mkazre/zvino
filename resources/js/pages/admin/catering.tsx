import { Button } from '@/components/ui/button';
import { Badge, Card, DataTable, Field, Input, Modal, Page, PageHeader, StatusPill, TabBar, Textarea, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { router, useForm } from '@inertiajs/react';
import { CookingPot } from 'lucide-react';
import { useState } from 'react';

interface Catering {
    id: number; reference: string; event_type: string; event_at: string; headcount: number; location: string;
    contact_name: string | null; contact_phone: string | null; notes: string | null; status: string;
    quote_zig: number | null; quote_note: string | null; deposit_pct: number; deposit_zig: number; paid_zig: number; amount_due_zig: number;
    vendor: { id: number; name: string } | null; customer: { name: string | null; phone: string | null } | null;
    lines: { item_id: number; quantity: number; name: string | null }[];
}

const when = (d: string) => new Date(d).toLocaleString('en-ZW', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Funeral, wedding and gathering catering: quote, track deposits, complete. */
export default function CateringPage({ rows, filters }: { rows: { data: Catering[]; links: PageLink[] }; filters: { status: string } }) {
    const [open, setOpen] = useState<Catering | null>(null);
    const columns: Column<Catering>[] = [
        { key: 'event', header: 'Event', cell: (c) => <span><span className="block font-semibold">{label(c.event_type)} · {c.headcount} people</span><span className="text-muted-foreground text-xs">{when(c.event_at)} · {c.location}</span></span> },
        { key: 'store', header: 'Store', hideOnMobile: true, cell: (c) => c.vendor?.name },
        { key: 'who', header: 'Customer', hideOnMobile: true, cell: (c) => <span className="text-[13px]">{c.contact_name ?? c.customer?.name}<span className="text-muted-foreground block text-xs">{c.contact_phone}</span></span> },
        { key: 'money', header: 'Quote / paid', align: 'right', cell: (c) => <span className="tabular">{c.quote_zig ? zig(c.quote_zig) : '—'}<span className="text-muted-foreground block text-xs">paid {zig(c.paid_zig)}</span></span> },
        { key: 'status', header: 'Status', cell: (c) => <StatusPill status={c.status} /> },
    ];
    return (
        <AdminLayout title="Catering">
            <Page>
                <PageHeader title="Catering" description="Funerals, weddings, church and company events. Quote, collect a deposit, then the balance before the day." />
                <TabBar value={filters.status} onChange={(s) => router.get('/admin/catering', { status: s }, { preserveState: true })} options={['open', 'requested', 'quoted', 'deposit_paid', 'paid', 'completed', 'all'].map((s) => ({ value: s, label: label(s) }))} />
                <Card>
                    {rows.data.length === 0 ? <div className="text-muted-foreground p-10 text-center text-sm"><CookingPot className="mx-auto mb-2 size-6" />No catering requests here.</div> : <DataTable rows={rows.data} columns={columns} links={rows.links} onRowClick={setOpen} />}
                </Card>
            </Page>
            {open && <CateringModal c={open} onClose={() => setOpen(null)} />}
        </AdminLayout>
    );
}

function CateringModal({ c, onClose }: { c: Catering; onClose: () => void }) {
    const { data, setData, post, processing, errors, transform } = useForm({ action: 'quote', quote_zig: c.quote_zig ?? '', deposit_pct: c.deposit_pct, note: c.quote_note ?? '' });
    const act = (action: string) => {
        transform((d) => ({ ...d, action }));
        post(`/admin/catering/${c.id}`, { preserveScroll: true, onSuccess: onClose });
    };
    const open = ['requested', 'quoted'].includes(c.status);
    return (
        <Modal open onClose={onClose} title={`${label(c.event_type)} · ${c.reference}`} description={`${c.headcount} people · ${when(c.event_at)} · ${c.vendor?.name}`}
            footer={<>
                {['requested', 'quoted', 'deposit_paid', 'paid'].includes(c.status) && <Button variant="outline" className="text-zred mr-auto" disabled={processing} onClick={() => act('decline')}>Decline & refund</Button>}
                {['deposit_paid', 'paid'].includes(c.status) && <Button variant="outline" disabled={processing} onClick={() => act('complete')}>Mark delivered</Button>}
                {open && <Button disabled={processing || !data.quote_zig} onClick={() => act('quote')}>{c.status === 'quoted' ? 'Update quote' : 'Send quote'}</Button>}
            </>}>
            <div className="grid gap-4 text-sm">
                <div className="bg-subtle grid gap-1 rounded-lg p-3">
                    <div><b>Where:</b> {c.location}</div>
                    <div><b>Contact:</b> {c.contact_name} {c.contact_phone}</div>
                    {c.notes && <div><b>Notes:</b> {c.notes}</div>}
                    {c.lines.length > 0 && <div><b>Asked for:</b> {c.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')}</div>}
                    {c.paid_zig > 0 && <div><Badge tone="success">Paid {zig(c.paid_zig)}</Badge> {c.amount_due_zig > 0 && <span className="text-muted-foreground">· {zig(c.amount_due_zig)} still due</span>}</div>}
                </div>
                {open && (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Total price" error={errors.quote_zig}><Input type="number" prefix="ZiG" value={data.quote_zig} onChange={(e) => setData('quote_zig', e.target.value)} /></Field>
                        <Field label="Deposit"><Input type="number" suffix="%" value={data.deposit_pct} onChange={(e) => setData('deposit_pct', Number(e.target.value))} /></Field>
                    </div>
                )}
                <Field label={open ? 'Message with the quote' : 'Note'} optional><Textarea value={data.note} onChange={(e) => setData('note', e.target.value)} placeholder="Menu, serving staff, what’s included…" /></Field>
            </div>
        </Modal>
    );
}

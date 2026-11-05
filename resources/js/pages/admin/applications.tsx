import { Badge, Card, DataTable, Page, PageHeader, SearchInput, Segmented, StatusPill, TabBar, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { timeAgo } from '@/lib/money';
import { type PageLink } from '@/types';
import { router } from '@inertiajs/react';
import { Bike, Building2, ClipboardCheck, Paperclip, Store } from 'lucide-react';
import { useState } from 'react';

interface Row {
    id: number;
    reference: string;
    type: 'restaurant' | 'driver' | 'corporate';
    type_label: string;
    status: string;
    title: string;
    contact_name: string;
    email: string | null;
    phone: string | null;
    city: string | null;
    created_at: string;
    documents_count: number;
}

export const STATUS_LABEL: Record<string, string> = { draft: 'New (draft)', in_review: 'In review', needs_info: 'Waiting on applicant', approved: 'Approved', rejected: 'Rejected' };
export const TYPE_ICON = { restaurant: Store, driver: Bike, corporate: Building2 };

export default function Applications({ applications, filters, counts, typeCounts }: { applications: { data: Row[]; links: PageLink[] }; filters: { type: string | null; status: string; q: string }; counts: Record<string, number>; typeCounts: Record<string, number> }) {
    const [q, setQ] = useState(filters.q ?? '');
    const go = (p: Record<string, string | null | undefined>) => router.get('/admin/applications', { ...filters, ...p }, { preserveState: true, replace: true });

    const columns: Column<Row>[] = [
        {
            key: 'name', header: 'Applicant', sort: (a) => a.title,
            cell: (a) => {
                const Icon = TYPE_ICON[a.type];
                return (
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg"><Icon className="size-4" /></span>
                        <div className="min-w-0"><div className="truncate font-semibold">{a.title}</div><div className="text-muted-foreground truncate text-xs">{a.type === 'driver' ? a.phone : `${a.contact_name}${a.phone ? ` · ${a.phone}` : ''}`}</div></div>
                    </div>
                );
            },
        },
        { key: 'ref', header: 'Reference', hideOnMobile: true, cell: (a) => <span className="font-mono text-xs">{a.reference}</span> },
        { key: 'type', header: 'Type', hideOnMobile: true, cell: (a) => <span className="text-[13px]">{a.type_label}</span> },
        { key: 'city', header: 'City', hideOnMobile: true, cell: (a) => <span className="text-[13px]">{a.city ?? '–'}</span> },
        { key: 'docs', header: 'Docs', align: 'right', hideOnMobile: true, cell: (a) => <span className="text-muted-foreground inline-flex items-center gap-1 text-[13px]"><Paperclip className="size-3.5" />{a.documents_count}</span> },
        { key: 'when', header: 'Submitted', sort: (a) => a.created_at, cell: (a) => <span className="text-muted-foreground text-[13px]" title={new Date(a.created_at).toLocaleString('en-ZW')}>{timeAgo(a.created_at)}</span> },
        { key: 'status', header: 'Status', cell: (a) => <StatusPill status={a.status} label={STATUS_LABEL[a.status]} /> },
    ];

    return (
        <AdminLayout title="Applications">
            <Page wide>
                <PageHeader title="Applications" description="Restaurants, shops, drivers and companies that signed up on the website. New ones arrive as drafts: review the details and documents, then approve." />
                <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={filters.type ?? 'all'} onChange={(v) => go({ type: v === 'all' ? null : v })} options={[
                        { value: 'all', label: 'All' },
                        { value: 'restaurant', label: `Restaurants & shops${typeCounts.restaurant ? ` (${typeCounts.restaurant})` : ''}` },
                        { value: 'driver', label: `Drivers${typeCounts.driver ? ` (${typeCounts.driver})` : ''}` },
                        { value: 'corporate', label: `Corporate${typeCounts.corporate ? ` (${typeCounts.corporate})` : ''}` },
                    ]} />
                    {counts.open > 0 && <Badge tone="warning">{counts.open} waiting for review</Badge>}
                </div>
                <TabBar value={filters.status} onChange={(s) => go({ status: s })} options={[['open', 'To review'], ['draft', 'New'], ['in_review', 'In review'], ['needs_info', 'Waiting on applicant'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']].map(([v, l]) => ({ value: v, label: l, count: counts[v] ?? 0 }))} />
                <Card>
                    <Toolbar><SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Name, reference, phone or email" className="w-full sm:w-80" /></Toolbar>
                    <DataTable rows={applications.data} columns={columns} links={applications.links} onRowClick={(a) => router.visit(`/admin/applications/${a.id}`)}
                        empty={<div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm"><ClipboardCheck className="size-6" />No applications here.<span className="text-xs">Sign-up links: /partners/apply · /drive/apply · /business/apply</span></div>} />
                </Card>
            </Page>
        </AdminLayout>
    );
}

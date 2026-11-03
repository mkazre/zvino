import { Avatar, Card, DataTable, Page, PageHeader, SearchInput, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label } from '@/lib/money';
import { type PageLink } from '@/types';
import { router } from '@inertiajs/react';
import { useState } from 'react';

interface Log {
    id: number;
    action: string;
    subject_type: string | null;
    subject_id: number | null;
    changes: Record<string, unknown> | null;
    ip: string | null;
    created_at: string;
    user?: { name: string; role: string } | null;
}

const LINKS: Record<string, string> = { order: '/admin/orders/', vendor: '/admin/vendors/', driver: '/admin/drivers/', user: '/admin/users/' };

export default function Audit({ logs, filters }: { logs: { data: Log[]; links: PageLink[] }; filters: { q?: string } }) {
    const [q, setQ] = useState(filters.q ?? '');
    const columns: Column<Log>[] = [
        { key: 'when', header: 'When', width: '170px', cell: (l) => <span className="tabular text-muted-foreground text-[13px]">{new Date(l.created_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}</span> },
        { key: 'who', header: 'Who', cell: (l) => (l.user ? <span className="flex items-center gap-2"><Avatar name={l.user.name} size={24} /><span className="text-[13px] font-medium">{l.user.name}</span><span className="text-muted-foreground text-xs">{label(l.user.role)}</span></span> : <span className="text-muted-foreground text-[13px]">System</span>) },
        { key: 'what', header: 'Action', cell: (l) => <span className="font-mono text-[12.5px]">{l.action}</span> },
        {
            key: 'subject',
            header: 'Subject',
            cell: (l) =>
                l.subject_type ? (LINKS[l.subject_type] ? <a href={`${LINKS[l.subject_type]}${l.subject_id}`} className="text-[13px] hover:underline">{label(l.subject_type)} #{l.subject_id}</a> : <span className="text-[13px]">{label(l.subject_type)} #{l.subject_id}</span>) : <span className="text-muted-foreground">–</span>,
        },
        { key: 'changes', header: 'Details', cell: (l) => <code className="text-muted-foreground block max-w-md truncate text-[11.5px]">{l.changes ? JSON.stringify(l.changes) : ''}</code> },
    ];
    return (
        <AdminLayout title="Audit log">
            <Page wide>
                <PageHeader title="Audit log" description="Every sensitive change: settings, refunds, payouts, permissions, bans, exports." />
                <Card>
                    <Toolbar><SearchInput value={q} onChange={setQ} onSubmit={() => router.get('/admin/audit', { q }, { preserveState: true })} placeholder="Filter by action, e.g. refund, settings" className="w-80" /></Toolbar>
                    <DataTable rows={logs.data} columns={columns} links={logs.links} dense />
                </Card>
            </Page>
        </AdminLayout>
    );
}

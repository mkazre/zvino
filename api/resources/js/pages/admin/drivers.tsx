import { Avatar, Badge, Card, DataTable, Page, PageHeader, SearchInput, Stars, StatusPill, TabBar, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { router } from '@inertiajs/react';
import { Bike } from 'lucide-react';
import { useState } from 'react';

interface Driver {
    id: number;
    status: string;
    vehicle_type: string;
    vehicle_plate: string | null;
    is_online: boolean;
    rating: number;
    rating_count: number;
    completed_deliveries: number;
    acceptance_rate: number;
    location_updated_at: string | null;
    pending_docs: number;
    balance_zig: number;
    cash_held_zig: number;
    created_at: string;
    user: { name: string; phone: string; avatar_path?: string };
    zone?: { name: string } | null;
}

export default function Drivers({ drivers, counts, filters }: { drivers: { data: Driver[]; links: PageLink[] }; counts: Record<string, number>; filters: { status: string; q?: string } }) {
    const [q, setQ] = useState(filters.q ?? '');
    const go = (p: Record<string, string | undefined>) => router.get('/admin/drivers', { ...filters, ...p }, { preserveState: true, replace: true });

    const columns: Column<Driver>[] = [
        {
            key: 'name', header: 'Driver', sort: (d) => d.user.name,
            cell: (d) => (
                <div className="flex items-center gap-3">
                    <div className="relative"><Avatar name={d.user.name} src={d.user.avatar_path} size={34} />{d.is_online && <span className="bg-brand ring-surface absolute right-0 bottom-0 size-2.5 rounded-full ring-2" />}</div>
                    <div><div className="font-semibold">{d.user.name}</div><div className="text-muted-foreground text-xs">{d.user.phone}</div></div>
                </div>
            ),
        },
        { key: 'vehicle', header: 'Vehicle', hideOnMobile: true, cell: (d) => <div className="text-[13px]"><div>{label(d.vehicle_type)}</div><div className="text-muted-foreground font-mono text-xs">{d.vehicle_plate ?? '–'}</div></div> },
        { key: 'zone', header: 'Zone', hideOnMobile: true, cell: (d) => <span className="text-[13px]">{d.zone?.name ?? '–'}</span> },
        { key: 'rating', header: 'Rating', sort: (d) => d.rating, cell: (d) => (d.rating_count ? <Stars value={d.rating} count={d.rating_count} /> : <span className="text-muted-foreground text-xs">New</span>) },
        { key: 'trips', header: 'Trips', align: 'right', sort: (d) => d.completed_deliveries, cell: (d) => <span className="tabular">{d.completed_deliveries}</span> },
        { key: 'accept', header: 'Acceptance', align: 'right', hideOnMobile: true, sort: (d) => d.acceptance_rate, cell: (d) => <span className={d.acceptance_rate < 70 ? 'text-zred tabular font-semibold' : 'tabular'}>{Math.round(d.acceptance_rate)}%</span> },
        { key: 'cash', header: 'Cash held', align: 'right', hideOnMobile: true, sort: (d) => d.cash_held_zig, cell: (d) => (d.cash_held_zig > 0 ? <span className="tabular text-gold font-semibold">{zig(d.cash_held_zig)}</span> : <span className="text-muted-foreground">–</span>) },
        {
            key: 'status', header: 'Status',
            cell: (d) => (
                <div className="flex flex-col items-start gap-1">
                    <StatusPill status={d.is_online && d.status === 'approved' ? 'online' : d.status} />
                    {d.pending_docs > 0 && <Badge tone="warning">{d.pending_docs} doc{d.pending_docs > 1 ? 's' : ''} to check</Badge>}
                    {d.status === 'applied' && <span className="text-muted-foreground text-[11px]">Applied {timeAgo(d.created_at)}</span>}
                </div>
            ),
        },
    ];

    return (
        <AdminLayout title="Drivers">
            <Page wide>
                <PageHeader title="Drivers" description="Your delivery fleet: applications, documents, performance and cash." />
                <TabBar value={filters.status ?? 'all'} onChange={(s) => go({ status: s })} options={[['all', 'All'], ['online', 'Online now'], ['applied', 'Applications'], ['approved', 'Approved'], ['suspended', 'Suspended']].map(([v, l]) => ({ value: v, label: l, count: counts[v] ?? 0 }))} />
                <Card>
                    <Toolbar><SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Name, phone or plate" className="w-72" /></Toolbar>
                    <DataTable rows={drivers.data} columns={columns} links={drivers.links} onRowClick={(d) => router.visit(`/admin/drivers/${d.id}`)}
                        empty={<div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm"><Bike className="size-6" />No drivers here yet. Drivers apply from the Zvino Driver app.</div>} />
                </Card>
            </Page>
        </AdminLayout>
    );
}

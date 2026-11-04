import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, DataTable, Grid, Page, PageHeader, SearchInput, Segmented, Select, StatCard, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { timeAgo, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { router } from '@inertiajs/react';
import { Download, Users } from 'lucide-react';
import { useState } from 'react';

interface Customer {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    created_at: string;
    banned_at: string | null;
    marketing_opt_in: boolean;
    orders_count: number;
    spend_zig: number | null;
    last_order_at: string | null;
    loyalty?: { tier: string; points: number } | null;
}

interface Props {
    customers: { data: Customer[]; links: PageLink[]; total: number; from: number; to: number };
    filters: { q?: string; tier?: string; segment?: string };
    tiers: string[];
    stats: { total: number; new_30d: number; active_30d: number; zvino_plus: number };
}

const TIER_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'dark'> = { Bronze: 'neutral', Silver: 'neutral', Gold: 'warning', Platinum: 'dark' };

export default function Customers({ customers, filters, tiers, stats }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const go = (p: Record<string, string | undefined>) => router.get('/admin/users', { ...filters, ...p }, { preserveState: true, replace: true });

    const columns: Column<Customer>[] = [
        { key: 'name', header: 'Customer', sort: (c) => c.name, cell: (c) => <div className="flex items-center gap-3"><Avatar name={c.name || c.phone} size={32} /><div><div className="font-semibold">{c.name || <span className="text-muted-foreground font-normal">No name yet</span>}{c.banned_at && <Badge tone="danger" className="ml-2">Blocked</Badge>}</div><div className="text-muted-foreground text-xs">{c.phone}</div></div></div> },
        { key: 'tier', header: 'Tier', cell: (c) => <Badge tone={TIER_TONE[c.loyalty?.tier ?? 'Bronze']}>{c.loyalty?.tier ?? 'Bronze'}</Badge> },
        { key: 'orders', header: 'Orders', align: 'right', sort: (c) => c.orders_count, cell: (c) => <span className="tabular">{c.orders_count}</span> },
        { key: 'spend', header: 'Lifetime spend', align: 'right', sort: (c) => c.spend_zig ?? 0, cell: (c) => <span className="tabular font-medium">{zig(c.spend_zig ?? 0)}</span> },
        { key: 'last', header: 'Last order', hideOnMobile: true, sort: (c) => c.last_order_at ?? '', cell: (c) => <span className="text-muted-foreground text-[13px]">{c.last_order_at ? timeAgo(c.last_order_at) : 'Never'}</span> },
        { key: 'joined', header: 'Joined', hideOnMobile: true, sort: (c) => c.created_at, cell: (c) => <span className="text-muted-foreground text-[13px]">{new Date(c.created_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' })}</span> },
    ];

    return (
        <AdminLayout title="Customers">
            <Page wide>
                <PageHeader title="Customers" description="Everyone who orders on Zvino." actions={<Button variant="outline" size="sm" asChild><a href={`/admin/users/export?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][])}`}><Download /> Export CSV</a></Button>} />
                <Grid cols={4}>
                    <StatCard label="Total customers" value={stats.total.toLocaleString()} icon={Users} />
                    <StatCard label="New (30 days)" value={stats.new_30d.toLocaleString()} />
                    <StatCard label="Ordered (30 days)" value={stats.active_30d.toLocaleString()} hint={stats.total ? `${Math.round((stats.active_30d / stats.total) * 100)}% of customers` : undefined} />
                    <StatCard label="Zvino+ members" value={stats.zvino_plus.toLocaleString()} />
                </Grid>
                <Card>
                    <Toolbar>
                        <SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Name, phone or email" className="w-72" />
                        <Segmented size="sm" value={filters.segment ?? 'all'} onChange={(s) => go({ segment: s === 'all' ? undefined : s })} options={[{ value: 'all', label: 'All' }, { value: 'new', label: 'New' }, { value: 'vip', label: 'VIP (10+)' }, { value: 'lapsed', label: 'Lapsed' }, { value: 'banned', label: 'Blocked' }]} />
                        <Select value={filters.tier ?? ''} onChange={(e) => go({ tier: e.target.value || undefined })} className="h-9 w-auto">
                            <option value="">All tiers</option>
                            {tiers.map((t) => <option key={t}>{t}</option>)}
                        </Select>
                    </Toolbar>
                    <DataTable rows={customers.data} columns={columns} links={customers.links} onRowClick={(c) => router.visit(`/admin/users/${c.id}`)} footer={customers.total ? `${customers.from}–${customers.to} of ${customers.total.toLocaleString()}` : undefined} />
                </Card>
            </Page>
        </AdminLayout>
    );
}

import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, DataTable, Money, Page, PageHeader, SearchInput, Select, StatusPill, TabBar, Toolbar, type Column } from '@/components/z';
import { useLiveOrders } from '@/hooks/use-live-orders';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, zig } from '@/lib/money';
import { type Order, type PageLink, type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { Bike, CalendarClock, Download, Footprints, ReceiptText, Store } from 'lucide-react';
import { useState } from 'react';

interface Props {
    orders: { data: (Order & { driver?: { name: string } | null; scheduled_for?: string })[]; meta: { links: PageLink[]; total: number; from: number; to: number } };
    counts: Record<string, number>;
    filters: { status: string; q?: string; source?: string; payment?: string; vendor_id?: string; from?: string; to?: string };
    vendors: { id: number; name: string }[];
    today: { orders: number; gmv: number };
}

const TABS = ['all', 'active', 'placed', 'preparing', 'ready', 'picked_up', 'scheduled', 'delivered', 'cancelled'];

export default function Orders({ orders, counts, filters, vendors, today }: Props) {
    const { auth, platformMode } = usePage<SharedData>().props;
    const [q, setQ] = useState(filters.q ?? '');
    useLiveOrders(auth.user.vendor_id ?? vendors[0]?.id, ['orders', 'counts']);

    const go = (p: Partial<Props['filters']>) => router.get('/admin/orders', { ...filters, ...p }, { preserveState: true, preserveScroll: true, replace: true });

    const columns: Column<Props['orders']['data'][number]>[] = [
        {
            key: 'ref',
            header: 'Order',
            sort: (o) => o.id,
            cell: (o) => (
                <div>
                    <div className="font-mono text-[13px] font-semibold">{o.reference}</div>
                    <div className="text-muted-foreground mt-0.5 flex items-center gap-1 text-xs">
                        {o.fulfilment === 'delivery' ? <Bike className="size-3" /> : o.fulfilment === 'pickup' ? <Footprints className="size-3" /> : <Store className="size-3" />}
                        {label(o.fulfilment)}
                        {o.source === 'pos' && <Badge className="ml-1 h-4 px-1.5 text-[10px]">POS</Badge>}
                    </div>
                </div>
            ),
        },
        {
            key: 'customer',
            header: 'Customer',
            cell: (o) => (
                <div className="flex items-center gap-2.5">
                    <Avatar name={o.customer?.name || 'Walk in'} size={28} />
                    <div className="min-w-0">
                        <div className="truncate font-medium">{o.customer?.name || 'Walk-in'}</div>
                        <div className="text-muted-foreground truncate text-xs">{o.customer?.phone}</div>
                    </div>
                </div>
            ),
        },
        ...(platformMode === 'marketplace' && !auth.user.vendor_id ? [{ key: 'store', header: 'Store', hideOnMobile: true, cell: (o: Order) => <span className="font-medium">{o.vendor?.name}</span> }] : []),
        {
            key: 'placed',
            header: 'Placed',
            sort: (o) => o.created_at,
            hideOnMobile: true,
            cell: (o) => (
                <div className="text-[13px]">
                    <div>{timeAgo(o.created_at)}</div>
                    {o.scheduled_for && (
                        <div className="text-info mt-0.5 flex items-center gap-1 text-xs">
                            <CalendarClock className="size-3" /> {new Date(o.scheduled_for).toLocaleString('en-ZW', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                </div>
            ),
        },
        { key: 'driver', header: 'Driver', hideOnMobile: true, cell: (o) => (o.fulfilment !== 'delivery' ? <span className="text-muted-foreground">–</span> : o.driver ? <span className="text-[13px]">{o.driver.name}</span> : ['accepted', 'preparing', 'ready'].includes(o.status) ? <Badge tone="danger">Unassigned</Badge> : <span className="text-muted-foreground">–</span>) },
        { key: 'payment', header: 'Payment', hideOnMobile: true, cell: (o) => <div className="text-[13px]"><div>{label(o.payment_method)}</div><StatusPill status={o.payment_status} /></div> },
        { key: 'total', header: 'Total', align: 'right', sort: (o) => o.totals.total.zig, cell: (o) => <Money zig={o.totals.total.zig} usd={o.totals.total.usd} size="sm" /> },
        { key: 'status', header: 'Status', cell: (o) => <StatusPill status={o.status} /> },
    ];

    return (
        <AdminLayout title="Orders">
            <Page wide>
                <PageHeader
                    title="Orders"
                    description={`${today.orders} orders today · ${zig(today.gmv)} paid`}
                    actions={
                        <Button variant="outline" size="sm" asChild>
                            <a href={`/admin/orders/export?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()}`}>
                                <Download /> Export CSV
                            </a>
                        </Button>
                    }
                />

                <TabBar value={filters.status ?? 'all'} onChange={(status) => go({ status })} options={TABS.map((t) => ({ value: t, label: t === 'picked_up' ? 'On the way' : label(t), count: counts[t] ?? 0 }))} />

                <Card>
                    <Toolbar>
                        <SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Reference, customer or phone" className="w-full sm:w-72" />
                        {vendors.length > 1 && (
                            <Select value={filters.vendor_id ?? ''} onChange={(e) => go({ vendor_id: e.target.value || undefined })} className="h-9 w-auto">
                                <option value="">All stores</option>
                                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </Select>
                        )}
                        <Select value={filters.source ?? ''} onChange={(e) => go({ source: e.target.value || undefined })} className="h-9 w-auto">
                            <option value="">All channels</option>
                            <option value="app">App</option>
                            <option value="web">Website</option>
                            <option value="pos">POS</option>
                        </Select>
                        <Select value={filters.payment ?? ''} onChange={(e) => go({ payment: e.target.value || undefined })} className="h-9 w-auto">
                            <option value="">All payments</option>
                            {['ecocash', 'onemoney', 'innbucks', 'card', 'wallet', 'cash'].map((m) => <option key={m} value={m}>{label(m)}</option>)}
                        </Select>
                        <input type="date" value={filters.from ?? ''} onChange={(e) => go({ from: e.target.value || undefined })} className="border-input bg-surface h-9 rounded-lg border px-2.5 text-sm" aria-label="From" />
                        <input type="date" value={filters.to ?? ''} onChange={(e) => go({ to: e.target.value || undefined })} className="border-input bg-surface h-9 rounded-lg border px-2.5 text-sm" aria-label="To" />
                    </Toolbar>
                    <DataTable
                        rows={orders.data}
                        columns={columns}
                        onRowClick={(o) => router.visit(`/admin/orders/${o.id}`)}
                        links={orders.meta.links}
                        footer={orders.meta.total ? `Showing ${orders.meta.from}–${orders.meta.to} of ${orders.meta.total}` : undefined}
                        rowClassName={(o) => (o.status === 'placed' ? 'bg-info/[0.04]' : undefined)}
                        empty={<div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm"><ReceiptText className="size-6" />No orders match these filters.</div>}
                    />
                </Card>
            </Page>
        </AdminLayout>
    );
}

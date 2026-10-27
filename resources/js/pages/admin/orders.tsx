import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, StatusBadge, Tabs, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { label, timeAgo, usd, zig } from '@/lib/money';
import { type Order, type PageLink, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

interface Props {
    orders: { data: Order[]; meta: { links: PageLink[]; total: number } };
    counts: Record<string, number>;
    filters: { status: string; q: string | null; source: string | null };
    statuses: string[];
}

const NEXT: Record<string, string> = { placed: 'accepted', accepted: 'preparing', preparing: 'ready', ready: 'picked_up', picked_up: 'delivered' };

export default function Orders({ orders, counts, filters, statuses }: Props) {
    const { auth } = usePage<SharedData>().props;
    const canManage = auth.user.role !== 'cashier';
    const [q, setQ] = useState(filters.q ?? '');
    const [open, setOpen] = useState<Order | null>(null);

    const go = (params: Partial<Props['filters']>) => router.get('/admin/orders', { ...filters, ...params }, { preserveState: true, replace: true });
    const tabs = ['all', 'active', ...statuses].map((s) => ({ value: s, label: label(s), count: counts[s] ?? 0 }));

    return (
        <AppLayout breadcrumbs={[{ title: 'Orders', href: '/admin/orders' }]}>
            <Head title="Orders" />
            <div className="flex flex-col gap-4 p-4 md:p-6">
                <PageHeader title="Orders" subtitle={`${orders.meta.total} orders`} />

                <div className="flex flex-wrap items-center gap-3">
                    <Tabs value={filters.status} options={tabs} onChange={(status) => go({ status })} />
                    <form onSubmit={(e) => { e.preventDefault(); go({ q }); }} className="ml-auto flex gap-2">
                        <input className={fieldClass} placeholder="Ref, name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
                        <select className={`${fieldClass} w-28`} value={filters.source ?? ''} onChange={(e) => go({ source: e.target.value || null })}>
                            <option value="">All sources</option>
                            <option value="app">App</option>
                            <option value="pos">POS</option>
                        </select>
                    </form>
                </div>

                <Panel>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                                <tr>
                                    {['Order', 'Customer', 'Vendor', 'Placed', 'Payment', 'Total', 'Status', ''].map((h) => (
                                        <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {orders.data.map((o) => (
                                    <tr key={o.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => setOpen(o)}>
                                        <td className="px-4 py-3 font-mono font-semibold">
                                            {o.reference}
                                            <div className="text-muted-foreground font-sans text-xs font-normal">{label(o.source)} · {label(o.fulfilment)}</div>
                                        </td>
                                        <td className="px-4 py-3">{o.customer?.name || <span className="text-muted-foreground">Walk-in</span>}</td>
                                        <td className="px-4 py-3">{o.vendor?.name}</td>
                                        <td className="text-muted-foreground px-4 py-3 whitespace-nowrap">{timeAgo(o.created_at)}</td>
                                        <td className="px-4 py-3">
                                            <div>{label(o.payment_method)}</div>
                                            <StatusBadge status={o.payment_status} />
                                        </td>
                                        <td className="px-4 py-3 font-semibold whitespace-nowrap tabular-nums">
                                            {zig(o.totals.total.zig)}
                                            <div className="text-muted-foreground text-xs font-normal">{usd(o.totals.total.usd)}</div>
                                        </td>
                                        <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                            {canManage && NEXT[o.status] && (
                                                <Button size="sm" variant="outline" onClick={() => router.patch(`/admin/orders/${o.id}/status`, { status: NEXT[o.status] }, { preserveScroll: true })}>
                                                    → {label(NEXT[o.status])}
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {orders.data.length === 0 && <Empty>No orders match these filters.</Empty>}
                    </div>
                    <Pagination links={orders.meta.links} />
                </Panel>
            </div>

            <OrderDialog order={open} onClose={() => setOpen(null)} canManage={canManage} statuses={statuses} />
        </AppLayout>
    );
}

export function Pagination({ links }: { links: PageLink[] }) {
    if (links.length <= 3) return null;
    return (
        <div className="flex flex-wrap justify-end gap-1 border-t p-3">
            {links.map((l, i) => (
                <Link
                    key={i}
                    href={l.url ?? '#'}
                    preserveState
                    className={`rounded px-2.5 py-1 text-sm ${l.active ? 'bg-primary text-primary-foreground' : l.url ? 'hover:bg-muted' : 'text-muted-foreground pointer-events-none'}`}
                    dangerouslySetInnerHTML={{ __html: l.label }}
                />
            ))}
        </div>
    );
}

function OrderDialog({ order, onClose, canManage, statuses }: { order: Order | null; onClose: () => void; canManage: boolean; statuses: string[] }) {
    const [rider, setRider] = useState({ name: '', phone: '' });
    if (!order) return null;

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="font-mono">{order.reference}</span> <StatusBadge status={order.status} />
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                    <div className="text-muted-foreground">
                        {order.customer?.name || 'Walk-in'} {order.customer?.phone && `· ${order.customer.phone}`} · {order.vendor?.name}
                    </div>
                    <ul className="divide-y rounded-lg border">
                        {order.items?.map((i, idx) => (
                            <li key={idx} className="flex justify-between gap-3 px-3 py-2">
                                <div>
                                    <span className="font-semibold">{i.quantity}×</span> {i.name}
                                    {(i.options?.variant || i.options?.modifiers?.length) && (
                                        <div className="text-muted-foreground text-xs">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(', ')}</div>
                                    )}
                                </div>
                                <span className="tabular-nums">{zig(i.line_total.zig)}</span>
                            </li>
                        ))}
                    </ul>
                    <dl className="grid grid-cols-2 gap-y-1">
                        {(['subtotal', 'delivery', 'service', 'discount', 'total'] as const).map((k) => (
                            <div key={k} className={`contents ${k === 'total' ? 'font-bold' : ''}`}>
                                <dt>{label(k)}</dt>
                                <dd className="text-right tabular-nums">
                                    {k === 'discount' && order.totals[k].zig > 0 ? '−' : ''}
                                    {zig(order.totals[k].zig)} <span className="text-muted-foreground text-xs font-normal">{usd(order.totals[k].usd)}</span>
                                </dd>
                            </div>
                        ))}
                    </dl>
                    {canManage && order.fulfilment === 'delivery' && !order.rider && (
                        <div className="flex gap-2">
                            <input className={fieldClass} placeholder="Rider name" value={rider.name} onChange={(e) => setRider({ ...rider, name: e.target.value })} />
                            <input className={fieldClass} placeholder="Rider phone" value={rider.phone} onChange={(e) => setRider({ ...rider, phone: e.target.value })} />
                            <Button size="sm" disabled={!rider.name} onClick={() => router.patch(`/admin/orders/${order.id}/status`, { status: 'picked_up', rider_name: rider.name, rider_phone: rider.phone }, { onSuccess: onClose })}>
                                Dispatch
                            </Button>
                        </div>
                    )}
                    {order.rider && <div>🛵 {order.rider.name} {order.rider.phone}</div>}
                    {canManage && (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                            {statuses.filter((s) => s !== order.status).map((s) => (
                                <Button key={s} size="sm" variant={s === 'cancelled' ? 'destructive' : 'outline'} onClick={() => router.patch(`/admin/orders/${order.id}/status`, { status: s }, { onSuccess: onClose })}>
                                    {label(s)}
                                </Button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

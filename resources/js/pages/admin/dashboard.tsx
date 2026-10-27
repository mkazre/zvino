import { Button } from '@/components/ui/button';
import { Empty, PageHeader, Panel, StatCard, StatusBadge, fieldClass } from '@/components/zvino';
import { useLiveOrders } from '@/hooks/use-live-orders';
import AppLayout from '@/layouts/app-layout';
import { timeAgo, usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Order, type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

interface Props {
    kpis: { revenue_today: number; revenue_change_pct: number | null; orders_today: number; active_orders: number; avg_order: number; customers: number; active_vendors: number };
    series: { day: string; revenue: number; orders: number }[];
    liveOrders: { data: Order[] };
    topVendors: { name: string; rating: number; revenue: number; orders: number }[];
    platformMode: 'single' | 'marketplace';
    singleVendorId: number | null;
    vendors: { id: number; name: string }[];
}

export default function Dashboard({ kpis, series, liveOrders, topVendors, platformMode, singleVendorId, vendors }: Props) {
    const { auth, zigPerUsd } = usePage<SharedData>().props;
    const isSuper = auth.user.role === 'super_admin';
    useLiveOrders(auth.user.vendor_id ?? vendors[0]?.id, ['kpis', 'liveOrders']);

    const max = Math.max(1, ...series.map((s) => s.revenue));

    return (
        <AppLayout breadcrumbs={[{ title: 'Dashboard', href: '/dashboard' }]}>
            <Head title="Dashboard" />
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <PageHeader
                    title={`Mhoro, ${auth.user.name.split(' ')[0]} 👋`}
                    subtitle={new Date().toLocaleDateString('en-ZW', { weekday: 'long', day: 'numeric', month: 'long' })}
                    actions={isSuper && <PlatformModeSwitch mode={platformMode} singleVendorId={singleVendorId} vendors={vendors} />}
                />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        tone="brand"
                        label="Revenue today"
                        value={zig(kpis.revenue_today)}
                        hint={
                            <>
                                {usd(kpis.revenue_today / zigPerUsd)}
                                {kpis.revenue_change_pct !== null && ` · ${kpis.revenue_change_pct >= 0 ? '▲' : '▼'} ${Math.abs(kpis.revenue_change_pct)}% vs yesterday`}
                            </>
                        }
                    />
                    <StatCard label="Orders today" value={kpis.orders_today} hint={`Avg ${zig(kpis.avg_order)}`} />
                    <StatCard label="Active right now" value={kpis.active_orders} hint="Placed → on the way" />
                    <StatCard
                        label={platformMode === 'marketplace' ? 'Active vendors' : 'Customers'}
                        value={platformMode === 'marketplace' ? kpis.active_vendors : kpis.customers}
                        hint={platformMode === 'marketplace' ? `${kpis.customers} customers` : undefined}
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Panel title="Revenue · last 14 days" className="lg:col-span-2">
                        <div className="flex h-56 items-end gap-1.5 px-4 pt-6 pb-2">
                            {series.map((s) => (
                                <div key={s.day} className="group relative flex h-full flex-1 flex-col justify-end">
                                    <div
                                        className="bg-brand/85 group-hover:bg-brand min-h-[2px] rounded-t transition"
                                        style={{ height: `${(s.revenue / max) * 100}%` }}
                                    />
                                    <div className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded px-2 py-1 text-xs whitespace-nowrap group-hover:block">
                                        {new Date(s.day).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}: {zig(s.revenue)} · {s.orders} orders
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="text-muted-foreground flex justify-between px-4 pb-3 text-xs">
                            <span>{new Date(series[0]?.day).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}</span>
                            <span>Today</span>
                        </div>
                    </Panel>

                    <Panel title={platformMode === 'marketplace' ? 'Top vendors · 30 days' : 'Top performance · 30 days'}>
                        {topVendors.length === 0 && <Empty>No paid orders yet.</Empty>}
                        <ul className="divide-y">
                            {topVendors.map((v, i) => (
                                <li key={v.name} className="flex items-center gap-3 px-4 py-3">
                                    <span className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-full text-xs font-bold">{i + 1}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{v.name}</div>
                                        <div className="text-muted-foreground text-xs">
                                            {v.orders} orders · ★ {v.rating}
                                        </div>
                                    </div>
                                    <div className="text-sm font-semibold tabular-nums">{zig(v.revenue)}</div>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                </div>

                <Panel
                    title="Live orders"
                    action={
                        <Link href="/admin/orders?status=active" className="text-primary text-sm font-medium">
                            View all →
                        </Link>
                    }
                >
                    {liveOrders.data.length === 0 && <Empty>No active orders right now.</Empty>}
                    <div className="divide-y">
                        {liveOrders.data.map((o) => (
                            <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                                <span className="w-24 font-mono font-semibold">{o.reference}</span>
                                <span className="min-w-32 flex-1 truncate">
                                    {o.customer?.name || 'Walk-in'} <span className="text-muted-foreground">· {o.vendor?.name}</span>
                                </span>
                                <span className="text-muted-foreground text-xs">{timeAgo(o.created_at)}</span>
                                <span className="w-28 text-right font-semibold tabular-nums">{zig(o.totals.total.zig)}</span>
                                <StatusBadge status={o.status} />
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </AppLayout>
    );
}

function PlatformModeSwitch({ mode, singleVendorId, vendors }: { mode: Props['platformMode']; singleVendorId: number | null; vendors: Props['vendors'] }) {
    const [vendorId, setVendorId] = useState(singleVendorId ?? vendors[0]?.id);
    const set = (m: Props['platformMode']) => {
        if (m === 'single' && !confirm('Switch to single-restaurant mode? The app will only show the selected restaurant.')) return;
        router.post('/admin/settings/platform-mode', { mode: m, single_vendor_id: vendorId }, { preserveScroll: true });
    };

    return (
        <div className="bg-card flex flex-wrap items-center gap-2 rounded-xl border p-1.5">
            {(['marketplace', 'single'] as const).map((m) => (
                <Button key={m} size="sm" variant={mode === m ? 'default' : 'ghost'} onClick={() => mode !== m && set(m)} className={cn(mode !== m && 'text-muted-foreground')}>
                    {m === 'marketplace' ? 'Marketplace' : 'Single restaurant'}
                </Button>
            ))}
            {mode === 'single' && (
                <select className={cn(fieldClass, 'h-8 w-auto')} value={vendorId} onChange={(e) => {
                    setVendorId(Number(e.target.value));
                    router.post('/admin/settings/platform-mode', { mode: 'single', single_vendor_id: e.target.value }, { preserveScroll: true });
                }}>
                    {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.name}
                        </option>
                    ))}
                </select>
            )}
        </div>
    );
}

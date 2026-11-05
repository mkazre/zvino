import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, EmptyState, Grid, LiveDot, Money, Page, PageHeader, Segmented, StatCard, StatusPill, Thumb, Stars, Modal, Select, Field } from '@/components/z';
import { useLiveOrders } from '@/hooks/use-live-orders';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Order, type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { AlertTriangle, ArrowRight, Bike, Clock, Info, ReceiptText, ShoppingBag, Store, Users, Zap } from 'lucide-react';
import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Props {
    range: number;
    kpis: { gmv_today: number; gmv_change: number | null; orders_today: number; orders_change: number | null; aov_30d: number; avg_delivery_min: number; customers: number; new_customers_7d: number; cancel_rate_7d: number };
    series: { day: string; gmv: number; orders: number; net: number }[];
    live: { placed: number; preparing: number; ready: number; on_the_way: number; scheduled: number };
    fleet: { online: number; busy: number; unassigned: number; applications: number } | null;
    stores: { open: number; closed: number; busy: number; power_out: number };
    alerts: { tone: 'warning' | 'danger' | 'info'; text: string; href: string }[];
    liveOrders: { data: Order[] };
    topVendors: { id: number; name: string; logo: string | null; rating: number; gmv: number; orders: number }[];
    payments: { payment_method: string; c: number; gmv: number }[];
    platformMode: 'single' | 'marketplace';
    singleVendorId: number | null;
    vendors: { id: number; name: string }[];
}

const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Mangwanani' : h < 17 ? 'Masikati' : 'Manheru';
};

export default function Dashboard(p: Props) {
    const { auth, zigPerUsd, can } = usePage<SharedData>().props;
    useLiveOrders(auth.user.vendor_id ?? p.vendors[0]?.id, ['kpis', 'live', 'liveOrders', 'fleet', 'alerts']);
    const [modeOpen, setModeOpen] = useState(false);
    const totalPay = p.payments.reduce((s, x) => s + x.gmv, 0) || 1;

    return (
        <AdminLayout title="Dashboard">
            <Page wide>
                <PageHeader
                    eyebrow={new Date().toLocaleDateString('en-ZW', { weekday: 'long', day: 'numeric', month: 'long' })}
                    title={`${greeting()}, ${auth.user.name.split(' ')[0]}`}
                    description="Here’s how Zvino is doing right now."
                    actions={
                        <>
                            {can.includes('settings.manage') && (
                                <Button variant="outline" size="sm" onClick={() => setModeOpen(true)}>
                                    <Store /> {p.platformMode === 'marketplace' ? 'Marketplace' : 'Single restaurant'}
                                </Button>
                            )}
                            <Button variant="dark" size="sm" asChild>
                                <Link href="/admin/orders?status=active">
                                    <ReceiptText /> Live orders
                                </Link>
                            </Button>
                        </>
                    }
                />

                {p.alerts.length > 0 && (
                    <div className="grid gap-2 md:grid-cols-2">
                        {p.alerts.map((a, i) => (
                            <Link
                                key={i}
                                href={a.href}
                                className={cn(
                                    'group flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition hover:shadow-(--shadow-card)',
                                    a.tone === 'danger' && 'border-zred/20 bg-zred-50 text-zred dark:bg-zred/10',
                                    a.tone === 'warning' && 'border-gold/25 bg-gold-50 text-[#7a5a07] dark:bg-gold/10 dark:text-warning',
                                    a.tone === 'info' && 'bg-surface',
                                )}
                            >
                                {a.tone === 'info' ? <Info className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
                                <span className="flex-1">{a.text}</span>
                                <ArrowRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                            </Link>
                        ))}
                    </div>
                )}

                <Grid cols={4}>
                    <StatCard tone="inverse" label="Sales today" value={zig(p.kpis.gmv_today)} delta={p.kpis.gmv_change} hint={`${usd(p.kpis.gmv_today / zigPerUsd)} · vs same time yesterday`} trend={p.series.map((s) => s.gmv)} />
                    <StatCard label="Orders today" value={p.kpis.orders_today} delta={p.kpis.orders_change} hint="vs same time yesterday" icon={ShoppingBag} />
                    <StatCard label="Avg. order value" value={zig(p.kpis.aov_30d)} hint={`${usd(p.kpis.aov_30d / zigPerUsd)} · last 30 days`} icon={Zap} />
                    <StatCard label="Avg. delivery time" value={`${p.kpis.avg_delivery_min || '–'} min`} hint={`${p.kpis.cancel_rate_7d}% cancelled (7d)`} icon={Clock} />
                </Grid>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                    <Card>
                        <CardHeader
                            title="Sales"
                            description={`Delivered orders, last ${p.range} days`}
                            action={<Segmented size="sm" value={String(p.range)} onChange={(v) => router.reload({ data: { range: v }, only: ['series', 'range'] })} options={[7, 14, 30, 90].map((d) => ({ value: String(d), label: `${d}d` }))} />}
                        />
                        <CardBody className="h-[300px] pl-1">
                            <ResponsiveContainer>
                                <AreaChart data={p.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                                            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} stroke="var(--border)" />
                                    <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })} minTickGap={24} />
                                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                                    <Tooltip
                                        cursor={{ stroke: 'var(--border)' }}
                                        content={({ active, payload }) =>
                                            active && payload?.length ? (
                                                <div className="bg-popover rounded-lg border px-3 py-2 text-xs shadow-(--shadow-pop)">
                                                    <div className="mb-1 font-semibold">{new Date(payload[0].payload.day).toLocaleDateString('en-ZW', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                                                    <div className="tabular">Sales: {zig(payload[0].payload.gmv)}</div>
                                                    <div className="tabular text-muted-foreground">Orders: {payload[0].payload.orders}</div>
                                                    <div className="tabular text-muted-foreground">Zvino net: {zig(payload[0].payload.net)}</div>
                                                </div>
                                            ) : null
                                        }
                                    />
                                    <Area type="monotone" dataKey="gmv" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gmv)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardBody>
                    </Card>

                    <Card>
                        <CardHeader title={<span className="flex items-center gap-2"><LiveDot /> Right now</span>} />
                        <CardBody className="grid gap-5">
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    ['Awaiting store', p.live.placed, '/admin/orders?status=placed', p.live.placed > 0],
                                    ['In the kitchen', p.live.preparing, '/admin/orders?status=preparing', false],
                                    ['Ready', p.live.ready, '/admin/orders?status=ready', false],
                                    ['On the way', p.live.on_the_way, '/admin/orders?status=picked_up', false],
                                ].map(([l, n, href, hot]) => (
                                    <Link key={String(l)} href={String(href)} className={cn('hover:border-foreground/20 rounded-lg border p-3 transition', hot && 'border-zred/30 bg-zred-50 dark:bg-zred/10')}>
                                        <div className="tabular text-2xl font-bold">{String(n)}</div>
                                        <div className="text-muted-foreground mt-0.5 text-xs">{String(l)}</div>
                                    </Link>
                                ))}
                            </div>
                            {p.fleet && (
                                <div>
                                    <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
                                        <span className="flex items-center gap-2"><Bike className="size-4" /> Drivers</span>
                                        <Link href="/admin/dispatch" className="text-muted-foreground hover:text-foreground text-xs">Command centre →</Link>
                                    </div>
                                    <div className="bg-muted flex h-2 overflow-hidden rounded-full">
                                        <div className="bg-foreground" style={{ width: `${p.fleet.online ? (p.fleet.busy / p.fleet.online) * 100 : 0}%` }} />
                                        <div className="bg-brand" style={{ width: `${p.fleet.online ? ((p.fleet.online - p.fleet.busy) / p.fleet.online) * 100 : 0}%` }} />
                                    </div>
                                    <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                                        <span><b className="text-foreground">{p.fleet.online}</b> online · {p.fleet.busy} on a job</span>
                                        {p.fleet.unassigned > 0 && <span className="text-zred font-semibold">{p.fleet.unassigned} need a driver</span>}
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className="mb-2 flex items-center gap-2 text-[13px] font-medium"><Store className="size-4" /> Stores</div>
                                <div className="flex flex-wrap gap-1.5">
                                    <Badge tone="success" dot>{p.stores.open} open</Badge>
                                    <Badge dot>{p.stores.closed} closed</Badge>
                                    {p.stores.busy > 0 && <Badge tone="warning" dot>{p.stores.busy} busy</Badge>}
                                    {p.stores.power_out > 0 && <Badge tone="danger" dot>{p.stores.power_out} load-shedding</Badge>}
                                </div>
                            </div>
                        </CardBody>
                    </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                    <Card>
                        <CardHeader title="Live orders" description="Newest first" action={<Link href="/admin/orders?status=active" className="text-muted-foreground hover:text-foreground text-[13px] font-medium">View all</Link>} />
                        {p.liveOrders.data.length === 0 ? (
                            <EmptyState icon={ReceiptText} title="No live orders" description="New orders appear here the moment they’re paid." />
                        ) : (
                            <ul className="divide-y border-t">
                                {p.liveOrders.data.map((o) => (
                                    <li key={o.id}>
                                        <Link href={`/admin/orders/${o.id}`} className="hover:bg-subtle flex items-center gap-4 px-5 py-3 text-sm transition">
                                            <span className="w-[92px] shrink-0 font-mono text-[13px] font-semibold">{o.reference}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium">{o.customer?.name || 'Walk-in'}</span>
                                                <span className="text-muted-foreground block truncate text-xs">{o.vendor?.name} · {label(o.fulfilment)} · {timeAgo(o.created_at)}</span>
                                            </span>
                                            <span className="hidden sm:block"><Money zig={o.totals.total.zig} usd={o.totals.total.usd} size="sm" /></span>
                                            <StatusPill status={o.status} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <div className="grid gap-4">
                        <Card>
                            <CardHeader title={p.platformMode === 'marketplace' ? 'Top stores' : 'Performance'} description="Last 30 days" />
                            <ul className="divide-y border-t">
                                {p.topVendors.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No delivered orders yet.</li>}
                                {p.topVendors.map((v, i) => (
                                    <li key={v.id} className="flex items-center gap-3 px-5 py-2.5">
                                        <span className="text-muted-foreground tabular w-4 text-xs font-semibold">{i + 1}</span>
                                        <Thumb src={v.logo} size={32} rounded="rounded-md" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[13px] font-semibold">{v.name}</span>
                                            <span className="text-muted-foreground text-xs">{v.orders} orders</span>
                                        </span>
                                        <span className="text-right">
                                            <span className="tabular block text-[13px] font-semibold">{zig(v.gmv)}</span>
                                            <Stars value={v.rating} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card>
                            <CardHeader title="How customers pay" description="Last 30 days" />
                            <CardBody className="grid gap-3">
                                {p.payments.length === 0 && <p className="text-muted-foreground text-sm">No payments yet.</p>}
                                {p.payments.map((m) => (
                                    <div key={m.payment_method}>
                                        <div className="mb-1 flex justify-between text-[13px]">
                                            <span className="font-medium">{label(m.payment_method)}</span>
                                            <span className="tabular text-muted-foreground">{Math.round((m.gmv / totalPay) * 100)}%</span>
                                        </div>
                                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                            <div className="bg-foreground h-full rounded-full" style={{ width: `${(m.gmv / totalPay) * 100}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </CardBody>
                        </Card>
                    </div>
                </div>

                <Grid cols={3}>
                    <StatCard label="Customers" value={p.kpis.customers.toLocaleString()} hint={`+${p.kpis.new_customers_7d} this week`} icon={Users} />
                    {p.fleet && <StatCard label="Driver applications" value={p.fleet.applications} hint="Waiting for review" icon={Bike} />}
                    <StatCard label="Scheduled orders" value={p.live.scheduled} hint="Released to stores automatically" icon={Clock} />
                </Grid>
            </Page>

            <PlatformModeModal open={modeOpen} onClose={() => setModeOpen(false)} mode={p.platformMode} singleVendorId={p.singleVendorId} vendors={p.vendors} />
        </AdminLayout>
    );
}

function PlatformModeModal({ open, onClose, mode, singleVendorId, vendors }: { open: boolean; onClose: () => void; mode: Props['platformMode']; singleVendorId: number | null; vendors: Props['vendors'] }) {
    const [next, setNext] = useState(mode);
    const [vendorId, setVendorId] = useState(singleVendorId ?? vendors[0]?.id);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Platform mode"
            description="Marketplace shows every store. Single restaurant turns Zvino into one brand’s own ordering app."
            footer={
                <>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => router.post('/admin/settings-platform-mode', { mode: next, single_vendor_id: vendorId }, { onSuccess: onClose })}>Save</Button>
                </>
            }
        >
            <div className="grid gap-3">
                {(['marketplace', 'single'] as const).map((m) => (
                    <button key={m} onClick={() => setNext(m)} className={cn('rounded-xl border p-4 text-left transition', next === m ? 'border-foreground ring-foreground/10 ring-4' : 'hover:border-foreground/30')}>
                        <div className="font-semibold">{m === 'marketplace' ? 'Marketplace' : 'Single restaurant'}</div>
                        <div className="text-muted-foreground mt-0.5 text-sm">{m === 'marketplace' ? 'Many stores, commission per order, store discovery in the app.' : 'One restaurant, no store list, the app opens straight on its menu.'}</div>
                    </button>
                ))}
                {next === 'single' && (
                    <Field label="Restaurant">
                        <Select value={vendorId} onChange={(e) => setVendorId(Number(e.target.value))}>
                            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </Field>
                )}
            </div>
        </Modal>
    );
}

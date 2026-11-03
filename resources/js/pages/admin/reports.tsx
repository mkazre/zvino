import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, Grid, Page, PageHeader, StatCard } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, usd, zig } from '@/lib/money';
import { router } from '@inertiajs/react';
import { Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Props {
    range: { from: string; to: string };
    kpis: { gmv: number; gmv_usd: number; orders: number; aov: number; commission: number; fees: number; discounts: number; tips: number; refunds: number; driver_pay: number; cancel_rate: number; avg_delivery_minutes: number };
    series: { day: string; orders: number; gmv: number; revenue: number }[];
    byPayment: { payment_method: string; orders: number; gmv: number }[];
    bySource: { source: string; orders: number; gmv: number }[];
    byStore: { vendor_id: number; orders: number; gmv: number; commission: number; vendor?: { name: string } }[];
    byZone: { zone_id: number | null; orders: number; gmv: number; zone?: { name: string } | null }[];
    byHour: Record<string, number>;
    topItems: { name: string; qty: number; revenue: number }[];
}

const PRESETS = [
    ['7d', 6], ['30d', 29], ['90d', 89],
] as const;

export default function Reports(p: Props) {
    const setRange = (from: string, to: string) => router.get('/admin/reports', { from, to }, { preserveState: true });
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const net = p.kpis.commission + p.kpis.fees - p.kpis.driver_pay - p.kpis.refunds;
    const hours = Array.from({ length: 24 }, (_, h) => ({ h: `${h}:00`, orders: p.byHour[h] ?? 0 }));
    const qs = `from=${p.range.from}&to=${p.range.to}`;

    return (
        <AdminLayout title="Reports">
            <Page wide>
                <PageHeader title="Reports" description="Delivered orders only. All amounts in ZiG with USD at the rate on each order’s date."
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            {PRESETS.map(([l, d]) => <Button key={l} size="sm" variant="outline" onClick={() => setRange(iso(new Date(Date.now() - d * 864e5)), iso(new Date()))}>{l}</Button>)}
                            <input type="date" value={p.range.from} onChange={(e) => setRange(e.target.value, p.range.to)} className="border-input bg-surface h-8 rounded-md border px-2 text-[13px]" />
                            <span className="text-muted-foreground">→</span>
                            <input type="date" value={p.range.to} onChange={(e) => setRange(p.range.from, e.target.value)} className="border-input bg-surface h-8 rounded-md border px-2 text-[13px]" />
                            <Button size="sm" variant="dark" asChild><a href={`/admin/reports/export/orders?${qs}`}><Download /> Orders CSV</a></Button>
                            <Button size="sm" variant="outline" asChild><a href={`/admin/reports/export/stores?${qs}`}><Download /> Stores CSV</a></Button>
                        </div>
                    } />

                <Grid cols={4}>
                    <StatCard tone="inverse" label="Gross sales (GMV)" value={zig(p.kpis.gmv)} hint={usd(p.kpis.gmv_usd)} />
                    <StatCard label="Orders" value={p.kpis.orders.toLocaleString()} hint={`Avg ${zig(p.kpis.aov)}`} />
                    <StatCard label="Zvino net revenue" value={zig(net)} hint="Commission + fees − driver pay − refunds" />
                    <StatCard label="Ops health" value={`${p.kpis.avg_delivery_minutes || '–'} min`} hint={`${p.kpis.cancel_rate}% cancelled / rejected`} />
                </Grid>

                <Card>
                    <CardHeader title="Sales & Zvino revenue by day" />
                    <CardBody className="h-[320px] pl-1">
                        <ResponsiveContainer>
                            <ComposedChart data={p.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="var(--border)" />
                                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(d) => new Date(d).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })} minTickGap={24} />
                                <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v)} />
                                <Tooltip formatter={(v, n) => [zig(Number(v)), n === 'gmv' ? 'Sales' : 'Zvino revenue']} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-ZW', { dateStyle: 'medium' })} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }} />
                                <Bar dataKey="gmv" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                                <Line dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </CardBody>
                </Card>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader title="Money breakdown" />
                        <CardBody className="grid gap-2 text-sm">
                            {[['Commission', p.kpis.commission], ['Delivery & service fees', p.kpis.fees], ['Driver pay', -p.kpis.driver_pay], ['Refunds', -p.kpis.refunds], ['Discounts (promos)', -p.kpis.discounts], ['Tips (passed to drivers)', p.kpis.tips]].map(([l, v]) => (
                                <div key={String(l)} className="flex justify-between"><span className="text-muted-foreground">{l}</span><span className={`tabular font-medium ${Number(v) < 0 ? 'text-zred' : ''}`}>{Number(v) < 0 ? '−' : ''}{zig(Math.abs(Number(v)))}</span></div>
                            ))}
                        </CardBody>
                    </Card>
                    <Card>
                        <CardHeader title="Payment methods" />
                        <CardBody className="grid gap-2.5">
                            {p.byPayment.map((m) => (
                                <div key={m.payment_method}>
                                    <div className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{label(m.payment_method)}</span><span className="tabular text-muted-foreground">{m.orders} · {zig(m.gmv)}</span></div>
                                    <div className="bg-muted h-1.5 rounded-full"><div className="bg-foreground h-full rounded-full" style={{ width: `${(m.gmv / (p.kpis.gmv || 1)) * 100}%` }} /></div>
                                </div>
                            ))}
                            <div className="text-muted-foreground mt-2 flex gap-3 border-t pt-3 text-xs">{p.bySource.map((s) => <span key={s.source}>{label(s.source)}: <b className="text-foreground">{s.orders}</b></span>)}</div>
                        </CardBody>
                    </Card>
                    <Card>
                        <CardHeader title="Orders by hour" description="When to schedule drivers" />
                        <CardBody className="h-[200px] pl-0">
                            <ResponsiveContainer>
                                <BarChart data={hours} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <XAxis dataKey="h" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={3} />
                                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} allowDecimals={false} />
                                    <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }} />
                                    <Bar dataKey="orders" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardBody>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <RankCard title="Top stores" rows={p.byStore.map((s) => ({ name: s.vendor?.name ?? '–', a: zig(s.gmv), b: `${s.orders} orders · ${zig(s.commission)} commission` }))} />
                    <RankCard title="Best-selling items" rows={p.topItems.map((i) => ({ name: i.name, a: `${i.qty}×`, b: zig(i.revenue) }))} />
                    <RankCard title="Zones" rows={p.byZone.map((z) => ({ name: z.zone?.name ?? 'No zone', a: zig(z.gmv), b: `${z.orders} orders` }))} />
                </div>
            </Page>
        </AdminLayout>
    );
}

function RankCard({ title, rows }: { title: string; rows: { name: string; a: string; b: string }[] }) {
    return (
        <Card>
            <CardHeader title={title} />
            <ol className="divide-y border-t">
                {rows.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No data for this period.</li>}
                {rows.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <span className="text-muted-foreground tabular w-4 text-xs">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span><span className="text-muted-foreground text-xs">{r.b}</span></span>
                        <span className="tabular font-semibold">{r.a}</span>
                    </li>
                ))}
            </ol>
        </Card>
    );
}

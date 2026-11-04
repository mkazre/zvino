import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardFooter, CardHeader, Field, FormSection, Grid, Input, Page, Select, StatCard, StatusPill, Switch, TabBar, Textarea, Thumb } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, zig } from '@/lib/money';
import { Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, ExternalLink, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';

interface Hour { weekday: number; opens_at: string; closes_at: string }
interface Vendor {
    id: number; name: string; slug: string; cuisine: string | null; kind?: string; description: string | null; city: string; zone_id: number | null; address: string | null; phone: string | null; email: string | null;
    lat: number | null; lng: number | null; status: string; commission_pct: number; prep_minutes: number; price_level: number; delivery_fee_zig: number; min_order_zig: number; delivery_radius_km: number;
    is_featured: boolean; offers_delivery: boolean; offers_pickup: boolean; accepts_scheduled: boolean; accepts_catering?: boolean; auto_accept: boolean; is_busy: boolean; power_out: boolean; logo_path: string | null; cover_path: string | null;
    payout_method: string | null; payout_details: Record<string, string> | null; rating: number; rating_count: number; balance_zig: number;
    hours: Hour[]; closures: { date: string; reason: string | null }[]; staff: { id: number; name: string; email: string; role: string; last_seen_at: string | null }[];
    availability: { is_open: boolean; reason: string | null; prep_minutes: number; next_open_at: string | null };
}
interface Props {
    vendor: Vendor;
    stats: { orders_30d: number; gmv_30d: number; commission_30d: number; rejected_30d: number; avg_prep: number; items: number; unavailable_items: number };
    daily: { day: string; gmv: number; orders: number }[];
    recentOrders: { id: number; reference: string; status: string; total_zig: number; created_at: string; user?: { name: string } }[];
    payouts: { id: number; amount_zig: number; status: string; reference: string | null; period_end: string }[];
    cities: string[];
    zones: { id: number; name: string }[];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function VendorShow(p: Props) {
    const v = p.vendor;
    const [tab, setTab] = useState<'overview' | 'profile' | 'hours' | 'staff'>('overview');

    return (
        <AdminLayout title={v.name}>
            <Page>
                <Link href="/admin/vendors" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" /> Stores</Link>
                <div className="relative overflow-hidden rounded-2xl border">
                    <div className="bg-muted h-36 bg-cover bg-center" style={v.cover_path ? { backgroundImage: `url(${v.cover_path})` } : { backgroundImage: 'linear-gradient(120deg, #222222, var(--color-brand))' }} />
                    <div className="bg-surface flex flex-wrap items-end gap-4 px-6 pb-5">
                        <Thumb src={v.logo_path} size={84} rounded="rounded-2xl" className="-mt-10 border-4 border-[var(--surface)] shadow-md" />
                        <div className="min-w-0 flex-1 pt-3">
                            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight">{v.name}</h1><StatusPill status={v.status} />{v.availability.is_open ? <StatusPill status="open" label="Open now" /> : <StatusPill status={v.availability.reason ?? 'closed'} />}{v.power_out && <StatusPill status="power_out" label="Load-shedding" />}</div>
                            <p className="text-muted-foreground mt-1 text-sm">{v.cuisine} · {v.city} · ★ {v.rating.toFixed(1)} ({v.rating_count}) · prep {v.availability.prep_minutes} min</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" asChild><Link href={`/admin/catalog?vendor_id=${v.id}`}><UtensilsCrossed /> Menu</Link></Button>
                            <Button variant="outline" size="sm" asChild><a href={`/store/${v.slug}`} target="_blank" rel="noreferrer"><ExternalLink /> View on website</a></Button>
                        </div>
                    </div>
                </div>

                <TabBar value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'profile', label: 'Profile & fees' }, { value: 'hours', label: 'Opening hours' }, { value: 'staff', label: 'Staff', count: v.staff.length }]} />

                {tab === 'overview' && (
                    <>
                        <Grid cols={4}>
                            <StatCard label="Sales (30d)" value={zig(p.stats.gmv_30d)} hint={`${p.stats.orders_30d} orders`} />
                            <StatCard label="Zvino commission (30d)" value={zig(p.stats.commission_30d)} hint={`${v.commission_pct}% rate`} />
                            <StatCard label="Avg. prep time" value={`${p.stats.avg_prep || '–'} min`} hint={`${p.stats.rejected_30d} rejected (30d)`} />
                            <StatCard label="Owed to store" value={zig(v.balance_zig)} hint={`${p.stats.unavailable_items}/${p.stats.items} items off`} />
                        </Grid>
                        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                            <Card>
                                <CardHeader title="Daily sales" description="Last 30 days" />
                                <CardBody className="h-56 pl-0">
                                    <ResponsiveContainer>
                                        <BarChart data={p.daily} margin={{ left: 0, right: 8 }}>
                                            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(d) => new Date(d).getDate().toString()} />
                                            <Tooltip formatter={(x) => zig(Number(x))} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('en-ZW', { dateStyle: 'medium' })} contentStyle={{ borderRadius: 10, border: '1px solid var(--border)', fontSize: 12 }} cursor={{ fill: 'var(--muted)' }} />
                                            <Bar dataKey="gmv" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </CardBody>
                            </Card>
                            <Card>
                                <CardHeader title="Recent orders" />
                                <ul className="divide-y border-t">
                                    {p.recentOrders.map((o) => (
                                        <li key={o.id}><Link href={`/admin/orders/${o.id}`} className="hover:bg-subtle flex items-center gap-3 px-5 py-2.5 text-sm"><span className="font-mono text-[13px] font-semibold">{o.reference}</span><span className="text-muted-foreground flex-1 truncate text-xs">{timeAgo(o.created_at)}</span><StatusPill status={o.status} /></Link></li>
                                    ))}
                                </ul>
                            </Card>
                        </div>
                        <Card>
                            <CardHeader title="Payouts" />
                            <ul className="divide-y border-t">
                                {p.payouts.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No payouts yet.</li>}
                                {p.payouts.map((x) => <li key={x.id} className="flex items-center justify-between px-5 py-2.5 text-sm"><span>{new Date(x.period_end).toLocaleDateString('en-ZW', { dateStyle: 'medium' })}</span><span className="tabular font-medium">{zig(x.amount_zig)}</span><StatusPill status={x.status} /></li>)}
                            </ul>
                        </Card>
                    </>
                )}
                {tab === 'profile' && <ProfileForm v={v} cities={p.cities} zones={p.zones} />}
                {tab === 'hours' && <HoursForm v={v} />}
                {tab === 'staff' && (
                    <Card>
                        <CardHeader title="Store staff" description="They sign in to the Zvino Merchant app. Manage accounts in Staff & roles." action={<Button size="sm" variant="outline" asChild><Link href="/admin/staff"><Plus /> Add staff</Link></Button>} />
                        <ul className="divide-y border-t">
                            {v.staff.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No staff yet.</li>}
                            {v.staff.map((s) => <li key={s.id} className="flex items-center gap-3 px-5 py-3"><Avatar name={s.name} size={32} /><div className="flex-1"><div className="text-sm font-semibold">{s.name}</div><div className="text-muted-foreground text-xs">{s.email}</div></div><Badge>{label(s.role)}</Badge><span className="text-muted-foreground w-28 text-right text-xs">{s.last_seen_at ? timeAgo(s.last_seen_at) : 'Never'}</span></li>)}
                        </ul>
                    </Card>
                )}
            </Page>
        </AdminLayout>
    );
}

function ProfileForm({ v, cities, zones }: { v: Vendor; cities: string[]; zones: { id: number; name: string }[] }) {
    const { data, setData, post, processing, errors, isDirty, transform } = useForm({
        name: v.name, cuisine: v.cuisine ?? '', kind: v.kind ?? 'restaurant', description: v.description ?? '', city: v.city, zone_id: v.zone_id ?? '', address: v.address ?? '', phone: v.phone ?? '', email: v.email ?? '',
        lat: v.lat ?? '', lng: v.lng ?? '', status: v.status, commission_pct: v.commission_pct, prep_minutes: v.prep_minutes, price_level: v.price_level, delivery_fee_zig: v.delivery_fee_zig,
        min_order_zig: v.min_order_zig, delivery_radius_km: v.delivery_radius_km, is_featured: v.is_featured, offers_delivery: v.offers_delivery, offers_pickup: v.offers_pickup,
        accepts_scheduled: v.accepts_scheduled, accepts_catering: v.accepts_catering ?? false, auto_accept: v.auto_accept, payout_method: v.payout_method ?? 'ecocash', payout_details: v.payout_details ?? { number: '', name: '' },
        logo: null as File | null, cover: null as File | null,
    });
    const b = (k: keyof typeof data) => (x: boolean) => setData(k, x as never);
    const err = (k: string) => (errors as Record<string, string>)[k];
    const save = () => {
        transform((d) => ({ ...d, ...Object.fromEntries(Object.entries(d).filter(([, x]) => typeof x === 'boolean').map(([k, x]) => [k, x ? 1 : 0])) }));
        post(`/admin/vendors/${v.id}`, { forceFormData: true, preserveScroll: true });
    };

    return (
        <Card>
            <div className="px-6">
                <FormSection title="Brand" description="How the store appears in the apps and website.">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Name" error={err('name')}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                        <Field label="Cuisine"><Input value={data.cuisine} onChange={(e) => setData('cuisine', e.target.value)} /></Field>
                        <Field label="Type of store"><Select value={data.kind} onChange={(e) => setData('kind', e.target.value)}><option value="restaurant">Restaurant</option><option value="grocery">Grocery</option><option value="market">Fresh market</option><option value="pharmacy">Pharmacy</option></Select></Field>
                    </div>
                    <Field label="Description"><Textarea value={data.description} onChange={(e) => setData('description', e.target.value)} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Logo"><input type="file" accept="image/*" className="text-sm" onChange={(e) => setData('logo', e.target.files?.[0] ?? null)} /></Field>
                        <Field label="Cover photo"><input type="file" accept="image/*" className="text-sm" onChange={(e) => setData('cover', e.target.files?.[0] ?? null)} /></Field>
                    </div>
                    <Field label="Price level"><Select value={data.price_level} onChange={(e) => setData('price_level', Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{'$'.repeat(n)}</option>)}</Select></Field>
                    <Switch checked={data.is_featured} onChange={b('is_featured')} label="Featured" description="Shown first in lists and on the home feed." />
                </FormSection>
                <FormSection title="Location & contact">
                    <Field label="Address"><Input value={data.address} onChange={(e) => setData('address', e.target.value)} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="City"><Select value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                        <Field label="Zone"><Select value={data.zone_id} onChange={(e) => setData('zone_id', e.target.value)}><option value="">Auto</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
                        <Field label="Latitude"><Input value={data.lat} onChange={(e) => setData('lat', e.target.value)} /></Field>
                        <Field label="Longitude"><Input value={data.lng} onChange={(e) => setData('lng', e.target.value)} /></Field>
                        <Field label="Phone"><Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} /></Field>
                        <Field label="Email"><Input value={data.email} onChange={(e) => setData('email', e.target.value)} /></Field>
                    </div>
                </FormSection>
                <FormSection title="Ordering" description="Fulfilment options and how orders are handled.">
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Status"><Select value={data.status} onChange={(e) => setData('status', e.target.value)}><option value="active">Active</option><option value="pending">Onboarding</option><option value="suspended">Suspended</option></Select></Field>
                        <Field label="Default prep time"><Input type="number" suffix="min" value={data.prep_minutes} onChange={(e) => setData('prep_minutes', Number(e.target.value))} /></Field>
                        <Field label="Minimum order"><Input type="number" prefix="ZiG" value={data.min_order_zig} onChange={(e) => setData('min_order_zig', Number(e.target.value))} /></Field>
                        <Field label="Delivery radius"><Input type="number" suffix="km" value={data.delivery_radius_km} onChange={(e) => setData('delivery_radius_km', Number(e.target.value))} /></Field>
                        <Field label="Flat delivery fee" hint="Used only if the store is outside every zone."><Input type="number" prefix="ZiG" value={data.delivery_fee_zig} onChange={(e) => setData('delivery_fee_zig', Number(e.target.value))} /></Field>
                    </div>
                    <Switch checked={data.offers_delivery} onChange={b('offers_delivery')} label="Delivery" />
                    <Switch checked={data.offers_pickup} onChange={b('offers_pickup')} label="Pickup" />
                    <Switch checked={data.accepts_scheduled} onChange={b('accepts_scheduled')} label="Scheduled orders" />
                    <Switch checked={data.accepts_catering} onChange={b('accepts_catering')} label="Catering (funerals, weddings, gatherings)" />
                    <Switch checked={data.auto_accept} onChange={b('auto_accept')} label="Auto-accept orders" description="Skip the store confirming each order. Best for high-volume stores with a kitchen screen." />
                </FormSection>
                <FormSection title="Commercials & payouts" description="What Zvino keeps, and where the store’s money goes.">
                    <Field label="Commission"><Input type="number" step="0.5" suffix="%" value={data.commission_pct} onChange={(e) => setData('commission_pct', Number(e.target.value))} className="w-40" /></Field>
                    <div className="grid grid-cols-3 gap-3">
                        <Field label="Payout method"><Select value={data.payout_method} onChange={(e) => setData('payout_method', e.target.value)}><option value="ecocash">EcoCash</option><option value="onemoney">OneMoney</option><option value="innbucks">InnBucks</option><option value="bank">Bank transfer</option></Select></Field>
                        <Field label={data.payout_method === 'bank' ? 'Account number' : 'Mobile number'}><Input value={data.payout_details.number ?? ''} onChange={(e) => setData('payout_details', { ...data.payout_details, number: e.target.value })} /></Field>
                        <Field label="Account name"><Input value={data.payout_details.name ?? ''} onChange={(e) => setData('payout_details', { ...data.payout_details, name: e.target.value })} /></Field>
                    </div>
                    {data.payout_method === 'bank' && <Field label="Bank & branch"><Input value={data.payout_details.bank ?? ''} onChange={(e) => setData('payout_details', { ...data.payout_details, bank: e.target.value })} /></Field>}
                </FormSection>
            </div>
            <CardFooter><Button disabled={processing || !isDirty} onClick={save}>Save store</Button></CardFooter>
        </Card>
    );
}

function HoursForm({ v }: { v: Vendor }) {
    const [hours, setHours] = useState<Hour[]>(v.hours.map((h) => ({ ...h, opens_at: h.opens_at.slice(0, 5), closes_at: h.closes_at.slice(0, 5) })));
    const [closures, setClosures] = useState(v.closures.map((c) => ({ date: c.date.slice(0, 10), reason: c.reason ?? '' })));

    return (
        <Card>
            <div className="px-6">
                <FormSection title="Weekly hours" description="Closing after midnight is fine, e.g. 18:00 – 02:00. Add a second slot for split shifts.">
                    {DAYS.map((name, d) => {
                        const slots = hours.map((h, i) => ({ ...h, i })).filter((h) => h.weekday === d);
                        return (
                            <div key={d} className="flex flex-wrap items-center gap-3 border-b pb-3 last:border-0">
                                <span className="w-28 text-sm font-medium">{name}</span>
                                <div className="flex flex-1 flex-col gap-2">
                                    {slots.length === 0 && <span className="text-muted-foreground text-sm">Closed</span>}
                                    {slots.map((s) => (
                                        <div key={s.i} className="flex items-center gap-2">
                                            <Input type="time" value={s.opens_at} onChange={(e) => setHours(hours.map((h, j) => (j === s.i ? { ...h, opens_at: e.target.value } : h)))} className="w-32" />
                                            <span className="text-muted-foreground">–</span>
                                            <Input type="time" value={s.closes_at} onChange={(e) => setHours(hours.map((h, j) => (j === s.i ? { ...h, closes_at: e.target.value } : h)))} className="w-32" />
                                            <Button size="icon-sm" variant="ghost" onClick={() => setHours(hours.filter((_, j) => j !== s.i))} aria-label="Remove"><Trash2 /></Button>
                                        </div>
                                    ))}
                                </div>
                                <Button size="sm" variant="ghost" onClick={() => setHours([...hours, { weekday: d, opens_at: '08:00', closes_at: '22:00' }])}><Plus /> Add hours</Button>
                            </div>
                        );
                    })}
                </FormSection>
                <FormSection title="Holiday closures" description="Public holidays, stock-take days, family events.">
                    {closures.map((c, i) => (
                        <div key={i} className="flex gap-2">
                            <Input type="date" value={c.date} onChange={(e) => setClosures(closures.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className="w-44" />
                            <Input value={c.reason} placeholder="Reason (optional)" onChange={(e) => setClosures(closures.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
                            <Button size="icon" variant="ghost" onClick={() => setClosures(closures.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                        </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setClosures([...closures, { date: new Date().toISOString().slice(0, 10), reason: '' }])}><Plus /> Add closure</Button>
                </FormSection>
            </div>
            <CardFooter><Button onClick={() => router.put(`/admin/vendors/${v.id}/hours`, { hours, closures } as never, { preserveScroll: true })}>Save hours</Button></CardFooter>
        </Card>
    );
}

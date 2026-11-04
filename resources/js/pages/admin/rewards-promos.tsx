import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, CardHeader, DataTable, Drawer, EmptyState, Field, Grid, Input, Page, PageHeader, Progress, Segmented, Select, StatCard, Switch, TabBar, Textarea, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, zig } from '@/lib/money';
import { Link, router, useForm } from '@inertiajs/react';
import { Crown, Gift, Plus, Share2, Ticket } from 'lucide-react';
import { useState } from 'react';

interface Reward { id: number; name: string; description: string | null; points_cost: number; type: string; config: Record<string, number> | null; is_active: boolean }
interface Promo { id: number; code: string; days?: number[] | null; start_time?: string | null; end_time?: string | null; auto_apply?: boolean; type: 'percent' | 'fixed' | 'free_delivery' | 'bogo'; value: number; min_order_zig: number; max_uses: number | null; used_count: number; starts_at: string | null; ends_at: string | null; is_active: boolean; vendor_id: number | null; vendor?: { name: string } | null }
interface Plan { id: number; name: string; price_zig: number; interval: 'month' | 'year'; min_order_for_free_delivery_zig: number; service_fee_discount_pct: number; perks: string[] | null; is_active: boolean; active_members: number }
interface Props {
    rewards: Reward[];
    promos: Promo[];
    tiers: Record<string, number>;
    pointsPerZig: number;
    members: Record<string, number>;
    plans: Plan[];
    giftCards: { sold: number; value_zig: number; outstanding_zig: number };
    referrals: { total: number; rewarded: number };
    vendors: { id: number; name: string }[];
}

type Tab = 'promos' | 'loyalty' | 'plus' | 'gifts';

export default function RewardsPromos(p: Props) {
    const [tab, setTab] = useState<Tab>('promos');
    const [promo, setPromo] = useState<Promo | 'new' | null>(null);
    const [reward, setReward] = useState<Reward | 'new' | null>(null);
    const [plan, setPlan] = useState<Plan | 'new' | null>(null);
    const totalMembers = Object.values(p.members).reduce((a, b) => a + b, 0);

    const promoCols: Column<Promo>[] = [
        { key: 'code', header: 'Code', cell: (x) => <div><span className="bg-muted rounded-md px-2 py-1 font-mono text-[13px] font-bold tracking-wide">{x.code}</span>{x.vendor && <div className="text-muted-foreground mt-1 text-xs">{x.vendor.name} only</div>}</div> },
        { key: 'offer', header: 'Offer', cell: (x) => <span className="font-medium">{x.type === 'percent' ? `${x.value}% off` : x.type === 'fixed' ? `${zig(x.value)} off` : x.type === 'bogo' ? 'Buy 1 get 1' : 'Free delivery'}{x.start_time && <span className="text-muted-foreground block text-xs">Happy hour {x.start_time}–{x.end_time}</span>}{x.auto_apply && <span className="text-muted-foreground block text-xs">Automatic, no code</span>}</span> },
        { key: 'min', header: 'Min. order', hideOnMobile: true, cell: (x) => <span className="tabular text-[13px]">{x.min_order_zig ? zig(x.min_order_zig) : '–'}</span> },
        { key: 'used', header: 'Redeemed', sort: (x) => x.used_count, cell: (x) => <div className="w-32"><div className="tabular text-[13px]">{x.used_count}{x.max_uses ? ` / ${x.max_uses}` : ''}</div>{x.max_uses && <Progress value={(x.used_count / x.max_uses) * 100} className="mt-1" />}</div> },
        { key: 'ends', header: 'Ends', hideOnMobile: true, cell: (x) => <span className="text-muted-foreground text-[13px]">{x.ends_at ? new Date(x.ends_at).toLocaleDateString('en-ZW', { dateStyle: 'medium' }) : 'No end date'}</span> },
        { key: 'on', header: 'Active', cell: (x) => <span onClick={(e) => e.stopPropagation()}><Switch size="sm" checked={x.is_active} onChange={() => router.patch(`/admin/promos/${x.id}/toggle`, {}, { preserveScroll: true })} /></span> },
    ];

    return (
        <AdminLayout title="Promotions">
            <Page wide>
                <PageHeader title="Promotions & loyalty" description="Everything that brings customers back: codes, points, Zvino+ and gift cards."
                    actions={tab === 'promos' ? <Button onClick={() => setPromo('new')}><Plus /> New promo code</Button> : tab === 'loyalty' ? <Button onClick={() => setReward('new')}><Plus /> New reward</Button> : tab === 'plus' ? <Button onClick={() => setPlan('new')}><Plus /> New plan</Button> : null} />
                <Grid cols={4}>
                    <StatCard label="Active promo codes" value={p.promos.filter((x) => x.is_active).length} hint={`${p.promos.reduce((s, x) => s + x.used_count, 0)} redemptions`} icon={Ticket} />
                    <StatCard label="Loyalty members" value={totalMembers.toLocaleString()} hint={`${p.pointsPerZig} pts per ZiG`} icon={Crown} />
                    <StatCard label="Zvino+ members" value={p.plans.reduce((s, x) => s + x.active_members, 0)} icon={Gift} />
                    <StatCard label="Referrals" value={p.referrals.total} hint={`${p.referrals.rewarded} rewarded`} icon={Share2} />
                </Grid>
                <TabBar value={tab} onChange={setTab} options={[{ value: 'promos', label: 'Promo codes', count: p.promos.length }, { value: 'loyalty', label: 'Loyalty & rewards' }, { value: 'plus', label: 'Zvino+' }, { value: 'gifts', label: 'Gift cards & referrals' }]} />

                {tab === 'promos' && <Card><DataTable rows={p.promos} columns={promoCols} onRowClick={setPromo} empty={<EmptyState icon={Ticket} title="No promo codes yet" description="Create codes like ZVINO20 for first orders or PAYDAY15 for month-end." />} /></Card>}

                {tab === 'loyalty' && (
                    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
                        <Card>
                            <CardHeader title="Redeemable rewards" description="Customers spend points on these in the app." />
                            <ul className="divide-y border-t">
                                {p.rewards.length === 0 && <li className="text-muted-foreground px-5 py-8 text-center text-sm">No rewards yet.</li>}
                                {p.rewards.map((r) => (
                                    <li key={r.id} className="flex items-center gap-4 px-5 py-3">
                                        <span className="bg-gold-50 text-gold dark:bg-gold/15 flex size-10 items-center justify-center rounded-xl"><Gift className="size-5" /></span>
                                        <button className="min-w-0 flex-1 text-left" onClick={() => setReward(r)}><div className="font-semibold">{r.name}</div><div className="text-muted-foreground text-xs">{label(r.type)}{r.type === 'wallet_credit' && r.config?.amount_zig ? ` · ${zig(r.config.amount_zig)}` : ''}</div></button>
                                        <span className="tabular font-bold">{r.points_cost.toLocaleString()} pts</span>
                                        <Switch size="sm" checked={r.is_active} onChange={() => router.patch(`/admin/rewards/${r.id}/toggle`, {}, { preserveScroll: true })} />
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card>
                            <CardHeader title="Tiers" description="Based on lifetime points." action={<Link href="/admin/settings/loyalty" className="text-muted-foreground hover:text-foreground text-[13px] font-medium">Edit</Link>} />
                            <CardBody className="grid gap-3">
                                {Object.entries(p.tiers).map(([tier, pts]) => (
                                    <div key={tier}>
                                        <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{tier} <span className="text-muted-foreground font-normal">· {pts.toLocaleString()}+ pts</span></span><span className="tabular">{p.members[tier] ?? 0}</span></div>
                                        <Progress value={totalMembers ? ((p.members[tier] ?? 0) / totalMembers) * 100 : 0} tone="gold" />
                                    </div>
                                ))}
                            </CardBody>
                        </Card>
                    </div>
                )}

                {tab === 'plus' && (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {p.plans.length === 0 && <Card className="md:col-span-2"><EmptyState icon={Gift} title="No Zvino+ plan yet" description="A monthly membership with free delivery and lower fees, like DashPass." /></Card>}
                        {p.plans.map((pl) => (
                            <Card key={pl.id} className="overflow-hidden">
                                <div className="bg-foreground text-background p-5">
                                    <div className="flex items-center justify-between"><span className="text-lg font-bold">{pl.name}</span>{!pl.is_active && <Badge>Paused</Badge>}</div>
                                    <div className="mt-2"><span className="tabular text-3xl font-bold">{zig(pl.price_zig)}</span><span className="opacity-60"> / {pl.interval}</span></div>
                                </div>
                                <CardBody className="grid gap-2 pt-4 text-sm">
                                    <div>✓ Free delivery on orders over {zig(pl.min_order_for_free_delivery_zig)}</div>
                                    <div>✓ {pl.service_fee_discount_pct}% off service fees</div>
                                    {(pl.perks ?? []).slice(2).map((x) => <div key={x}>✓ {x}</div>)}
                                    <div className="text-muted-foreground mt-2 flex items-center justify-between border-t pt-3 text-xs"><span><b className="text-foreground tabular">{pl.active_members}</b> active members</span><Button size="sm" variant="ghost" onClick={() => setPlan(pl)}>Edit</Button></div>
                                </CardBody>
                            </Card>
                        ))}
                    </div>
                )}

                {tab === 'gifts' && (
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card padded>
                            <div className="text-sm font-semibold">Gift cards</div>
                            <p className="text-muted-foreground mt-1 text-sm">Customers buy cards in the app or website (including “gift a meal” to any phone number). Unredeemed balances are a liability on your books.</p>
                            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                                <div className="bg-subtle rounded-lg p-3"><div className="tabular text-xl font-bold">{p.giftCards.sold}</div><div className="text-muted-foreground text-xs">sold</div></div>
                                <div className="bg-subtle rounded-lg p-3"><div className="tabular text-xl font-bold">{zig(p.giftCards.value_zig)}</div><div className="text-muted-foreground text-xs">value sold</div></div>
                                <div className="bg-subtle rounded-lg p-3"><div className="tabular text-xl font-bold">{zig(p.giftCards.outstanding_zig)}</div><div className="text-muted-foreground text-xs">unredeemed</div></div>
                            </div>
                            <Link href="/admin/settings/loyalty" className="text-primary mt-4 inline-block text-sm font-medium">Card amounts & settings →</Link>
                        </Card>
                        <Card padded>
                            <div className="text-sm font-semibold">Referral programme</div>
                            <p className="text-muted-foreground mt-1 text-sm">Both the referrer and the new customer get wallet credit after the friend’s first delivered order.</p>
                            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                                <div className="bg-subtle rounded-lg p-3"><div className="tabular text-xl font-bold">{p.referrals.total}</div><div className="text-muted-foreground text-xs">friends invited</div></div>
                                <div className="bg-subtle rounded-lg p-3"><div className="tabular text-xl font-bold">{p.referrals.total ? Math.round((p.referrals.rewarded / p.referrals.total) * 100) : 0}%</div><div className="text-muted-foreground text-xs">converted</div></div>
                            </div>
                            <Link href="/admin/settings/loyalty" className="text-primary mt-4 inline-block text-sm font-medium">Reward amounts →</Link>
                        </Card>
                    </div>
                )}
            </Page>
            {promo && <PromoDrawer promo={promo === 'new' ? null : promo} vendors={p.vendors} onClose={() => setPromo(null)} />}
            {reward && <RewardDrawer reward={reward === 'new' ? null : reward} onClose={() => setReward(null)} />}
            {plan && <PlanDrawer plan={plan === 'new' ? null : plan} onClose={() => setPlan(null)} />}
        </AdminLayout>
    );
}

function PromoDrawer({ promo, vendors, onClose }: { promo: Promo | null; vendors: Props['vendors']; onClose: () => void }) {
    const { data, setData, post, processing, errors, transform } = useForm({
        code: promo?.code ?? '', type: promo?.type ?? 'percent', value: promo?.value ?? 15, min_order_zig: promo?.min_order_zig ?? 0, max_uses: promo?.max_uses ?? '',
        vendor_id: promo?.vendor_id ?? '', starts_at: promo?.starts_at?.slice(0, 10) ?? '', ends_at: promo?.ends_at?.slice(0, 10) ?? '', is_active: promo?.is_active ?? true,
        start_time: promo?.start_time ?? '', end_time: promo?.end_time ?? '', days: (promo?.days ?? []) as number[], auto_apply: promo?.auto_apply ?? false,
    });
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return (
        <Drawer open onClose={onClose} title={promo ? `Edit ${promo.code}` : 'New promo code'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => { transform((d) => ({ ...d, start_time: d.start_time || null, end_time: d.end_time || null, days: d.days.length ? d.days : null })); post(promo ? `/admin/promos/${promo.id}` : '/admin/promos', { onSuccess: onClose }); }}>Save</Button></>}>
            <div className="grid gap-4">
                <Field label="Code" error={errors.code}><Input value={data.code} onChange={(e) => setData('code', e.target.value.toUpperCase().replace(/\s/g, ''))} className="font-mono text-lg tracking-wider uppercase" placeholder="PAYDAY15" /></Field>
                <Field label="Offer"><Segmented value={data.type} onChange={(v) => setData('type', v)} options={[{ value: 'percent', label: '% off' }, { value: 'fixed', label: 'ZiG off' }, { value: 'free_delivery', label: 'Free delivery' }]} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    {data.type !== 'free_delivery' && <Field label="Value"><Input type="number" value={data.value} onChange={(e) => setData('value', Number(e.target.value))} prefix={data.type === 'fixed' ? 'ZiG' : undefined} suffix={data.type === 'percent' ? '%' : undefined} /></Field>}
                    <Field label="Minimum order"><Input type="number" prefix="ZiG" value={data.min_order_zig} onChange={(e) => setData('min_order_zig', Number(e.target.value))} /></Field>
                    <Field label="Total uses" optional><Input type="number" value={data.max_uses} onChange={(e) => setData('max_uses', e.target.value)} placeholder="Unlimited" /></Field>
                    <Field label="Store" optional><Select value={data.vendor_id} onChange={(e) => setData('vendor_id', e.target.value)}><option value="">All stores (Zvino pays)</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name} (store pays)</option>)}</Select></Field>
                    <Field label="Starts" optional><Input type="date" value={data.starts_at} onChange={(e) => setData('starts_at', e.target.value)} /></Field>
                    <Field label="Ends" optional error={errors.ends_at}><Input type="date" value={data.ends_at} onChange={(e) => setData('ends_at', e.target.value)} /></Field>
                </div>
                <div className="grid gap-3 rounded-lg border p-3">
                    <div className="text-sm font-semibold">Happy hour <span className="text-muted-foreground font-normal">(optional)</span></div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="From"><Input type="time" value={data.start_time} onChange={(e) => setData('start_time', e.target.value)} /></Field>
                        <Field label="Until" error={(errors as Record<string, string>).end_time}><Input type="time" value={data.end_time} onChange={(e) => setData('end_time', e.target.value)} /></Field>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <Button key={d} type="button" size="sm" variant={data.days.includes(i + 1) ? 'dark' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setData('days', data.days.includes(i + 1) ? data.days.filter((x) => x !== i + 1) : [...data.days, i + 1])}>{d}</Button>)}</div>
                    <p className="text-muted-foreground text-xs">No days selected = every day.</p>
                </div>
                <Switch checked={data.auto_apply} onChange={(v) => setData('auto_apply', v)} label="Apply automatically" description="Customers get it without typing the code, and it’s shown on the store page." />
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Active" />
            </div>
        </Drawer>
    );
}

function RewardDrawer({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: reward?.name ?? '', description: reward?.description ?? '', points_cost: reward?.points_cost ?? 200, type: reward?.type ?? 'wallet_credit', config: reward?.config ?? { amount_zig: 20 }, is_active: reward?.is_active ?? true });
    return (
        <Drawer open onClose={onClose} title={reward ? 'Edit reward' : 'New reward'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post(`/admin/rewards${reward ? `/${reward.id}` : ''}`, { onSuccess: onClose })}>Save</Button></>}>
            <div className="grid gap-4">
                <Field label="Name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="ZiG 20 wallet credit" /></Field>
                <Field label="Description" optional><Textarea value={data.description} onChange={(e) => setData('description', e.target.value)} className="min-h-[64px]" /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Points cost"><Input type="number" suffix="pts" value={data.points_cost} onChange={(e) => setData('points_cost', Number(e.target.value))} /></Field>
                    <Field label="Type"><Select value={data.type} onChange={(e) => setData('type', e.target.value)}>{['wallet_credit', 'free_delivery', 'free_item', 'discount'].map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
                </div>
                {data.type === 'wallet_credit' && <Field label="Credit amount"><Input type="number" prefix="ZiG" value={data.config.amount_zig ?? 0} onChange={(e) => setData('config', { amount_zig: Number(e.target.value) })} /></Field>}
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Available to redeem" />
            </div>
        </Drawer>
    );
}

function PlanDrawer({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
    const { data, setData, post, processing } = useForm({ name: plan?.name ?? 'Zvino+', price_zig: plan?.price_zig ?? 99, interval: plan?.interval ?? 'month', min_order_for_free_delivery_zig: plan?.min_order_for_free_delivery_zig ?? 80, service_fee_discount_pct: plan?.service_fee_discount_pct ?? 50, perks: plan?.perks ?? [], is_active: plan?.is_active ?? true });
    return (
        <Drawer open onClose={onClose} title={plan ? `Edit ${plan.name}` : 'New Zvino+ plan'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post(`/admin/plans${plan ? `/${plan.id}` : ''}`, { onSuccess: onClose })}>Save plan</Button></>}>
            <div className="grid gap-4">
                <Field label="Plan name"><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Price"><Input type="number" prefix="ZiG" value={data.price_zig} onChange={(e) => setData('price_zig', Number(e.target.value))} /></Field>
                    <Field label="Billed every"><Segmented value={data.interval} onChange={(v) => setData('interval', v)} options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]} /></Field>
                    <Field label="Free delivery over"><Input type="number" prefix="ZiG" value={data.min_order_for_free_delivery_zig} onChange={(e) => setData('min_order_for_free_delivery_zig', Number(e.target.value))} /></Field>
                    <Field label="Service fee discount"><Input type="number" suffix="%" value={data.service_fee_discount_pct} onChange={(e) => setData('service_fee_discount_pct', Number(e.target.value))} /></Field>
                </div>
                <Field label="Perks shown to customers" hint="One per line"><Textarea value={data.perks.join('\n')} onChange={(e) => setData('perks', e.target.value.split('\n').filter(Boolean))} /></Field>
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Open for new members" />
            </div>
        </Drawer>
    );
}

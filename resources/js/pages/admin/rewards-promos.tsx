import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, StatCard, Switch, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { label, zig } from '@/lib/money';
import { Head, router, useForm } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface Reward { id: number; name: string; description: string | null; points_cost: number; type: string; config: Record<string, number> | null; is_active: boolean }
interface Promo { id: number; code: string; type: 'percent' | 'fixed' | 'free_delivery'; value: number; min_order_zig: number; max_uses: number | null; used_count: number; ends_at: string | null; is_active: boolean; vendor?: { name: string } | null }

interface Props {
    rewards: Reward[];
    promos: Promo[];
    tiers: Record<string, number>;
    pointsPerZig: number;
    members: Record<string, number>;
}

export default function RewardsPromos({ rewards, promos, tiers, pointsPerZig, members }: Props) {
    const [reward, setReward] = useState<Reward | 'new' | null>(null);
    const [promo, setPromo] = useState<Promo | 'new' | null>(null);

    return (
        <AppLayout breadcrumbs={[{ title: 'Rewards & promos', href: '/admin/rewards-promos' }]}>
            <Head title="Rewards & promos" />
            <div className="flex flex-col gap-5 p-4 md:p-6">
                <PageHeader title="Rewards & promos" subtitle={`Customers earn ${pointsPerZig} points per ZiG spent (${Math.round(1 / pointsPerZig)} ZiG = 1 point).`} />

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(tiers).map(([tier, threshold]) => (
                        <StatCard key={tier} label={`${tier} tier`} value={members[tier] ?? 0} hint={`${threshold.toLocaleString()}+ lifetime points`} />
                    ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <Panel title="Redeemable rewards" action={<Button size="sm" onClick={() => setReward('new')}><Plus /> Reward</Button>}>
                        {rewards.length === 0 && <Empty>No rewards yet.</Empty>}
                        <ul className="divide-y">
                            {rewards.map((r) => (
                                <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                                    <span className="bg-gold/15 text-gold flex size-9 items-center justify-center rounded-full text-base">🎁</span>
                                    <button className="min-w-0 flex-1 text-left" onClick={() => setReward(r)}>
                                        <div className="font-medium">{r.name}</div>
                                        <div className="text-muted-foreground text-xs">{label(r.type)}</div>
                                    </button>
                                    <span className="font-semibold tabular-nums">{r.points_cost} pts</span>
                                    <Switch checked={r.is_active} onChange={() => router.patch(`/admin/rewards/${r.id}/toggle`, {}, { preserveScroll: true })} />
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    <Panel title="Promo codes" action={<Button size="sm" onClick={() => setPromo('new')}><Plus /> Promo</Button>}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                                    <tr>{['Code', 'Discount', 'Min order', 'Used', 'Ends', 'Active'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
                                </thead>
                                <tbody className="divide-y">
                                    {promos.map((p) => (
                                        <tr key={p.id} className="hover:bg-muted/40">
                                            <td className="px-4 py-3"><button className="font-mono font-semibold hover:underline" onClick={() => setPromo(p)}>{p.code}</button>{p.vendor && <div className="text-muted-foreground text-xs">{p.vendor.name}</div>}</td>
                                            <td className="px-4 py-3">{p.type === 'percent' ? `${p.value}%` : p.type === 'fixed' ? zig(p.value) : 'Free delivery'}</td>
                                            <td className="px-4 py-3 tabular-nums">{p.min_order_zig ? zig(p.min_order_zig) : '—'}</td>
                                            <td className="px-4 py-3 tabular-nums">{p.used_count}{p.max_uses ? ` / ${p.max_uses}` : ''}</td>
                                            <td className="text-muted-foreground px-4 py-3">{p.ends_at ? new Date(p.ends_at).toLocaleDateString('en-ZW') : 'Never'}</td>
                                            <td className="px-4 py-3"><Switch checked={p.is_active} onChange={() => router.patch(`/admin/promos/${p.id}/toggle`, {}, { preserveScroll: true })} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {promos.length === 0 && <Empty>No promo codes yet.</Empty>}
                        </div>
                    </Panel>
                </div>
            </div>

            {reward && <RewardDialog reward={reward === 'new' ? null : reward} onClose={() => setReward(null)} />}
            {promo && <PromoDialog promo={promo === 'new' ? null : promo} onClose={() => setPromo(null)} />}
        </AppLayout>
    );
}

function RewardDialog({ reward, onClose }: { reward: Reward | null; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        name: reward?.name ?? '',
        description: reward?.description ?? '',
        points_cost: reward?.points_cost ?? 100,
        type: reward?.type ?? 'wallet_credit',
        config: reward?.config ?? { amount_zig: 20 },
        is_active: reward?.is_active ?? true,
    });

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{reward ? 'Edit reward' : 'New reward'}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); post(`/admin/rewards${reward ? `/${reward.id}` : ''}`, { onSuccess: onClose }); }} className="space-y-3 text-sm">
                    <label className="block">Name<input className={fieldClass} value={data.name} onChange={(e) => setData('name', e.target.value)} />{errors.name && <p className="text-zred text-xs">{errors.name}</p>}</label>
                    <label className="block">Description<input className={fieldClass} value={data.description} onChange={(e) => setData('description', e.target.value)} /></label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">Points cost<input type="number" className={fieldClass} value={data.points_cost} onChange={(e) => setData('points_cost', Number(e.target.value))} /></label>
                        <label className="block">Type
                            <select className={fieldClass} value={data.type} onChange={(e) => setData('type', e.target.value)}>
                                {['wallet_credit', 'free_item', 'free_delivery', 'discount'].map((t) => <option key={t} value={t}>{label(t)}</option>)}
                            </select>
                        </label>
                    </div>
                    {data.type === 'wallet_credit' && (
                        <label className="block">Credit amount (ZiG)<input type="number" className={fieldClass} value={data.config.amount_zig ?? 0} onChange={(e) => setData('config', { amount_zig: Number(e.target.value) })} /></label>
                    )}
                    <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Active" />
                    <div className="flex justify-end border-t pt-3"><Button disabled={processing}>Save</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        code: promo?.code ?? '',
        type: promo?.type ?? 'percent',
        value: promo?.value ?? 10,
        min_order_zig: promo?.min_order_zig ?? 0,
        max_uses: promo?.max_uses ?? '',
        ends_at: promo?.ends_at?.slice(0, 10) ?? '',
        is_active: promo?.is_active ?? true,
    });

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>{promo ? `Edit ${promo.code}` : 'New promo code'}</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); post(`/admin/promos${promo ? `/${promo.id}` : ''}`, { onSuccess: onClose }); }} className="grid grid-cols-2 gap-3 text-sm">
                    <label className="col-span-2 block">Code<input className={`${fieldClass} font-mono uppercase`} value={data.code} onChange={(e) => setData('code', e.target.value.toUpperCase())} />{errors.code && <p className="text-zred text-xs">{errors.code}</p>}</label>
                    <label className="block">Type
                        <select className={fieldClass} value={data.type} onChange={(e) => setData('type', e.target.value as Promo['type'])}>
                            <option value="percent">% off</option><option value="fixed">Fixed ZiG off</option><option value="free_delivery">Free delivery</option>
                        </select>
                    </label>
                    {data.type !== 'free_delivery' && <label className="block">Value<input type="number" className={fieldClass} value={data.value} onChange={(e) => setData('value', Number(e.target.value))} /></label>}
                    <label className="block">Min order (ZiG)<input type="number" className={fieldClass} value={data.min_order_zig} onChange={(e) => setData('min_order_zig', Number(e.target.value))} /></label>
                    <label className="block">Max uses<input type="number" className={fieldClass} placeholder="Unlimited" value={data.max_uses} onChange={(e) => setData('max_uses', e.target.value)} /></label>
                    <label className="block">Ends on<input type="date" className={fieldClass} value={data.ends_at} onChange={(e) => setData('ends_at', e.target.value)} />{errors.ends_at && <p className="text-zred text-xs">{errors.ends_at}</p>}</label>
                    <div className="flex items-end"><Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Active" /></div>
                    <div className="col-span-2 flex justify-end border-t pt-3"><Button disabled={processing}>Save</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

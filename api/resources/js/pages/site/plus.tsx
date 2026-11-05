import { Button } from '@/components/ui/button';
import { Modal, Select } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { zig } from '@/lib/money';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { BadgePercent, Bike, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface Plan { id: number; name: string; price_zig: number; interval: 'month' | 'year'; min_order_for_free_delivery_zig: number; service_fee_discount_pct: number; perks: string[] | null }

export default function Plus({ plans, current, seo }: { plans: Plan[]; current: { current_period_end: string } | null; seo: { title: string } }) {
    const { auth } = usePage<SharedData>().props;
    const [joining, setJoining] = useState<Plan | null>(null);
    const plan = plans[0];

    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            <section className="-mt-16 bg-[#222222] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="mx-auto max-w-5xl px-4 py-20 text-center md:px-6">
                    <span className="inline-flex items-center gap-2 rounded-full bg-brand/15 px-4 py-1.5 text-sm font-bold text-brand"><Sparkles className="size-4" /> ZVINO+</span>
                    <h1 className="mt-6 text-[48px] leading-[1.02] font-extrabold tracking-[-0.045em] md:text-[72px]">Free delivery.<br />Every single order.</h1>
                    {plan && <p className="mx-auto mt-6 max-w-lg text-lg text-white/65">For just {zig(plan.price_zig)} a {plan.interval}, get free delivery on orders over {zig(plan.min_order_for_free_delivery_zig)} and {plan.service_fee_discount_pct}% off service fees.</p>}
                    {current ? (
                        <p className="mt-8 inline-flex rounded-full bg-white/10 px-6 py-3 font-semibold">You’re a member until {new Date(current.current_period_end).toLocaleDateString('en-ZW', { dateStyle: 'long' })} 🎉</p>
                    ) : plan ? (
                        auth?.user ? <Button className="mt-8 h-14 rounded-full bg-brand px-8 text-base text-black hover:bg-[#4fd4a5]" onClick={() => setJoining(plan)}>Join for {zig(plan.price_zig)}/{plan.interval}</Button> : <Button className="mt-8 h-14 rounded-full bg-brand px-8 text-base text-black hover:bg-[#4fd4a5]" asChild><Link href="/signin">Sign in to join</Link></Button>
                    ) : <p className="mt-8 text-white/60">Zvino+ is coming soon.</p>}
                </div>
            </section>
            {plan && (
                <section className="mx-auto mt-16 grid max-w-5xl gap-4 px-4 md:grid-cols-3 md:px-6">
                    {[[Bike, 'Free delivery', `On every order over ${zig(plan.min_order_for_free_delivery_zig)} from any store.`], [BadgePercent, `${plan.service_fee_discount_pct}% off service fees`, 'Pay less on every single order, even pickup.'], [Sparkles, 'Member-only deals', 'Exclusive discounts and early access to new stores.']].map(([I, t, d]) => {
                        const Icon = I as typeof Bike;
                        return <div key={String(t)} className="rounded-3xl border p-7"><Icon className="size-7" /><h3 className="mt-4 text-xl font-bold">{String(t)}</h3><p className="text-muted-foreground mt-1">{String(d)}</p></div>;
                    })}
                </section>
            )}
            {plan?.perks && <ul className="mx-auto mt-10 grid max-w-2xl gap-3 px-6">{plan.perks.map((x) => <li key={x} className="flex items-center gap-3 text-lg"><Check className="size-5 text-brand-600" />{x}</li>)}</ul>}
            {joining && <JoinModal plan={joining} onClose={() => setJoining(null)} />}
        </SiteLayout>
    );
}

function JoinModal({ plan, onClose }: { plan: Plan; onClose: () => void }) {
    const [method, setMethod] = useState('ecocash');
    const [phone, setPhone] = useState('');
    return (
        <Modal open onClose={onClose} title={`Join ${plan.name}`} description={`${zig(plan.price_zig)} per ${plan.interval}. Cancel anytime.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="dark" onClick={() => router.post('/account/plus', { plan_id: plan.id, method, phone }, { onSuccess: onClose })}>Pay {zig(plan.price_zig)}</Button></>}>
            <div className="grid gap-3">
                <Select value={method} onChange={(e) => setMethod(e.target.value)} className="h-12"><option value="ecocash">EcoCash</option><option value="innbucks">InnBucks</option><option value="onemoney">OneMoney</option><option value="card">Visa / Mastercard</option><option value="wallet">Zvino wallet</option></Select>
                {['ecocash', 'innbucks', 'onemoney'].includes(method) && <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="077 123 4567" className="h-12 rounded-lg border px-3" />}
            </div>
        </Modal>
    );
}

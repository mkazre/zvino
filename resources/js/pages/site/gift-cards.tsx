import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/z';
import SiteLayout from '@/layouts/site-layout';
import { usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { Gift, Globe, MessageSquare } from 'lucide-react';

export default function GiftCards({ amounts, enabled, seo }: { amounts: number[]; enabled: boolean; seo: { title: string } }) {
    const { auth, zigPerUsd } = usePage<SharedData>().props;
    const { data, setData, post, processing, errors } = useForm({ amount_zig: amounts[1] ?? amounts[0], recipient_name: '', recipient_phone: '', message: '', method: 'card', phone: '' });

    return (
        <SiteLayout>
            <Head title={seo.title} />
            <div className="mx-auto grid max-w-6xl gap-12 px-4 py-14 md:px-6 lg:grid-cols-2">
                <div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-[#fdf6e3] px-4 py-1.5 text-sm font-bold text-[#8a6508]"><Gift className="size-4" /> Zvino gift cards</span>
                    <h1 className="mt-5 text-[44px] leading-[1.03] font-extrabold tracking-[-0.045em] md:text-[56px]">Send a meal home.</h1>
                    <p className="text-muted-foreground mt-4 max-w-md text-lg">Living abroad? Treat family and friends in Zimbabwe. Pay by card from anywhere; they get a code by SMS and order whatever they love.</p>
                    <ul className="mt-8 grid gap-4">
                        {[[Globe, 'Pay from the UK, South Africa, USA and beyond', 'Visa and Mastercard accepted.'], [MessageSquare, 'Delivered instantly by SMS', 'No app needed to receive it.'], [Gift, 'Works on everything', 'Restaurants, groceries, pharmacy. Valid for 12 months.']].map(([I, t, d]) => {
                            const Icon = I as typeof Gift;
                            return <li key={String(t)} className="flex gap-4"><span className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-xl"><Icon className="size-5" /></span><span><span className="block font-semibold">{String(t)}</span><span className="text-muted-foreground text-sm">{String(d)}</span></span></li>;
                        })}
                    </ul>
                </div>
                <div className="rounded-3xl border p-6 md:p-8">
                    <div className="relative flex aspect-[1.6] flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b6e4f] to-[#073e2c] p-6 text-white shadow-xl">
                        <span className="text-lg font-extrabold">zvino</span>
                        <div><div className="tabular text-4xl font-extrabold">{zig(data.amount_zig)}</div><div className="text-sm text-white/70">{data.recipient_name ? `For ${data.recipient_name}` : 'Gift card'} · ≈ {usd(data.amount_zig / zigPerUsd)}</div></div>
                        <Gift className="absolute -right-4 -bottom-4 size-32 text-white/10" />
                    </div>
                    {!enabled ? <p className="text-muted-foreground mt-6">Gift cards are coming soon.</p> : (
                        <div className="mt-6 grid gap-4">
                            <div className="grid grid-cols-4 gap-2">{amounts.map((a) => <button key={a} onClick={() => setData('amount_zig', a)} className={cn('h-12 rounded-xl text-sm font-bold', data.amount_zig === a ? 'bg-[#111412] text-white dark:bg-white dark:text-black' : 'bg-muted dark:bg-white/10')}>{a}</button>)}</div>
                            <div className="grid grid-cols-2 gap-3">
                                <Input className="h-12" placeholder="Their name" value={data.recipient_name} onChange={(e) => setData('recipient_name', e.target.value)} />
                                <Input className="h-12" placeholder="Their mobile (07…)" value={data.recipient_phone} onChange={(e) => setData('recipient_phone', e.target.value)} />
                            </div>
                            <Textarea placeholder="Add a message (optional)" value={data.message} onChange={(e) => setData('message', e.target.value)} className="min-h-[72px]" />
                            <Select className="h-12" value={data.method} onChange={(e) => setData('method', e.target.value)}><option value="card">Visa / Mastercard</option><option value="ecocash">EcoCash</option><option value="innbucks">InnBucks</option><option value="onemoney">OneMoney</option><option value="wallet">Zvino wallet</option></Select>
                            {['ecocash', 'innbucks', 'onemoney'].includes(data.method) && <Input className="h-12" placeholder="Your mobile number" value={data.phone} onChange={(e) => setData('phone', e.target.value)} />}
                            {Object.values(errors)[0] && <p className="text-sm text-[#c8102e]">{Object.values(errors)[0]}</p>}
                            {auth?.user ? <Button variant="dark" className="h-14 rounded-full text-base" disabled={processing} onClick={() => post('/account/gift-cards')}>Buy {zig(data.amount_zig)} gift card</Button> : <Button variant="dark" className="h-14 rounded-full text-base" asChild><Link href="/signin">Sign in to buy</Link></Button>}
                        </div>
                    )}
                </div>
            </div>
        </SiteLayout>
    );
}

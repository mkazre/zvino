import { Button } from '@/components/ui/button';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { zig } from '@/lib/money';
import { Head, usePage } from '@inertiajs/react';
import { Clock, HandCoins, ShieldCheck, Smartphone } from 'lucide-react';

export default function Drivers({ basePay, perKm, seo }: { basePay: number; perKm: number; seo: { title: string } }) {
    const { site } = usePage<SiteProps>().props;
    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            <section className="-mt-16 bg-[#111412] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
                    <p className="font-bold text-[#c99412]">Zvino Driver</p>
                    <h1 className="mt-4 max-w-3xl text-[44px] leading-[1.03] font-extrabold tracking-[-0.045em] md:text-[64px]">Your bike. Your hours. Your money.</h1>
                    <p className="mt-5 max-w-xl text-lg text-white/65">Earn {zig(basePay)} per trip plus {zig(perKm)} per km, and keep 100% of your tips. Cash out to EcoCash.</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Button className="h-14 rounded-full bg-[#c99412] px-8 text-base text-black hover:bg-[#e0b23a]" asChild><a href={site.apps.android || '#'}>Get the Driver app</a></Button>
                    </div>
                    <p className="mt-3 text-sm text-white/50">You’ll need: national ID, driver’s licence (motorbike/car) and a selfie. Approval usually takes 1–2 days.</p>
                </div>
            </section>
            <section className="mx-auto mt-16 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 md:px-6">
                {[[Clock, 'Flexible', 'Go online whenever you want. No minimum hours.'], [HandCoins, 'Fast payouts', 'Weekly payouts, or instant cash-out to EcoCash.'], [ShieldCheck, 'Safety first', 'SOS button, trip sharing and night-zone alerts built in.'], [Smartphone, 'Simple app', 'Clear job offers with pay shown upfront before you accept.']].map(([I, t, d]) => {
                    const Icon = I as typeof Clock;
                    return <div key={String(t)} className="rounded-3xl border p-7"><Icon className="size-7" /><h3 className="mt-4 text-lg font-bold">{String(t)}</h3><p className="text-muted-foreground mt-1">{String(d)}</p></div>;
                })}
            </section>
        </SiteLayout>
    );
}

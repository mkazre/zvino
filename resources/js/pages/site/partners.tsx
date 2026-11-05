import { Button } from '@/components/ui/button';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { Head, Link, usePage } from '@inertiajs/react';
import { ArrowRight, BarChart3, Bike, ChefHat, ClipboardCheck, FileText, Rocket, Smartphone, Wallet, Zap } from 'lucide-react';

export default function Partners({ commission, seo }: { commission: number; seo: { title: string } }) {
    const { site } = usePage<SiteProps>().props;
    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            <section className="-mt-16 bg-[#1c1c1c] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
                    <p className="font-bold text-brand">For restaurants, grocers & pharmacies</p>
                    <h1 className="mt-4 max-w-3xl text-[44px] leading-[1.03] font-extrabold tracking-[-0.045em] md:text-[64px]">More orders. Less hassle. Paid every week.</h1>
                    <p className="mt-5 max-w-xl text-lg text-white/65">List your menu on Zvino and reach customers across {site.cities.join(' and ')}. We bring the drivers, the payments and the marketing.</p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Button className="h-14 rounded-full px-8 text-base" asChild><Link href="/partners/apply">Sign up your business <ArrowRight /></Link></Button>
                        <span className="text-sm text-white/50">About 10 minutes, all online.</span>
                    </div>
                    <p className="mt-3 text-sm text-white/50">Commission from {commission}% on delivery orders. No sign-up fees.</p>
                </div>
            </section>
            <section className="mx-auto mt-16 max-w-6xl px-4 md:px-6">
                <h2 className="text-[26px] font-extrabold tracking-[-0.03em]">How it works</h2>
                <ol className="mt-6 grid gap-4 md:grid-cols-3">
                    {[
                        [FileText, '1. Apply online', 'Your details, opening hours, menu, photos, documents and where we pay you (EcoCash, OneMoney, InnBucks or bank).'],
                        [ClipboardCheck, '2. We review', 'Our team checks everything within 1–2 working days and loads your menu for you.'],
                        [Rocket, '3. Go live', 'Sign in to the Zvino Merchant app, accept your first orders and get paid weekly.'],
                    ].map(([I, t, d]) => {
                        const Icon = I as typeof Bike;
                        return <li key={String(t)} className="bg-muted rounded-3xl p-7 dark:bg-white/5"><Icon className="size-7" /><h3 className="mt-4 text-lg font-bold">{String(t)}</h3><p className="text-muted-foreground mt-1">{String(d)}</p></li>;
                    })}
                </ol>
            </section>
            <section className="mx-auto mt-6 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 md:px-6">
                {[
                    [Bike, 'We deliver for you', 'Our drivers pick up and deliver. No fleet to manage.'],
                    [Wallet, 'Weekly payouts', 'Straight to EcoCash or your bank, with clear statements.'],
                    [Smartphone, 'Zvino Merchant app', 'Accept orders, set prep times, mark items sold out in one tap.'],
                    [ChefHat, 'Kitchen display & POS', 'Free POS and kitchen screen. Counter and online orders in one place.'],
                    [Zap, 'Load-shedding mode', 'Power out? Hide oven items and add prep time instantly.'],
                    [BarChart3, 'Insights', 'Best sellers, peak hours and reviews to grow your business.'],
                ].map(([I, t, d]) => {
                    const Icon = I as typeof Bike;
                    return <div key={String(t)} className="rounded-3xl border p-7"><Icon className="size-7" /><h3 className="mt-4 text-lg font-bold">{String(t)}</h3><p className="text-muted-foreground mt-1">{String(d)}</p></div>;
                })}
            </section>
            <section className="mx-auto mt-10 max-w-6xl px-4 md:px-6">
                <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-[#1c1c1c] p-8 text-white md:flex-row md:items-center">
                    <div><h3 className="text-2xl font-extrabold tracking-tight">Ready when you are.</h3><p className="text-white/60">Have your logo, menu, ID and payout details handy.</p></div>
                    <Button className="h-12 rounded-full px-7" asChild><Link href="/partners/apply">Start your application <ArrowRight /></Link></Button>
                </div>
            </section>
        </SiteLayout>
    );
}

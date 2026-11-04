import { Button } from '@/components/ui/button';
import SiteLayout, { type SiteProps } from '@/layouts/site-layout';
import { Head, usePage } from '@inertiajs/react';
import { BarChart3, Bike, ChefHat, Smartphone, Wallet, Zap } from 'lucide-react';

export default function Partners({ commission, seo }: { commission: number; seo: { title: string } }) {
    const { site } = usePage<SiteProps>().props;
    const wa = site.support_whatsapp ? `https://wa.me/${site.support_whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hi Zvino, I would like to list my restaurant/shop.')}` : `mailto:${site.support_email}?subject=Partner with Zvino`;
    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            <section className="-mt-16 bg-[#1c1c1c] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
                    <p className="font-bold text-brand">For restaurants, grocers & pharmacies</p>
                    <h1 className="mt-4 max-w-3xl text-[44px] leading-[1.03] font-extrabold tracking-[-0.045em] md:text-[64px]">More orders. Less hassle. Paid every week.</h1>
                    <p className="mt-5 max-w-xl text-lg text-white/65">List your menu on Zvino and reach customers across {site.cities.join(' and ')}. We bring the drivers, the payments and the marketing.</p>
                    <Button className="mt-8 h-14 rounded-full bg-brand px-8 text-base text-black hover:bg-[#4fd4a5]" asChild><a href={wa}>Get started</a></Button>
                    <p className="mt-3 text-sm text-white/50">Commission from {commission}% on delivery orders. No sign-up fees.</p>
                </div>
            </section>
            <section className="mx-auto mt-16 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 md:px-6">
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
        </SiteLayout>
    );
}

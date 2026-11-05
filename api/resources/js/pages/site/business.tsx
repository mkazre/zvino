import { Button } from '@/components/ui/button';
import SiteLayout from '@/layouts/site-layout';
import { Head, Link } from '@inertiajs/react';
import { ArrowRight, CalendarCheck, FileSpreadsheet, Gift, ShieldCheck, Users, UtensilsCrossed } from 'lucide-react';

/** Zvino for Business: corporate accounts landing page (footer → Corporate accounts). */
export default function Business({ seo }: { seo: { title: string } }) {
    return (
        <SiteLayout transparent>
            <Head title={seo.title} />
            <section className="-mt-16 bg-[#1c1c1c] pt-16 text-white md:-mt-[72px] md:pt-[72px]">
                <div className="mx-auto max-w-6xl px-4 py-20 md:px-6 md:py-28">
                    <p className="font-bold text-brand">Zvino for Business</p>
                    <h1 className="mt-4 max-w-3xl text-[44px] leading-[1.03] font-extrabold tracking-[-0.045em] md:text-[64px]">Feed your team. One invoice a month.</h1>
                    <p className="mt-5 max-w-xl text-lg text-white/65">Staff lunches, meeting catering and client gifts from the best restaurants in town, with budgets and daily allowances you control.</p>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Button className="h-14 rounded-full px-8 text-base" asChild><Link href="/business/apply">Open a corporate account <ArrowRight /></Link></Button>
                        <span className="text-sm text-white/50">About 5 minutes. No set-up fees.</span>
                    </div>
                </div>
            </section>
            <section className="mx-auto mt-16 grid max-w-6xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-3 md:px-6">
                {[
                    [Users, 'Allowances per person', 'Set a daily allowance and ordering days. Staff order with their own phone.'],
                    [FileSpreadsheet, 'Monthly invoice', 'Pay on 30-day terms or prepay. VAT invoices with every order listed.'],
                    [UtensilsCrossed, 'Meetings & catering', 'Platters for the boardroom or food for hundreds, delivered on time.'],
                    [Gift, 'Client & staff gifts', 'Gift cards and grocery hampers sent by SMS anywhere in Zimbabwe.'],
                    [CalendarCheck, 'Scheduled orders', 'Book lunch for every Friday, or a month of meetings, in one go.'],
                    [ShieldCheck, 'Budgets you control', 'Monthly budget caps and a dashboard of who ordered what.'],
                ].map(([I, t, d]) => {
                    const Icon = I as typeof Users;
                    return <div key={String(t)} className="rounded-3xl border p-7"><Icon className="size-7" /><h3 className="mt-4 text-lg font-bold">{String(t)}</h3><p className="text-muted-foreground mt-1">{String(d)}</p></div>;
                })}
            </section>
            <section className="mx-auto mt-10 max-w-6xl px-4 md:px-6">
                <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-[var(--color-brand)] p-8 text-black md:flex-row md:items-center">
                    <div><h3 className="text-2xl font-extrabold tracking-tight">Lunch is sorted.</h3><p className="text-black/70">Tell us about your company and we’ll set you up within a day.</p></div>
                    <Button variant="ink" className="h-12 rounded-full px-7" asChild><Link href="/business/apply">Get started <ArrowRight /></Link></Button>
                </div>
            </section>
        </SiteLayout>
    );
}

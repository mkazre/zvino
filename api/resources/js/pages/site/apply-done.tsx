import { StoreBadges } from '@/components/store-badges';
import { Button } from '@/components/ui/button';
import SiteLayout from '@/layouts/site-layout';
import { Head, Link } from '@inertiajs/react';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface Props {
    application: { reference: string; type: 'restaurant' | 'driver' | 'corporate'; label: string; title: string; email: string | null; submitted_at: string };
}

const NEXT: Record<Props['application']['type'], string[]> = {
    restaurant: ['We check your details and documents (1–2 working days).', 'We load your menu and photos, and set up your payouts.', 'You get an email to set your password for the Zvino Merchant app, then you go live.'],
    driver: ['We check your documents and run a quick background check (1–2 working days).', 'You get an email and SMS when you’re approved.', 'Download the Zvino Driver app, sign in with your number and go online.'],
    corporate: ['We review your company details, usually within one working day.', 'We set your budgets, allowances and invoicing.', 'Your team signs in with their phone numbers and orders on the company account.'],
};

export default function ApplyDone({ application: a }: Props) {
    const [copied, setCopied] = useState(false);
    return (
        <SiteLayout hideCart>
            <Head title="Application received" />
            <section className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6 md:py-24">
                <span className="bg-brand mx-auto flex size-16 items-center justify-center rounded-full text-black"><Check className="size-8" strokeWidth={3} /></span>
                <h1 className="mt-6 text-[34px] leading-tight font-extrabold tracking-[-0.04em]">Application received!</h1>
                <p className="text-muted-foreground mt-2 text-lg">Thanks for applying, {a.title}. {a.email ? <>We’ve sent a confirmation to <b className="text-foreground">{a.email}</b>.</> : null}</p>
                <div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-2xl border px-5 py-3">
                    <span className="text-muted-foreground text-sm">Your reference</span>
                    <span className="tabular text-xl font-extrabold tracking-wide">{a.reference}</span>
                    <button type="button" className="hover:bg-muted rounded-full p-2" aria-label="Copy reference" onClick={() => { navigator.clipboard?.writeText(a.reference); setCopied(true); }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button>
                </div>
                <div className="bg-muted mt-10 rounded-3xl p-6 text-left dark:bg-white/5">
                    <h2 className="font-bold">What happens next</h2>
                    <ol className="mt-3 grid gap-3">
                        {NEXT[a.type].map((s, i) => (
                            <li key={s} className="flex gap-3 text-[15px]"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#1c1c1c] text-xs font-bold text-white dark:bg-white dark:text-black">{i + 1}</span>{s}</li>
                        ))}
                    </ol>
                    {a.type === 'driver' && <StoreBadges className="mt-5" size="sm" />}
                </div>
                <Button variant="ink" className="mt-8 h-12 rounded-full px-7" asChild><Link href="/">Back to Zvino</Link></Button>
            </section>
        </SiteLayout>
    );
}

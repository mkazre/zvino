import { Button } from '@/components/ui/button';
import { VendorSwitcher } from '@/components/zvino';
import { useLiveOrders } from '@/hooks/use-live-orders';
import AppLayout from '@/layouts/app-layout';
import { label } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Head, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';

interface Ticket {
    id: number;
    reference: string;
    stage: 'new' | 'cooking' | 'ready';
    source: string;
    fulfilment: string;
    customer: string | null;
    notes: string | null;
    placed_at: string;
    items: { name: string; quantity: number; options: { variant?: string; modifiers?: string[] } | null; notes: string | null }[];
}

const COLUMNS = [
    { stage: 'new', title: 'New', action: 'Start cooking', tone: 'border-t-blue-500' },
    { stage: 'cooking', title: 'Cooking', action: 'Mark ready', tone: 'border-t-amber-500' },
    { stage: 'ready', title: 'Ready', action: 'Handed over', tone: 'border-t-emerald-600' },
] as const;

export default function Kitchen({ vendor, vendors, tickets }: { vendor: { id: number; name: string } | null; vendors: { id: number; name: string }[]; tickets: Ticket[] }) {
    useLiveOrders(vendor?.id, ['tickets'], 10000);
    const [, tick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => tick((n) => n + 1), 30000); // refresh elapsed timers
        return () => clearInterval(t);
    }, []);

    const advance = (id: number) => router.patch(`/admin/api/orders/${id}/stage`, {}, { preserveScroll: true, only: ['tickets'] });

    return (
        <AppLayout breadcrumbs={[{ title: 'Kitchen display', href: '/admin/kitchen' }]}>
            <Head title="Kitchen" />
            <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="mr-auto text-2xl font-bold">Kitchen · {vendor?.name}</h1>
                    <VendorSwitcher vendors={vendors} current={vendor} />
                    <span className="text-muted-foreground text-sm">{tickets.length} open tickets</span>
                </div>

                <div className="grid flex-1 gap-4 lg:grid-cols-3">
                    {COLUMNS.map((col) => {
                        const list = tickets.filter((t) => t.stage === col.stage);
                        return (
                            <section key={col.stage} className={cn('bg-muted/50 flex flex-col rounded-xl border border-t-4', col.tone)}>
                                <header className="flex items-center justify-between px-4 py-3">
                                    <h2 className="font-bold">{col.title}</h2>
                                    <span className="bg-background rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums">{list.length}</span>
                                </header>
                                <div className="flex flex-col gap-3 px-3 pb-3">
                                    {list.map((t) => {
                                        const mins = Math.floor((Date.now() - new Date(t.placed_at).getTime()) / 60000);
                                        return (
                                            <article key={t.id} className="bg-card rounded-lg border shadow-sm">
                                                <div className="flex items-center justify-between border-b px-3 py-2">
                                                    <span className="font-mono text-lg font-bold">{t.reference}</span>
                                                    <span className={cn('rounded px-2 py-0.5 text-sm font-bold tabular-nums', mins >= 20 ? 'bg-zred text-white' : mins >= 10 ? 'bg-gold text-white' : 'bg-muted')}>{mins}m</span>
                                                </div>
                                                <div className="text-muted-foreground px-3 pt-2 text-xs font-medium uppercase">
                                                    {label(t.fulfilment)} · {t.source === 'pos' ? 'Counter' : t.customer || 'App'}
                                                </div>
                                                <ul className="space-y-1.5 px-3 py-2">
                                                    {t.items.map((i, idx) => (
                                                        <li key={idx} className="text-base">
                                                            <span className="font-bold">{i.quantity}×</span> {i.name}
                                                            {(i.options?.variant || i.options?.modifiers?.length) && (
                                                                <div className="text-muted-foreground text-sm">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(' · ')}</div>
                                                            )}
                                                            {i.notes && <div className="text-zred text-sm font-medium">⚠ {i.notes}</div>}
                                                        </li>
                                                    ))}
                                                </ul>
                                                {t.notes && <div className="text-zred border-t px-3 py-2 text-sm">📝 {t.notes}</div>}
                                                <div className="p-2">
                                                    <Button className="h-11 w-full text-base" variant={col.stage === 'ready' ? 'outline' : 'default'} onClick={() => advance(t.id)}>
                                                        {col.action}
                                                    </Button>
                                                </div>
                                            </article>
                                        );
                                    })}
                                    {list.length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">Nothing here</p>}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </AppLayout>
    );
}

import { Button } from '@/components/ui/button';
import { Empty, StatusBadge, VendorSwitcher, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { label, usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Item } from '@/types';
import { Head, router } from '@inertiajs/react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Props {
    vendor: { id: number; name: string } | null;
    vendors: { id: number; name: string }[];
    categories: { id: number; name: string }[];
    items: { data: Item[] };
    zigPerUsd: number;
    vatPct: number;
    recent: { id: number; reference: string; total_zig: number; payment_method: string; payment_status: string; created_at: string }[];
}

interface Line { key: string; item: Item; variant: string | null; quantity: number; unit: number }

const METHODS = [
    { value: 'cash', label: 'Cash', icon: '💵' },
    { value: 'card', label: 'Card', icon: '💳' },
    { value: 'ecocash', label: 'EcoCash', icon: '📱' },
    { value: 'onemoney', label: 'OneMoney', icon: '📱' },
    { value: 'innbucks', label: 'InnBucks', icon: '📱' },
];

export default function Pos({ vendor, vendors, categories, items, zigPerUsd, vatPct, recent }: Props) {
    const [cat, setCat] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [lines, setLines] = useState<Line[]>([]);
    const [phone, setPhone] = useState('');
    const [busy, setBusy] = useState(false);

    const visible = items.data.filter((i) => (!cat || i.category_id === cat) && i.name.toLowerCase().includes(search.toLowerCase()));
    const total = useMemo(() => lines.reduce((s, l) => s + l.unit * l.quantity, 0), [lines]);
    const vat = total - total / (1 + vatPct / 100);

    const add = (item: Item, variant: string | null = null) => {
        const base = item.special_price?.zig ?? item.price.zig;
        const unit = base + (item.variants.find((v) => v.name === variant)?.price_delta_zig ?? 0);
        const key = `${item.id}:${variant ?? ''}`;
        setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l)) : [...ls, { key, item, variant, quantity: 1, unit }]));
    };
    const qty = (key: string, d: number) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: l.quantity + d } : l)).filter((l) => l.quantity > 0));

    const charge = (method: string) => {
        if (!vendor || !lines.length) return;
        if (['ecocash', 'onemoney', 'innbucks'].includes(method) && !phone) {
            alert('Enter the customer’s mobile number for mobile money.');
            return;
        }
        setBusy(true);
        router.post(
            '/admin/pos/sales',
            { vendor_id: vendor.id, method, phone, lines: lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, variant: l.variant })) },
            { preserveScroll: true, onSuccess: () => { setLines([]); setPhone(''); }, onFinish: () => setBusy(false) },
        );
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'POS', href: '/admin/pos' }]}>
            <Head title="POS" />
            <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_380px] md:p-6">
                <div className="flex min-w-0 flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="mr-auto text-xl font-bold">{vendor?.name ?? 'POS'}</h1>
                        <VendorSwitcher vendors={vendors} current={vendor} />
                        <input className={`${fieldClass} w-48`} placeholder="Search menu" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[{ id: null, name: 'All' }, ...categories].map((c) => (
                            <button key={c.id ?? 'all'} onClick={() => setCat(c.id)} className={cn('rounded-full border px-3.5 py-1.5 text-sm font-medium', cat === c.id && 'bg-primary text-primary-foreground border-primary')}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                        {visible.map((i) => (
                            <div key={i.id} className="bg-card flex flex-col rounded-xl border p-3">
                                <button onClick={() => add(i)} className="flex flex-1 flex-col text-left">
                                    <div className="bg-accent mb-2 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg text-3xl">
                                        {i.image ? <img src={i.image} alt="" className="size-full object-cover" /> : '🍲'}
                                    </div>
                                    <div className="text-sm leading-tight font-semibold">{i.name}</div>
                                    <div className="text-primary mt-1 text-sm font-bold tabular-nums">{zig(i.special_price?.zig ?? i.price.zig)}</div>
                                </button>
                                {i.variants.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {i.variants.map((v) => (
                                            <button key={v.name} onClick={() => add(i, v.name)} className="hover:bg-accent rounded border px-1.5 py-0.5 text-xs">
                                                {v.name}{v.price_delta_zig ? ` +${v.price_delta_zig}` : ''}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {visible.length === 0 && <Empty>No available items.</Empty>}
                </div>

                <aside className="bg-card flex flex-col rounded-xl border lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)]">
                    <header className="flex items-center justify-between border-b px-4 py-3">
                        <h2 className="font-semibold">Current ticket</h2>
                        {lines.length > 0 && <button className="text-muted-foreground text-xs" onClick={() => setLines([])}>Clear</button>}
                    </header>
                    <ul className="flex-1 divide-y overflow-y-auto">
                        {lines.length === 0 && <Empty>Tap items to add them.</Empty>}
                        {lines.map((l) => (
                            <li key={l.key} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-medium">{l.item.name}</div>
                                    <div className="text-muted-foreground text-xs">{l.variant ?? 'Regular'} · {zig(l.unit)}</div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button size="icon" variant="outline" className="size-7" onClick={() => qty(l.key, -1)}>{l.quantity === 1 ? <Trash2 /> : <Minus />}</Button>
                                    <span className="w-6 text-center font-semibold tabular-nums">{l.quantity}</span>
                                    <Button size="icon" variant="outline" className="size-7" onClick={() => qty(l.key, 1)}><Plus /></Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="space-y-1 border-t px-4 py-3 text-sm">
                        <div className="text-muted-foreground flex justify-between"><span>VAT ({vatPct}%, incl.)</span><span className="tabular-nums">{zig(vat)}</span></div>
                        <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="tabular-nums">{zig(total)}</span></div>
                        <div className="text-muted-foreground text-right text-xs">{usd(total / zigPerUsd)} @ {zigPerUsd} ZiG/USD</div>
                    </div>
                    <div className="space-y-2 border-t p-4">
                        <input className={fieldClass} placeholder="Customer mobile (for mobile money)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        <div className="grid grid-cols-3 gap-2">
                            {METHODS.map((m) => (
                                <Button key={m.value} variant={m.value === 'cash' ? 'default' : 'outline'} disabled={busy || !lines.length} onClick={() => charge(m.value)} className="h-12 flex-col gap-0 text-xs">
                                    <span className="text-base">{m.icon}</span>{m.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {recent.length > 0 && (
                        <div className="border-t px-4 py-3">
                            <div className="text-muted-foreground mb-2 text-xs font-medium uppercase">Recent sales</div>
                            {recent.map((r) => (
                                <div key={r.id} className="flex items-center justify-between py-1 text-xs">
                                    <span className="font-mono">{r.reference}</span>
                                    <span>{label(r.payment_method)}</span>
                                    <span className="tabular-nums">{zig(r.total_zig)}</span>
                                    <StatusBadge status={r.payment_status} />
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </AppLayout>
    );
}

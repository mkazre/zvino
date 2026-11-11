import { Modal } from '@/components/z';
import { type CartSubstitute } from '@/lib/cart';
import { zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Check, Loader2, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Option { id: number; name: string; image: string | null; size: string | null; price: { zig: number }; difference: { zig: number } }

/**
 * "Select substitute": similar products from the same store. One per basket line. If it costs
 * more, the difference is held as a buffer and anything unused goes back to the wallet.
 */
export function SubstitutePicker({ itemId, itemName, current, onPick, onClose }: { itemId: number; itemName: string; current?: CartSubstitute | null; onPick: (s: CartSubstitute | null) => void; onClose: () => void }) {
    const [q, setQ] = useState('');
    const [options, setOptions] = useState<Option[] | null>(null);

    useEffect(() => {
        setOptions(null);
        const t = setTimeout(() => {
            fetch(`/items/${itemId}/substitutes?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } })
                .then((r) => (r.ok ? r.json() : { options: [] }))
                .then((d) => setOptions(d.options ?? []))
                .catch(() => setOptions([]));
        }, q ? 300 : 0);
        return () => clearTimeout(t);
    }, [itemId, q]);

    return (
        <Modal open onClose={onClose} size="lg" title="Choose a substitute" description={`If ${itemName} is out of stock, your shopper takes this instead.`}>
            <div className="grid gap-4">
                <div className="relative">
                    <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this store…" className="bg-muted h-11 w-full rounded-xl pr-3 pl-9 text-sm outline-none dark:bg-white/10" autoFocus />
                </div>
                {options === null ? (
                    <div className="flex justify-center py-10"><Loader2 className="text-muted-foreground size-6 animate-spin" /></div>
                ) : options.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">No similar products found. Try searching.</p>
                ) : (
                    <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                        {options.map((o) => {
                            const picked = current?.item_id === o.id;
                            const diff = o.difference.zig;
                            return (
                                <button key={o.id} onClick={() => { onPick({ item_id: o.id, name: o.name, image: o.image, price_zig: o.price.zig }); onClose(); }}
                                    className={cn('group relative flex flex-col rounded-2xl border p-3 text-left transition hover:shadow-md', picked ? 'border-brand ring-brand ring-2' : 'hover:border-foreground/30')}>
                                    {picked && <span className="bg-brand absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full text-black"><Check className="size-4" /></span>}
                                    <div className="mb-2 flex aspect-square items-center justify-center rounded-xl bg-white p-2 ring-1 ring-black/5">
                                        {o.image ? <img src={o.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" /> : <div className="bg-muted size-full rounded-lg" />}
                                    </div>
                                    <div className="line-clamp-2 text-sm leading-snug font-semibold">{o.name}</div>
                                    {o.size && <div className="text-muted-foreground text-xs">{o.size}</div>}
                                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                        <span className="tabular text-sm font-bold">{zig(o.price.zig)}</span>
                                        {Math.abs(diff) >= 0.01 && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', diff > 0 ? 'bg-gold/20 text-[#7a6a00] dark:text-gold' : 'bg-brand/15 text-brand-700 dark:text-brand')}>{diff > 0 ? `+${zig(diff)}` : 'Cheaper'}</span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <p className="text-muted-foreground text-xs">Dearer substitutes add a small buffer at checkout. Anything not used goes back to your Zvino wallet.</p>
                    {current && <button onClick={() => { onPick(null); onClose(); }} className="text-sm font-semibold text-[var(--color-zred)] hover:underline">Remove substitute</button>}
                </div>
            </div>
        </Modal>
    );
}

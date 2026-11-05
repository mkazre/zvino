import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';

/**
 * ZiG | USD switch. Swaps which currency every price shows first (the other one stays small next
 * to it). Remembered for this browser; the default comes from Admin → Settings → Currency.
 */
export function CurrencySwitch({ tone = 'light', className }: { tone?: 'light' | 'dark' | 'glass'; className?: string }) {
    const { currency } = usePage<SharedData>().props;
    const primary = currency?.primary ?? 'ZIG';
    const set = (c: 'ZIG' | 'USD') => c !== primary && router.post('/currency', { currency: c }, { preserveScroll: true, preserveState: true });
    return (
        <div
            role="radiogroup"
            aria-label="Currency"
            title={`1 USD = ${currency?.rate ?? ''} ZiG`}
            className={cn(
                'flex h-9 shrink-0 items-center rounded-full p-0.5 text-[12px] font-bold',
                tone === 'glass' ? 'bg-white/15 text-white' : tone === 'dark' ? 'bg-white/10 text-white' : 'bg-muted text-foreground dark:bg-white/10',
                className,
            )}
        >
            {(['ZIG', 'USD'] as const).map((c) => (
                <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={primary === c}
                    onClick={() => set(c)}
                    className={cn(
                        'h-8 rounded-full px-2 transition sm:px-2.5',
                        primary === c ? (tone === 'light' ? 'bg-white text-[#222222] shadow-sm dark:bg-white dark:text-black' : 'bg-white text-[#222222]') : 'opacity-70 hover:opacity-100',
                    )}
                >
                    {c === 'ZIG' ? 'ZiG' : 'US$'}
                </button>
            ))}
        </div>
    );
}

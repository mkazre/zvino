import { cn } from '@/lib/utils';
import { label } from '@/lib/money';
import { type SharedData } from '@/types';
import { router, usePage } from '@inertiajs/react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

/** Small shared building blocks for the admin screens. */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                {subtitle && <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('bg-card rounded-xl border', className)}>
            {title && (
                <header className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-semibold">{title}</h2>
                    {action}
                </header>
            )}
            {children}
        </section>
    );
}

export function StatCard({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'brand' }) {
    return (
        <div className={cn('rounded-xl border p-4', tone === 'brand' ? 'bg-brand border-brand text-white' : 'bg-card')}>
            <div className={cn('text-xs font-medium tracking-wide uppercase', tone === 'brand' ? 'text-white/70' : 'text-muted-foreground')}>{label}</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
            {hint && <div className={cn('mt-1 text-xs', tone === 'brand' ? 'text-white/80' : 'text-muted-foreground')}>{hint}</div>}
        </div>
    );
}

const STATUS_TONES: Record<string, string> = {
    placed: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    accepted: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    preparing: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    cooking: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    ready: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    picked_up: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    delivered: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    cancelled: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    paid: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    pending_cash: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    suspended: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    new: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
};

export function StatusBadge({ status }: { status: string }) {
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_TONES[status] ?? 'bg-muted text-muted-foreground')}>
            {label(status)}
        </span>
    );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
    return (
        <div className="bg-muted inline-flex flex-wrap gap-1 rounded-lg p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-sm font-medium transition',
                        value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.label}
                    {o.count !== undefined && <span className="text-muted-foreground ml-1.5 text-xs tabular-nums">{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

export function Switch({ checked, onChange, label: text }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={text} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2">
            <span className={cn('relative h-5 w-9 rounded-full transition', checked ? 'bg-primary' : 'bg-input')}>
                <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
            </span>
            {text && <span className="text-sm">{text}</span>}
        </button>
    );
}

export const fieldClass =
    'border-input bg-background focus-visible:ring-ring/40 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2';

/** Vendor picker shown to super admins on vendor-scoped screens (catalog, POS, kitchen). */
export function VendorSwitcher({ vendors, current }: { vendors: { id: number; name: string }[]; current?: { id: number } | null }) {
    const { auth, platformMode } = usePage<SharedData>().props;
    if (auth.user.role !== 'super_admin' || platformMode === 'single' || vendors.length < 2) return null;

    return (
        <select
            className={cn(fieldClass, 'w-auto')}
            value={current?.id ?? ''}
            onChange={(e) => router.get(window.location.pathname, { vendor_id: e.target.value }, { preserveState: false })}
        >
            {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                    {v.name}
                </option>
            ))}
        </select>
    );
}

export function Flash() {
    const { flash } = usePage<SharedData>().props;
    const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (flash?.success) setMsg({ type: 'success', text: flash.success });
        else if (flash?.error) setMsg({ type: 'error', text: flash.error });
        else return;
        const t = setTimeout(() => setMsg(null), 3500);
        return () => clearTimeout(t);
    }, [flash]);

    if (!msg) return null;
    const Icon = msg.type === 'success' ? CheckCircle2 : XCircle;

    return (
        <div className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg dark:bg-neutral-900">
            <Icon className={cn('size-4 shrink-0', msg.type === 'success' ? 'text-brand' : 'text-zred')} />
            {msg.text}
        </div>
    );
}

export function Empty({ children }: { children: ReactNode }) {
    return <div className="text-muted-foreground px-4 py-10 text-center text-sm">{children}</div>;
}

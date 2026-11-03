import { label as humanize, usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'dark';

const TONES: Record<Tone, string> = {
    neutral: 'bg-muted text-muted-foreground',
    success: 'bg-brand-50 text-brand dark:bg-brand/15 dark:text-primary',
    warning: 'bg-gold-50 text-[#8a6508] dark:bg-gold/15 dark:text-warning',
    danger: 'bg-zred-50 text-zred dark:bg-zred/15 dark:text-destructive',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    brand: 'bg-brand text-white',
    dark: 'bg-foreground text-background',
};

export function Badge({ children, tone = 'neutral', dot = false, className }: { children: ReactNode; tone?: Tone; dot?: boolean; className?: string }) {
    return (
        <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
            {dot && <span className="size-1.5 rounded-full bg-current" />}
            {children}
        </span>
    );
}

/** One place that decides how every status in the system looks. */
const STATUS_TONE: Record<string, Tone> = {
    // orders
    pending_payment: 'neutral', scheduled: 'info', placed: 'info', accepted: 'info', preparing: 'warning', ready: 'success',
    picked_up: 'success', arriving: 'success', delivered: 'neutral', cancelled: 'danger', rejected: 'danger',
    // payments
    unpaid: 'neutral', pending: 'warning', pending_cash: 'warning', paid: 'success', failed: 'danger', refunded: 'neutral', partially_refunded: 'warning',
    // entities
    active: 'success', approved: 'success', applied: 'info', suspended: 'danger', inactive: 'neutral', open: 'info', resolved: 'neutral',
    requested: 'warning', processing: 'info', draft: 'neutral', sent: 'success', sending: 'info', offered: 'info', expired: 'neutral', declined: 'neutral',
    new: 'info', cooking: 'warning', online: 'success', offline: 'neutral', busy: 'warning', paused: 'warning', closed: 'neutral', power_out: 'danger',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
    return (
        <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>
            {label ?? humanize(status)}
        </Badge>
    );
}

export function Money({ zig: z, usd: u, rate, className, size = 'md' }: { zig: number; usd?: number; rate?: number; className?: string; size?: 'sm' | 'md' | 'lg' }) {
    const second = u ?? (rate ? z / rate : undefined);
    return (
        <span className={cn('tabular inline-flex flex-col leading-tight', className)}>
            <span className={cn('font-semibold', size === 'lg' && 'text-2xl tracking-tight', size === 'sm' && 'text-[13px]')}>{zig(z)}</span>
            {second !== undefined && <span className="text-muted-foreground text-xs font-normal">{usd(second)}</span>}
        </span>
    );
}

export function StatCard({
    label,
    value,
    hint,
    delta,
    icon: Icon,
    trend,
    tone = 'default',
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    delta?: number | null;
    icon?: LucideIcon;
    trend?: number[];
    tone?: 'default' | 'inverse';
}) {
    const inverse = tone === 'inverse';
    return (
        <div className={cn('relative overflow-hidden rounded-xl border p-5 shadow-(--shadow-card)', inverse ? 'bg-foreground text-background border-foreground' : 'bg-surface')}>
            <div className="flex items-center justify-between">
                <span className={cn('text-[13px] font-medium', inverse ? 'text-background/70' : 'text-muted-foreground')}>{label}</span>
                {Icon && <Icon className={cn('size-4', inverse ? 'text-background/60' : 'text-muted-foreground')} />}
            </div>
            <div className="tabular mt-3 text-[28px] leading-none font-bold tracking-[-0.03em]">{value}</div>
            <div className="mt-2.5 flex items-center gap-2 text-xs">
                {delta !== undefined && delta !== null && (
                    <span className={cn('inline-flex items-center gap-0.5 font-semibold', delta >= 0 ? (inverse ? 'text-[#5fe0b3]' : 'text-brand') : 'text-zred')}>
                        {delta >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                        {Math.abs(delta)}%
                    </span>
                )}
                {hint && <span className={inverse ? 'text-background/60' : 'text-muted-foreground'}>{hint}</span>}
            </div>
            {trend && trend.length > 1 && (
                <div className="pointer-events-none absolute right-0 bottom-0 h-14 w-32 opacity-80">
                    <ResponsiveContainer>
                        <AreaChart data={trend.map((v, i) => ({ i, v }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                                <linearGradient id={`sg-${label}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={inverse ? '#5fe0b3' : 'var(--chart-1)'} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={inverse ? '#5fe0b3' : 'var(--chart-1)'} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="v" stroke={inverse ? '#5fe0b3' : 'var(--chart-1)'} strokeWidth={1.75} fill={`url(#sg-${label})`} isAnimationActive={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
}

export function Avatar({ name, src, size = 32, className }: { name?: string | null; src?: string | null; size?: number; className?: string }) {
    const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    return src ? (
        <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover', className)} style={{ width: size, height: size }} />
    ) : (
        <span className={cn('bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
            {initials}
        </span>
    );
}

/** Food / store thumbnail with a tasteful placeholder until real photography arrives. */
export function Thumb({ src, alt = '', size = 44, className, rounded = 'rounded-lg' }: { src?: string | null; alt?: string; size?: number; className?: string; rounded?: string }) {
    return src ? (
        <img src={src} alt={alt} className={cn('shrink-0 object-cover', rounded, className)} style={{ width: size, height: size }} />
    ) : (
        <span className={cn('bg-muted text-muted-foreground/60 inline-flex shrink-0 items-center justify-center', rounded, className)} style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size * 0.45} height={size * 0.45} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 11h18M5 11a7 7 0 0 1 14 0M12 4v0M4 15h16l-1.5 4h-13z" />
            </svg>
        </span>
    );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            {Icon && (
                <div className="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
                    <Icon className="text-muted-foreground size-5" />
                </div>
            )}
            <h3 className="text-[15px] font-semibold">{title}</h3>
            {description && <p className="text-muted-foreground mt-1 max-w-sm text-sm">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function Kbd({ children }: { children: ReactNode }) {
    return <kbd className="bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-[11px] font-medium">{children}</kbd>;
}

export function LiveDot({ className }: { className?: string }) {
    return (
        <span className={cn('relative inline-flex size-2', className)}>
            <span className="bg-brand absolute inline-flex size-full animate-ping rounded-full opacity-60" />
            <span className="bg-brand relative inline-flex size-2 rounded-full" />
        </span>
    );
}

export function Progress({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'gold' | 'red' }) {
    const color = { brand: 'bg-brand', gold: 'bg-gold', red: 'bg-zred' }[tone];
    return (
        <div className={cn('bg-muted h-1.5 w-full overflow-hidden rounded-full', className)}>
            <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
    );
}

export function Stars({ value, count }: { value: number; count?: number }) {
    return (
        <span className="tabular inline-flex items-center gap-1 text-[13px] font-medium">
            <svg viewBox="0 0 20 20" className="text-gold size-3.5 fill-current"><path d="M10 1.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.5 7.7l5.9-.9z" /></svg>
            {value.toFixed(1)}
            {count !== undefined && <span className="text-muted-foreground font-normal">({count})</span>}
        </span>
    );
}

import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

/** Page container: consistent max width, gutters and vertical rhythm on every admin screen. */
export function Page({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
    return <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-8', wide ? 'max-w-[1600px]' : 'max-w-7xl', className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
    return (
        <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                {eyebrow && <div className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">{eyebrow}</div>}
                <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">{title}</h1>
                {description && <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
    );
}

export function Card({ children, className, padded = false }: { children: ReactNode; className?: string; padded?: boolean }) {
    return <section className={cn('bg-surface rounded-xl border shadow-(--shadow-card)', padded && 'p-5', className)}>{children}</section>;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
    return (
        <header className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-4', className)}>
            <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
                {description && <p className="text-muted-foreground mt-0.5 text-[13px]">{description}</p>}
            </div>
            {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
    );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('px-5 pb-5', className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
    return <footer className={cn('bg-subtle flex items-center justify-end gap-2 rounded-b-xl border-t px-5 py-3', className)}>{children}</footer>;
}

/** Two-column settings-style section: label/description on the left, controls on the right. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
    return (
        <div className="grid gap-x-10 gap-y-4 border-b py-8 first:pt-2 last:border-0 md:grid-cols-[280px_1fr]">
            <div>
                <h3 className="text-sm font-semibold">{title}</h3>
                {description && <p className="text-muted-foreground mt-1 text-[13px] leading-relaxed">{description}</p>}
            </div>
            <div className="grid gap-4">{children}</div>
        </div>
    );
}

export function Grid({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4 | 5; className?: string }) {
    const map = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-2 lg:grid-cols-5' };
    return <div className={cn('grid gap-4', map[cols], className)}>{children}</div>;
}

export function Divider({ className }: { className?: string }) {
    return <div className={cn('bg-border h-px w-full', className)} />;
}

/** Label/value pairs for detail panels. */
export function KeyValue({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
    return (
        <dl className={cn('divide-y text-sm', className)}>
            {items.map(([k, v], i) => (
                <div key={i} className="flex items-start justify-between gap-6 py-2.5">
                    <dt className="text-muted-foreground shrink-0">{k}</dt>
                    <dd className="min-w-0 text-right font-medium">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

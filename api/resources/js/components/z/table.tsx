import { cn } from '@/lib/utils';
import { type PageLink } from '@/types';
import { Link } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { EmptyState } from './display';
import { Checkbox } from './forms';

export interface Column<T> {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    sort?: (row: T) => string | number;
    align?: 'left' | 'right' | 'center';
    width?: string;
    className?: string;
    hideOnMobile?: boolean;
}

/**
 * The one table used everywhere: sticky header, client-side sort, row selection,
 * clickable rows, empty state and server pagination links.
 */
export function DataTable<T extends { id: number | string }>({
    rows,
    columns,
    onRowClick,
    selectable = false,
    selected,
    onSelect,
    empty,
    links,
    footer,
    dense = false,
    rowClassName,
}: {
    rows: T[];
    columns: Column<T>[];
    onRowClick?: (row: T) => void;
    selectable?: boolean;
    selected?: Set<T['id']>;
    onSelect?: (ids: Set<T['id']>) => void;
    empty?: ReactNode;
    links?: PageLink[];
    footer?: ReactNode;
    dense?: boolean;
    rowClassName?: (row: T) => string | undefined;
}) {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [dir, setDir] = useState<1 | -1>(1);

    const sorted = useMemo(() => {
        const col = columns.find((c) => c.key === sortKey);
        if (!col?.sort) return rows;
        return [...rows].sort((a, b) => {
            const x = col.sort!(a);
            const y = col.sort!(b);
            return (x > y ? 1 : x < y ? -1 : 0) * dir;
        });
    }, [rows, sortKey, dir, columns]);

    const allSelected = selectable && rows.length > 0 && rows.every((r) => selected?.has(r.id));
    const someSelected = selectable && rows.some((r) => selected?.has(r.id));
    const pad = dense ? 'px-4 py-2' : 'px-4 py-3';

    return (
        <div>
            <div className="scroll-quiet overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr>
                            {selectable && (
                                <th className="bg-subtle sticky top-0 w-10 border-b px-4 py-2.5">
                                    <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={(v) => onSelect?.(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                                </th>
                            )}
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    style={{ width: c.width }}
                                    className={cn(
                                        'bg-subtle text-muted-foreground sticky top-0 border-b px-4 py-2.5 text-left text-xs font-medium whitespace-nowrap',
                                        c.align === 'right' && 'text-right',
                                        c.align === 'center' && 'text-center',
                                        c.hideOnMobile && 'hidden md:table-cell',
                                    )}
                                >
                                    {c.sort ? (
                                        <button
                                            className="hover:text-foreground inline-flex items-center gap-1"
                                            onClick={() => {
                                                if (sortKey === c.key) setDir(dir === 1 ? -1 : 1);
                                                else {
                                                    setSortKey(c.key);
                                                    setDir(1);
                                                }
                                            }}
                                        >
                                            {c.header}
                                            {sortKey === c.key && (dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                                        </button>
                                    ) : (
                                        c.header
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((row) => (
                            <tr
                                key={row.id}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                className={cn('group', onRowClick && 'cursor-pointer', selected?.has(row.id) && 'bg-brand-50/60 dark:bg-brand/10', rowClassName?.(row))}
                            >
                                {selectable && (
                                    <td className={cn('border-b', pad)} onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                            checked={!!selected?.has(row.id)}
                                            onChange={(v) => {
                                                const next = new Set(selected);
                                                v ? next.add(row.id) : next.delete(row.id);
                                                onSelect?.(next);
                                            }}
                                        />
                                    </td>
                                )}
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        className={cn(
                                            'group-hover:bg-subtle border-b align-middle transition-colors',
                                            pad,
                                            c.align === 'right' && 'text-right',
                                            c.align === 'center' && 'text-center',
                                            c.hideOnMobile && 'hidden md:table-cell',
                                            c.className,
                                        )}
                                    >
                                        {c.cell(row)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {rows.length === 0 && (empty ?? <EmptyState icon={Inbox} title="Nothing here yet" description="When there is data it will show up here." />)}
            {(links || footer) && (
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="text-muted-foreground text-xs">{footer}</div>
                    {links && <Pager links={links} />}
                </div>
            )}
        </div>
    );
}

export function Pager({ links }: { links: PageLink[] }) {
    if (!links || links.length <= 3) return null;
    const prev = links[0];
    const next = links[links.length - 1];
    const pages = links.slice(1, -1);

    const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] font-medium transition';
    return (
        <nav className="flex items-center gap-1">
            <Link href={prev.url ?? '#'} preserveScroll preserveState className={cn(btn, prev.url ? 'hover:bg-muted' : 'pointer-events-none opacity-40')} aria-label="Previous">
                <ChevronLeft className="size-4" />
            </Link>
            {pages.map((l, i) =>
                l.url ? (
                    <Link key={i} href={l.url} preserveScroll preserveState className={cn(btn, l.active ? 'bg-foreground text-background' : 'hover:bg-muted')}>
                        {l.label}
                    </Link>
                ) : (
                    <span key={i} className={cn(btn, 'text-muted-foreground')}>
                        …
                    </span>
                ),
            )}
            <Link href={next.url ?? '#'} preserveScroll preserveState className={cn(btn, next.url ? 'hover:bg-muted' : 'pointer-events-none opacity-40')} aria-label="Next">
                <ChevronRight className="size-4" />
            </Link>
        </nav>
    );
}

/** Filter bar that sits on top of a table inside a Card. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('flex flex-wrap items-center gap-2 border-b px-4 py-3', className)}>{children}</div>;
}

/** Floating bar shown when rows are selected. */
export function BulkBar({ count, children, onClear }: { count: number; children: ReactNode; onClear: () => void }) {
    if (count === 0) return null;
    return (
        <div className="bg-foreground text-background fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-2.5 shadow-(--shadow-pop)">
            <span className="text-sm font-medium">{count} selected</span>
            <span className="bg-background/20 h-5 w-px" />
            {children}
            <button onClick={onClear} className="text-background/70 hover:text-background text-sm">
                Clear
            </button>
        </div>
    );
}

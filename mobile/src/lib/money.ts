/**
 * Prices are stored in ZiG. Admin -> Settings -> Currency picks which currency is shown first; the
 * apps load it (and the rate) from /api/config at launch. zig() always takes a ZiG amount and shows
 * it in the primary currency; alt() shows the same ZiG amount in the other currency.
 */
let primary: 'ZIG' | 'USD' = 'ZIG';
let rate = 26.8;
export function setCurrency(next: { primary?: string; zig_per_usd?: number }) {
    if (next.primary === 'USD' || next.primary === 'ZIG') primary = next.primary;
    if (next.zig_per_usd && next.zig_per_usd > 0) rate = next.zig_per_usd;
}
const two = (n: number) => n.toLocaleString('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtZig = (n: number | undefined | null) => `ZiG ${two(n ?? 0)}`;
export const fmtUsd = (n: number | undefined | null) => `$${two(n ?? 0)}`;
/** A ZiG amount, shown in the primary currency. */
export const zig = (n: number | undefined | null) => (primary === 'USD' ? fmtUsd((n ?? 0) / rate) : fmtZig(n));
/** A ZiG amount, shown in the secondary currency. */
export const alt = (n: number | undefined | null) => (primary === 'USD' ? fmtZig(n) : fmtUsd((n ?? 0) / rate));
/** A USD amount, shown as-is. */
export const usd = fmtUsd;
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const timeAgo = (iso: string) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

/** 0771234567 / 771234567 → +263771234567 (matches the server). */
export const normalisePhone = (p: string) => {
    let d = p.replace(/\D/g, '');
    if (d.startsWith('0')) d = '263' + d.slice(1);
    else if (d.length === 9) d = '263' + d;
    return '+' + d;
};

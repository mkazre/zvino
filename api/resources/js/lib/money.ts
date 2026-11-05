/**
 * Money display. Every amount in the database is ZiG (the source of truth); what changes is which
 * currency is shown first. The primary currency comes from Admin → Settings → Currency, and visitors
 * (or staff) can switch it for themselves with the currency switcher (a cookie). app.tsx calls
 * configureMoney() with the page props before every page renders, so all helpers below agree.
 *
 *   zig(z)   a ZiG amount shown in the PRIMARY currency      ("ZiG 120.00" or "$4.48")
 *   alt(z)   the same ZiG amount in the SECONDARY currency    ("$4.48" or "ZiG 120.00"); '' when hidden
 *   both(z)  "ZiG 120.00 · $4.48" (or swapped)
 *   fmtZig / fmtUsd   fixed-currency formatters for amounts that are always in that currency
 */
export type Currency = 'ZIG' | 'USD';
export interface CurrencyProps { primary: Currency; default: Currency; show_secondary: boolean; rate: number }

const cfg: CurrencyProps = { primary: 'ZIG', default: 'ZIG', show_secondary: true, rate: 26.8 };

export function configureMoney(props: { currency?: Partial<CurrencyProps>; zigPerUsd?: number } | undefined) {
    const c = props?.currency;
    if (c?.primary === 'ZIG' || c?.primary === 'USD') cfg.primary = c.primary;
    if (c?.default === 'ZIG' || c?.default === 'USD') cfg.default = c.default;
    if (typeof c?.show_secondary === 'boolean') cfg.show_secondary = c.show_secondary;
    const r = Number(c?.rate ?? props?.zigPerUsd);
    if (r > 0) cfg.rate = r;
}

export const currency = () => cfg.primary;
export const rate = () => cfg.rate;

const two = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const fmtZig = (n: number) => `${(n || 0) < 0 ? '-' : ''}ZiG ${two.format(Math.abs(round2(n || 0)))}`;
export const fmtUsd = (n: number) => `${(n || 0) < 0 ? '-' : ''}$${two.format(Math.abs(round2(n || 0)))}`;

/** ZiG → USD at today's rate. */
export const toUsd = (z: number) => round2((z || 0) / cfg.rate);

/** A ZiG amount in the primary currency. */
export const zig = (z: number) => (cfg.primary === 'USD' ? fmtUsd((z || 0) / cfg.rate) : fmtZig(z));
/** The same ZiG amount in the secondary currency ('' when "show secondary" is off). */
export const alt = (z: number) => (!cfg.show_secondary ? '' : cfg.primary === 'USD' ? fmtZig(z) : fmtUsd((z || 0) / cfg.rate));
/** "ZiG 120.00 · $4.48", swapped when USD is primary. */
export const both = (z: number) => [zig(z), alt(z)].filter(Boolean).join(' · ');
/** A USD amount, always shown as dollars. */
export const usd = fmtUsd;

export const timeAgo = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

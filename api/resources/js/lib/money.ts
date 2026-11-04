const zigFmt = new Intl.NumberFormat('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const zig = (n: number) => `ZiG ${zigFmt.format(n || 0)}`;
export const usd = (n: number) => usdFmt.format(n || 0);

/** "ZiG 120.00 · $4.48" — every price is shown in both currencies. */
export const both = (zigAmount: number, rate: number) => `${zig(zigAmount)} · ${usd(zigAmount / (rate || 1))}`;

export const timeAgo = (iso: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

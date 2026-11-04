export const zig = (n: number | undefined | null) => `ZiG ${(n ?? 0).toLocaleString('en-ZW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const usd = (n: number | undefined | null) => `$${(n ?? 0).toFixed(2)}`;
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

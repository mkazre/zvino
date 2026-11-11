import { useSyncExternalStore } from 'react';

/**
 * Website basket, kept in localStorage so it survives sign-in and page reloads.
 * One store per basket (same rule as the app). Synced to the server at checkout.
 */
export interface CartLine {
    key: string;
    item_id: number;
    name: string;
    image: string | null;
    unit_zig: number;
    quantity: number;
    variant: string | null;
    modifiers: string[];
    notes?: string;
    /** Customer's chosen substitute (Zvino-run stores), one per line. */
    substitute?: CartSubstitute | null;
}

export interface CartSubstitute { item_id: number; name: string; image: string | null; price_zig: number }

export interface Cart {
    vendor: { id: number; name: string; slug: string; min_order_zig: number; is_shopper_store?: boolean } | null;
    lines: CartLine[];
    promo?: string;
}

// v2: v1 baskets could hold prices joined as text ("85" + "0" = "850"); start fresh.
const KEY = 'zvino.cart.v2';
const EMPTY: Cart = { vendor: null, lines: [] };
let state: Cart = load();
const listeners = new Set<() => void>();

function load(): Cart {
    if (typeof window === 'undefined') return EMPTY;
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '') as Cart;
    } catch {
        return EMPTY;
    }
}

function set(next: Cart) {
    state = next;
    try {
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* private mode */
    }
    listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => e.key === KEY && ((state = load()), listeners.forEach((l) => l())));
}

export const cart = {
    get: () => state,
    subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
    /** Returns false if the basket holds another store (caller asks to start a new basket). */
    add(vendor: NonNullable<Cart['vendor']>, line: Omit<CartLine, 'key' | 'quantity'>, quantity = 1, replace = false): boolean {
        if (state.vendor && state.vendor.id !== vendor.id && state.lines.length && !replace) return false;
        const base = state.vendor?.id === vendor.id ? state : { vendor, lines: [] };
        const key = `${line.item_id}|${line.variant ?? ''}|${[...line.modifiers].sort().join(',')}|${line.notes ?? ''}`;
        const exists = base.lines.find((l) => l.key === key);
        set({
            ...base,
            vendor,
            lines: exists ? base.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l)) : [...base.lines, { ...line, key, quantity }],
        });
        return true;
    },
    setQty(key: string, quantity: number) {
        const lines = quantity <= 0 ? state.lines.filter((l) => l.key !== key) : state.lines.map((l) => (l.key === key ? { ...l, quantity } : l));
        set(lines.length ? { ...state, lines } : EMPTY);
    },
    setSubstitute(key: string, substitute: CartSubstitute | null) {
        set({ ...state, lines: state.lines.map((l) => (l.key === key ? { ...l, substitute } : l)) });
    },
    setPromo(promo?: string) {
        set({ ...state, promo });
    },
    clear() {
        set(EMPTY);
    },
};

export function useCart() {
    const c = useSyncExternalStore(cart.subscribe, cart.get, () => EMPTY);
    const count = c.lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = c.lines.reduce((s, l) => s + l.unit_zig * l.quantity, 0);
    // Up-front buffer for substitutes dearer than the original.
    const buffer = c.vendor?.is_shopper_store ? c.lines.reduce((s, l) => s + (l.substitute ? Math.max(0, l.substitute.price_zig - l.unit_zig) * l.quantity : 0), 0) : 0;
    return { ...c, count, subtotal, buffer };
}

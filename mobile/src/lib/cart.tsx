import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

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
}
export interface CartStore { id: number; name: string; min_order_zig: number }

interface CartCtx {
    store: CartStore | null;
    lines: CartLine[];
    count: number;
    subtotal: number;
    /** false = basket holds another store; caller asks the customer to start a new basket. */
    add: (store: CartStore, line: Omit<CartLine, 'key' | 'quantity'>, qty?: number, replace?: boolean) => boolean;
    setQty: (key: string, qty: number) => void;
    clear: () => void;
    /** Push the device basket into the server cart before checkout (server re-prices everything). */
    syncToServer: () => Promise<void>;
}

// v2: v1 baskets could hold prices joined as text ("85" + "0" = "850"); start fresh.
const KEY = 'zvino.cart.v2';
const Ctx = createContext<CartCtx>(null as unknown as CartCtx);

export function CartProvider({ children }: { children: ReactNode }) {
    const [store, setStore] = useState<CartStore | null>(null);
    const [lines, setLines] = useState<CartLine[]>([]);

    useEffect(() => {
        AsyncStorage.getItem(KEY).then((raw) => {
            if (!raw) return;
            try {
                const c = JSON.parse(raw);
                setStore(c.store);
                setLines(c.lines ?? []);
            } catch {
                /* corrupt cache */
            }
        });
    }, []);
    useEffect(() => {
        AsyncStorage.setItem(KEY, JSON.stringify({ store, lines })).catch(() => {});
    }, [store, lines]);

    const add = useCallback<CartCtx['add']>((s, line, qty = 1, replace = false) => {
        if (store && store.id !== s.id && lines.length && !replace) return false;
        const base = store?.id === s.id ? lines : [];
        const key = `${line.item_id}|${line.variant ?? ''}|${[...line.modifiers].sort().join(',')}|${line.notes ?? ''}`;
        const exists = base.find((l) => l.key === key);
        setStore(s);
        setLines(exists ? base.map((l) => (l.key === key ? { ...l, quantity: l.quantity + qty } : l)) : [...base, { ...line, key, quantity: qty }]);
        return true;
    }, [store, lines]);

    const setQty = useCallback((key: string, qty: number) => {
        setLines((ls) => {
            const next = qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: qty } : l));
            if (!next.length) setStore(null);
            return next;
        });
    }, []);

    const clear = useCallback(() => {
        setLines([]);
        setStore(null);
    }, []);

    const syncToServer = useCallback(async () => {
        await api.delete('/cart');
        for (const [i, l] of lines.entries()) {
            await api.post('/cart/items', { item_id: l.item_id, quantity: l.quantity, variant: l.variant, modifiers: l.modifiers, notes: l.notes, replace: i === 0 });
        }
    }, [lines]);

    const value = useMemo(() => ({
        store, lines, add, setQty, clear, syncToServer,
        count: lines.reduce((s, l) => s + l.quantity, 0),
        subtotal: lines.reduce((s, l) => s + l.unit_zig * l.quantity, 0),
    }), [store, lines, add, setQty, clear, syncToServer]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);

import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';
import { enqueue, setQueueSender } from './network';

const TOKEN_KEY = 'zvino.token';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
        public errors: Record<string, string[]> = {},
    ) {
        super(message);
    }
    /** First field error, or the message: what to show the user. */
    get friendly() {
        return Object.values(this.errors)[0]?.[0] ?? this.message;
    }
}

export const auth = {
    async load() {
        token = await SecureStore.getItemAsync(TOKEN_KEY);
        return token;
    },
    async set(t: string | null) {
        token = t;
        if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
        else await SecureStore.deleteItemAsync(TOKEN_KEY);
    },
    get: () => token,
    onUnauthorized(fn: () => void) {
        onUnauthorized = fn;
    },
};

type Body = Record<string, unknown> | FormData | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    let res: Response;
    try {
        res = await fetch(`${API_URL}/api${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                ...(isForm ? {} : { 'Content-Type': 'application/json' }),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
        });
    } catch {
        throw new ApiError('No connection. Check your data or Wi-Fi and try again.', 0);
    }

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) {
        await auth.set(null);
        onUnauthorized?.();
    }
    if (!res.ok) throw new ApiError(data.message ?? 'Something went wrong.', res.status, data.errors);
    return data as T;
}

export const api = {
    /** Fire-and-forget background call: if offline it's queued and resent when the connection is back. */
    background: async (method: 'POST' | 'PATCH', path: string, body?: Record<string, unknown>) => {
        try {
            return await request(method, path, body);
        } catch (e) {
            if (e instanceof ApiError && e.status === 0) await enqueue({ method, path, body });
            return undefined;
        }
    },
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: Body) => request<T>('POST', path, body),
    patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body),
    put: <T>(path: string, body?: Body) => request<T>('PUT', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
};

export interface Money {
    zig: number;
    usd: number;
}

setQueueSender((q) => request(q.method, q.path, q.body));

import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { auth } from './api';
import { API_URL } from './config';

/**
 * Till slips upload on their own, in the background, as soon as the photo is taken:
 * progress is shown, failures retry automatically (also after the app restarts), and the driver
 * can finish shopping and start the delivery without waiting. The slip appears on the order in the
 * admin panel when it arrives.
 */
export type SlipState = { status: 'idle' | 'uploading' | 'done' | 'retrying'; progress: number };

const DIR = `${FileSystem.documentDirectory}slips/`;
const QUEUE = `${FileSystem.documentDirectory}pending-slips.json`;
const RETRY_S = [3, 8, 20, 45, 90];

const states = new Map<number, SlipState>();
const listeners = new Set<() => void>();
const running = new Set<number>();
const attempts = new Map<number, number>();

function set(orderId: number, s: SlipState) {
    states.set(orderId, s);
    listeners.forEach((l) => l());
}

async function readQueue(): Promise<Record<string, string>> {
    try {
        return JSON.parse(await FileSystem.readAsStringAsync(QUEUE));
    } catch {
        return {};
    }
}
async function writeQueue(q: Record<string, string>) {
    await FileSystem.writeAsStringAsync(QUEUE, JSON.stringify(q)).catch(() => {});
}

/** Keep the photo safe in app storage and start uploading it (a retake replaces the earlier one). */
export async function queueSlip(orderId: number, uri: string) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => {});
    const dest = `${DIR}order-${orderId}-${Date.now()}.jpg`;
    await FileSystem.copyAsync({ from: uri, to: dest }).catch(() => {});
    const q = await readQueue();
    if (q[orderId] && q[orderId] !== dest) await FileSystem.deleteAsync(q[orderId], { idempotent: true }).catch(() => {});
    q[orderId] = (await FileSystem.getInfoAsync(dest)).exists ? dest : uri;
    await writeQueue(q);
    attempts.set(orderId, 0);
    upload(orderId, q[orderId]);
}

async function upload(orderId: number, uri: string) {
    if (running.has(orderId)) return;
    running.add(orderId);
    set(orderId, { status: 'uploading', progress: 0 });
    let ok = false;
    try {
        const task = FileSystem.createUploadTask(`${API_URL}/api/driver/jobs/${orderId}/shop/slip`, uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'slip',
            mimeType: 'image/jpeg',
            headers: { Accept: 'application/json', ...(auth.get() ? { Authorization: `Bearer ${auth.get()}` } : {}) },
        }, ({ totalBytesSent, totalBytesExpectedToSend }) => {
            if (totalBytesExpectedToSend > 0) set(orderId, { status: 'uploading', progress: Math.min(0.99, totalBytesSent / totalBytesExpectedToSend) });
        });
        const res = await task.uploadAsync();
        ok = !!res && res.status >= 200 && res.status < 300;
        // These won't succeed by retrying (not the driver's order any more, photo rejected).
        if (res && [403, 413, 422].includes(res.status)) {
            await forget(orderId);
            set(orderId, { status: 'idle', progress: 0 });
            running.delete(orderId);
            return;
        }
    } catch {
        ok = false;
    }
    running.delete(orderId);

    if (ok) {
        await forget(orderId);
        set(orderId, { status: 'done', progress: 1 });
        return;
    }
    const n = (attempts.get(orderId) ?? 0) + 1;
    attempts.set(orderId, n);
    set(orderId, { status: 'retrying', progress: states.get(orderId)?.progress ?? 0 });
    setTimeout(() => { readQueue().then((q) => { if (q[orderId]) upload(orderId, q[orderId]); }); }, RETRY_S[Math.min(n - 1, RETRY_S.length - 1)] * 1000);
}

async function forget(orderId: number) {
    const q = await readQueue();
    if (q[orderId]) await FileSystem.deleteAsync(q[orderId], { idempotent: true }).catch(() => {});
    delete q[orderId];
    await writeQueue(q);
}

/** Try again now (driver tapped retry, or the connection came back). */
export function retrySlip(orderId: number) {
    attempts.set(orderId, 0);
    readQueue().then((q) => { if (q[orderId]) upload(orderId, q[orderId]); });
}

/** On app start: carry on with any slips that hadn't finished uploading. */
export async function resumeSlipUploads() {
    const q = await readQueue();
    Object.entries(q).forEach(([id, uri]) => upload(Number(id), uri));
}

export function useSlipUpload(orderId: number): SlipState {
    const [, render] = useState(0);
    useEffect(() => {
        const l = () => render((n) => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
    }, []);
    return states.get(orderId) ?? { status: 'idle', progress: 0 };
}

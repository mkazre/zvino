/** Upload one file with progress (XHR; sends Laravel's XSRF cookie). Resolves with the JSON response. */
export function uploadFile<T = unknown>(url: string, file: File | Blob, onProgress?: (pct: number) => void, extra: Record<string, string> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
        const body = new FormData();
        body.append('file', file, file instanceof File ? file.name : 'upload.jpg');
        Object.entries(extra).forEach(([k, v]) => body.append(k, v));
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        const token = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='))?.split('=')[1];
        if (token) xhr.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(token));
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
            let json: { message?: string; errors?: Record<string, string[]> } & Record<string, unknown> = {};
            try {
                json = JSON.parse(xhr.responseText || '{}');
            } catch {
                /* not JSON */
            }
            if (xhr.status >= 200 && xhr.status < 300) resolve(json as T);
            else if (xhr.status === 413) reject(new Error('That file is too big to upload. Try a smaller photo.'));
            else if (xhr.status === 419) reject(new Error('Your session expired. Refresh the page and try again.'));
            else if (xhr.status === 429) reject(new Error('Too many uploads at once. Wait a minute and try again.'));
            else reject(new Error(json.errors ? Object.values(json.errors)[0]?.[0] : json.message || 'Upload failed. Check your connection and try again.'));
        };
        xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
        xhr.send(body);
    });
}

/**
 * Shrink big phone photos before upload (keeps documents readable, saves data and avoids small server
 * upload limits). PDFs and small images pass through untouched.
 */
export async function shrinkImage(file: File, maxSide = 2000, quality = 0.85): Promise<File | Blob> {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_200_000) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

export const fileSize = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

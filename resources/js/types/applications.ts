/** Mirrors App\Support\Applications (one definition drives the website form and the admin review). */
export type FieldType = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'choice' | 'chips' | 'bool' | 'time' | 'date' | 'file';

export interface AppField {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    options?: Record<string, string>;
    placeholder?: string;
    hint?: string;
    max?: number;
    min?: number;
    half?: boolean;
    show_if?: Record<string, string[]>;
    accept?: 'image' | 'doc';
    multiple?: boolean;
}

export interface AppStep {
    key: string;
    title: string;
    icon?: string;
    description?: string;
    fields: AppField[];
}

export interface AppSchema {
    type: 'restaurant' | 'driver' | 'corporate';
    label: string;
    title: string;
    intro: string;
    steps: AppStep[];
    terms: string;
}

export interface UploadedFile {
    token: string;
    name: string;
    size: number;
    mime: string;
}

export type Answers = Record<string, string | number | boolean | string[] | UploadedFile | UploadedFile[] | null | undefined>;

export const isVisible = (f: AppField, data: Answers) =>
    Object.entries(f.show_if ?? {}).every(([k, vals]) => vals.map(String).includes(String(data[k] ?? '')));

/** Human-readable answer for review screens. */
export function displayValue(f: AppField, v: Answers[string]): string {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return '';
    if (f.type === 'bool') return v ? 'Yes' : 'No';
    if (f.type === 'chips' && Array.isArray(v)) return (v as string[]).map((x) => f.options?.[x] ?? x).join(', ');
    if ((f.type === 'select' || f.type === 'choice') && f.options) return f.options[String(v)] ?? String(v);
    if (f.type === 'file') return (Array.isArray(v) ? v : [v]).map((x) => (x as UploadedFile).name).join(', ');
    if (f.type === 'date' && typeof v === 'string') return new Date(v).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', year: 'numeric' });
    return String(v);
}

import { Button } from '@/components/ui/button';
import SiteLayout from '@/layouts/site-layout';
import { cn } from '@/lib/utils';
import { fileSize, shrinkImage, uploadFile } from '@/lib/upload';
import { type AppField, type AppSchema, type Answers, type UploadedFile, displayValue, isVisible } from '@/types/applications';
import { Head, router } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, Bike, Building2, Check, FileText, ImageIcon, Loader2, MapPin, Pencil, Store, Upload, User, UtensilsCrossed, Wallet, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const ICONS = { store: Store, 'map-pin': MapPin, user: User, wallet: Wallet, file: FileText, bike: Bike, building: Building2, utensils: UtensilsCrossed } as const;
const storageKey = (type: string) => `zvino.apply.${type}`;
const omit = (o: Record<string, string>, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k));

/**
 * Website sign-up wizard for restaurants/shops, drivers and corporate accounts. Built from the server
 * schema (App\Support\Applications). Answers autosave in this browser; files upload as they're picked.
 */
export default function Apply({ schema, closed }: { schema: AppSchema; closed: boolean }) {
    const steps = schema.steps;
    const reviewIndex = steps.length;
    const [step, setStep] = useState(0);
    const [answers, setAnswers] = useState<Answers>(() => {
        try {
            return JSON.parse(localStorage.getItem(storageKey(schema.type)) ?? '{}') as Answers;
        } catch {
            return {};
        }
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [terms, setTerms] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(0);
    const top = useRef<HTMLDivElement>(null);

    useEffect(() => {
        try {
            localStorage.setItem(storageKey(schema.type), JSON.stringify(answers));
        } catch {
            /* private mode */
        }
    }, [answers, schema.type]);

    const set = (k: string, v: Answers[string]) => {
        setAnswers((a) => ({ ...a, [k]: v }));
        if (errors[k]) setErrors((e) => omit(e, k));
    };

    const go = (i: number) => {
        setStep(i);
        requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const missing = (fields: AppField[]) => {
        const e: Record<string, string> = {};
        for (const f of fields) {
            if (!f.required || !isVisible(f, answers)) continue;
            const v = answers[f.key];
            const empty = v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);
            if (empty) e[f.key] = f.type === 'file' ? 'Please upload this.' : f.type === 'bool' ? 'Please confirm.' : f.type === 'chips' || f.type === 'choice' ? 'Please choose at least one.' : 'This is required.';
            else if (f.type === 'email' && typeof v === 'string' && !/^\S+@\S+\.\S+$/.test(v)) e[f.key] = 'Enter a valid email address.';
            else if (f.type === 'tel' && typeof v === 'string' && v.replace(/\D/g, '').length < 9) e[f.key] = 'Enter a full phone number.';
        }
        return e;
    };

    const next = () => {
        const e = missing(steps[step].fields);
        setErrors(e);
        if (Object.keys(e).length) {
            document.getElementById(`f-${Object.keys(e)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        go(step + 1);
    };

    const submit = () => {
        const all = missing(steps.flatMap((s) => s.fields));
        if (Object.keys(all).length) {
            setErrors(all);
            go(steps.findIndex((s) => s.fields.some((f) => all[f.key])));
            return;
        }
        if (!terms) {
            setErrors({ accept_terms: 'Please tick the box to continue.' });
            return;
        }
        const payload: Record<string, unknown> = {};
        for (const s of steps)
            for (const f of s.fields) {
                if (!isVisible(f, answers)) continue;
                const v = answers[f.key];
                if (v === undefined) continue;
                payload[f.key] = f.type === 'file' ? (Array.isArray(v) ? (v as UploadedFile[]).map((x) => x.token) : (v as UploadedFile | null)?.token ?? null) : v;
            }
        setSubmitting(true);
        router.post(`/apply/${schema.type}`, { answers: payload, accept_terms: terms } as never, {
            preserveScroll: true,
            onSuccess: () => {
                try {
                    localStorage.removeItem(storageKey(schema.type));
                } catch {
                    /* ignore */
                }
            },
            onError: (errs) => {
                const mapped: Record<string, string> = {};
                Object.entries(errs).forEach(([k, v]) => (mapped[k.replace(/^answers\./, '').replace(/\.\d+$/, '')] = v));
                setErrors(mapped);
                const first = steps.findIndex((s) => s.fields.some((f) => mapped[f.key]));
                if (first >= 0) go(first);
            },
            onFinish: () => setSubmitting(false),
        });
    };

    const progress = Math.round((step / (steps.length + 1)) * 100);

    return (
        <SiteLayout hideCart>
            <Head title={schema.title} />
            <div ref={top} className="scroll-mt-24" />
            <section className="bg-[#1c1c1c] text-white">
                <div className="mx-auto max-w-3xl px-4 py-10 md:px-6 md:py-14">
                    <p className="text-brand text-sm font-bold">{schema.label} sign-up</p>
                    <h1 className="mt-2 text-[32px] leading-[1.05] font-extrabold tracking-[-0.04em] md:text-[44px]">{schema.title}</h1>
                    <p className="mt-3 max-w-2xl text-white/65">{schema.intro}</p>
                </div>
            </section>

            {closed ? (
                <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6">
                    <h2 className="text-2xl font-bold">Applications are closed right now</h2>
                    <p className="text-muted-foreground mt-2">We have enough drivers in most areas at the moment. Please check back soon.</p>
                </div>
            ) : (
                <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[220px_minmax(0,1fr)] md:px-6 md:py-12">
                    {/* Steps */}
                    <aside className="md:sticky md:top-24 md:self-start">
                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 md:hidden dark:bg-white/10"><div className="bg-brand h-full rounded-full transition-all" style={{ width: `${Math.max(6, progress)}%` }} /></div>
                        <p className="text-muted-foreground text-sm md:hidden">Step {Math.min(step + 1, reviewIndex + 1)} of {reviewIndex + 1} · <b className="text-foreground">{step === reviewIndex ? 'Review & submit' : steps[step].title}</b></p>
                        <ol className="hidden gap-1 md:grid">
                            {[...steps.map((s) => s.title), 'Review & submit'].map((t, i) => {
                                const done = i < step;
                                const Icon = i === reviewIndex ? Check : (ICONS[steps[i]?.icon as keyof typeof ICONS] ?? FileText);
                                return (
                                    <li key={t}>
                                        <button type="button" disabled={i > step} onClick={() => go(i)} className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition', i === step ? 'bg-neutral-100 font-bold dark:bg-white/10' : done ? 'hover:bg-neutral-50 dark:hover:bg-white/5' : 'text-muted-foreground')}>
                                            <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', done ? 'bg-brand text-black' : i === step ? 'bg-[#1c1c1c] text-white dark:bg-white dark:text-black' : 'bg-neutral-100 dark:bg-white/10')}>
                                                {done ? <Check className="size-4" /> : <Icon className="size-3.5" />}
                                            </span>
                                            {t}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </aside>

                    <div className="min-w-0">
                        {step < reviewIndex ? (
                            <div className="rounded-3xl border p-5 md:p-8">
                                <h2 className="text-2xl font-extrabold tracking-tight">{steps[step].title}</h2>
                                {steps[step].description && <p className="text-muted-foreground mt-1">{steps[step].description}</p>}
                                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                                    {steps[step].fields.filter((f) => isVisible(f, answers)).map((f) => (
                                        <FieldInput key={f.key} f={f} value={answers[f.key]} error={errors[f.key]} onChange={(v) => set(f.key, v)} onUploading={(d) => setUploading((n) => n + d)} />
                                    ))}
                                </div>
                                <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
                                    {step > 0 ? <Button type="button" variant="ghost" className="h-12 rounded-full px-5" onClick={() => go(step - 1)}><ArrowLeft /> Back</Button> : <span />}
                                    <Button type="button" variant="ink" className="h-12 rounded-full px-7 text-[15px]" disabled={uploading > 0} onClick={next}>
                                        {uploading > 0 ? <><Loader2 className="animate-spin" /> Uploading…</> : <>Continue <ArrowRight /></>}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-3xl border p-5 md:p-8">
                                <h2 className="text-2xl font-extrabold tracking-tight">Check and submit</h2>
                                <p className="text-muted-foreground mt-1">Make sure everything is right. You can go back and change anything.</p>
                                <div className="mt-6 grid gap-4">
                                    {steps.map((s, i) => (
                                        <div key={s.key} className="rounded-2xl bg-neutral-50 p-4 dark:bg-white/5">
                                            <div className="mb-2 flex items-center justify-between">
                                                <h3 className="font-bold">{s.title}</h3>
                                                <button type="button" onClick={() => go(i)} className="flex items-center gap-1 text-sm font-semibold hover:underline"><Pencil className="size-3.5" /> Edit</button>
                                            </div>
                                            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                                                {s.fields.filter((f) => isVisible(f, answers) && displayValue(f, answers[f.key])).map((f) => (
                                                    <div key={f.key} className={cn('min-w-0', f.type === 'textarea' && 'sm:col-span-2')}>
                                                        <dt className="text-muted-foreground text-xs">{f.label}</dt>
                                                        <dd className={cn('font-medium break-words', errors[f.key] && 'text-zred')}>{displayValue(f, answers[f.key])}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    ))}
                                </div>
                                <label className={cn('mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm', errors.accept_terms && 'border-zred')}>
                                    <input type="checkbox" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErrors((e) => omit(e, 'accept_terms')); }} className="accent-brand mt-0.5 size-5 shrink-0" />
                                    <span>{schema.terms} <a href="/p/terms" target="_blank" className="font-semibold underline">Read the terms</a>.</span>
                                </label>
                                {errors.accept_terms && <p className="text-zred mt-2 text-sm">{errors.accept_terms}</p>}
                                <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
                                    <Button type="button" variant="ghost" className="h-12 rounded-full px-5" onClick={() => go(step - 1)}><ArrowLeft /> Back</Button>
                                    <Button type="button" className="h-12 rounded-full px-7 text-[15px]" disabled={submitting} onClick={submit}>
                                        {submitting ? <><Loader2 className="animate-spin" /> Sending…</> : <>Submit application <Check /></>}
                                    </Button>
                                </div>
                            </div>
                        )}
                        <p className="text-muted-foreground mt-4 text-center text-xs">Your answers are saved on this device until you submit. Your documents are only seen by the Zvino team.</p>
                    </div>
                </div>
            )}
        </SiteLayout>
    );
}

const inputCls = (error?: string) => cn('h-12 w-full rounded-xl border bg-white px-4 text-[15px] outline-none transition focus:border-[#222222] focus:ring-4 focus:ring-[#222222]/5 dark:bg-white/5 dark:focus:border-white', error && 'border-zred');

function FieldInput({ f, value, error, onChange, onUploading }: { f: AppField; value: Answers[string]; error?: string; onChange: (v: Answers[string]) => void; onUploading: (delta: number) => void }) {
    const full = !f.half || ['textarea', 'choice', 'chips', 'bool', 'file'].includes(f.type);
    const id = `f-${f.key}`;
    const labelEl = (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
            {f.label} {!f.required && f.type !== 'bool' && <span className="text-muted-foreground font-normal">(optional)</span>}
        </label>
    );
    const help = (error || f.hint) && <p className={cn('mt-1.5 text-[13px]', error ? 'text-zred' : 'text-muted-foreground')}>{error || f.hint}</p>;

    let control: React.ReactNode;
    switch (f.type) {
        case 'textarea':
            control = <textarea id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} maxLength={f.max} placeholder={f.placeholder} rows={3} className={cn(inputCls(error), 'h-auto min-h-24 py-3')} />;
            break;
        case 'select':
            control = (
                <select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={inputCls(error)}>
                    <option value="">Choose…</option>
                    {Object.entries(f.options ?? {}).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
            );
            break;
        case 'choice':
            control = (
                <div id={id} role="radiogroup" className={cn('grid gap-2', Object.keys(f.options ?? {}).length > 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3')}>
                    {Object.entries(f.options ?? {}).map(([v, l]) => (
                        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn('flex min-h-12 items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold transition', value === v ? 'border-[#222222] bg-[#222222]/[0.04] ring-1 ring-[#222222] dark:border-white dark:ring-white' : 'hover:border-neutral-400', error && value !== v && 'border-zred/60')}>
                            <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border-2', value === v ? 'border-[#222222] dark:border-white' : 'border-neutral-300')}>{value === v && <span className="size-2 rounded-full bg-[#222222] dark:bg-white" />}</span>
                            {l}
                        </button>
                    ))}
                </div>
            );
            break;
        case 'chips': {
            const arr = Array.isArray(value) ? (value as string[]) : [];
            control = (
                <div id={id} className="flex flex-wrap gap-2">
                    {Object.entries(f.options ?? {}).map(([v, l]) => {
                        const on = arr.includes(v);
                        return (
                            <button key={v} type="button" aria-pressed={on} onClick={() => onChange(on ? arr.filter((x) => x !== v) : [...arr, v])} className={cn('flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition', on ? 'border-[#222222] bg-[#222222] text-white dark:border-white dark:bg-white dark:text-black' : 'hover:border-neutral-400')}>
                                {on && <Check className="size-3.5" />}{l}
                            </button>
                        );
                    })}
                </div>
            );
            break;
        }
        case 'bool':
            return (
                <div className="sm:col-span-2">
                    <label id={id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-medium', error && 'border-zred')}>
                        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="accent-brand size-5 shrink-0" />
                        {f.label}
                    </label>
                    {help}
                </div>
            );
        case 'file':
            control = <FileField id={id} f={f} value={value as UploadedFile | UploadedFile[] | null} error={error} onChange={onChange} onUploading={onUploading} />;
            break;
        default:
            control = (
                <input id={id} type={f.type === 'tel' ? 'tel' : f.type} inputMode={f.type === 'tel' ? 'tel' : f.type === 'number' ? 'decimal' : undefined} autoComplete={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : undefined}
                    value={value === undefined || value === null ? '' : String(value)} min={f.min} max={f.type === 'number' ? f.max : undefined} maxLength={f.type !== 'number' ? f.max : undefined}
                    placeholder={f.placeholder ?? (f.type === 'tel' ? '077 123 4567' : undefined)}
                    onChange={(e) => onChange(f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} className={inputCls(error)} />
            );
    }
    return <div className={cn('min-w-0', full && 'sm:col-span-2')}>{labelEl}{control}{help}</div>;
}

function FileField({ id, f, value, error, onChange, onUploading }: { id: string; f: AppField; value: UploadedFile | UploadedFile[] | null; error?: string; onChange: (v: Answers[string]) => void; onUploading: (d: number) => void }) {
    const files = (Array.isArray(value) ? value : value ? [value] : []) as UploadedFile[];
    const [busy, setBusy] = useState<{ name: string; pct: number }[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const accept = f.accept === 'image' ? 'image/jpeg,image/png,image/webp,image/heic' : 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
    const current = useRef(files);
    current.current = files;

    const pick = async (list: FileList | null) => {
        if (!list?.length) return;
        setErr(null);
        const chosen = Array.from(list).slice(0, f.multiple ? 12 : 1);
        for (const file of chosen) {
            setBusy((b) => [...b, { name: file.name, pct: 0 }]);
            onUploading(1);
            try {
                const small = await shrinkImage(file);
                const res = await uploadFile<UploadedFile>('/apply/upload', small, (pct) => setBusy((b) => b.map((x) => (x.name === file.name ? { ...x, pct } : x))));
                const item = { token: res.token, name: file.name, size: res.size, mime: res.mime };
                onChange(f.multiple ? [...current.current, item] : item);
            } catch (e) {
                setErr((e as Error).message);
            } finally {
                setBusy((b) => b.filter((x) => x.name !== file.name));
                onUploading(-1);
            }
        }
    };

    const remove = (i: number) => onChange(f.multiple ? files.filter((_, j) => j !== i) : null);

    return (
        <div id={id} className="grid gap-2">
            {files.map((x, i) => (
                <div key={x.token} className="flex items-center gap-3 rounded-xl border bg-neutral-50 px-3 py-2.5 text-sm dark:bg-white/5">
                    <span className="bg-brand/15 text-brand-700 flex size-9 shrink-0 items-center justify-center rounded-lg dark:text-brand">{x.mime?.startsWith('image/') ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{x.name}</span><span className="text-muted-foreground text-xs">{fileSize(x.size)} · uploaded</span></span>
                    <Check className="text-brand size-4 shrink-0" />
                    <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-foreground rounded-full p-1" aria-label={`Remove ${x.name}`}><X className="size-4" /></button>
                </div>
            ))}
            {busy.map((b) => (
                <div key={b.name} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
                    <Loader2 className="size-4 shrink-0 animate-spin" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    <span className="tabular text-muted-foreground text-xs">{b.pct}%</span>
                </div>
            ))}
            {(f.multiple || files.length === 0) && (
                <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition hover:border-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5', error && 'border-zred/70')}>
                    <Upload className="text-muted-foreground size-5" />
                    <span className="font-semibold">{files.length ? 'Add another' : f.accept === 'image' ? 'Upload a photo' : 'Upload a photo or PDF'}</span>
                    <span className="text-muted-foreground text-xs">{f.accept === 'image' ? 'JPG or PNG' : 'JPG, PNG or PDF'} · up to 10 MB{f.multiple ? ' · you can pick several' : ''}</span>
                    <input type="file" className="sr-only" accept={accept} multiple={f.multiple} capture={f.key === 'selfie' ? 'user' : undefined} onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
                </label>
            )}
            {err && <p className="text-zred text-[13px]">{err}</p>}
        </div>
    );
}


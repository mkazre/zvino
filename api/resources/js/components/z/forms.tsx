import { cn } from '@/lib/utils';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
    'bg-surface placeholder:text-muted-foreground/70 border-input focus-visible:border-ring focus-visible:ring-ring/15 w-full rounded-lg border text-sm transition outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-zred aria-invalid:ring-zred/10';

export function Field({ label, hint, error, children, className, optional, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; optional?: boolean; htmlFor?: string }) {
    return (
        <div className={cn('grid gap-1.5', className)}>
            {label && (
                <label htmlFor={htmlFor} className="flex items-center justify-between text-[13px] font-medium">
                    <span>{label}</span>
                    {optional && <span className="text-muted-foreground text-xs font-normal">Optional</span>}
                </label>
            )}
            {children}
            {error ? <p className="text-zred text-xs">{error}</p> : hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
        </div>
    );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode; invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, prefix, suffix, invalid, ...props }, ref) {
    if (!prefix && !suffix) {
        return <input ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'h-10 px-3', className)} {...props} />;
    }
    return (
        <div className={cn(control, 'flex h-10 items-center gap-2 px-3 focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15', invalid && 'border-zred', className)}>
            {prefix && <span className="text-muted-foreground shrink-0 text-sm">{prefix}</span>}
            <input ref={ref} className="h-full min-w-0 flex-1 bg-transparent outline-none" {...props} />
            {suffix && <span className="text-muted-foreground shrink-0 text-sm">{suffix}</span>}
        </div>
    );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...props }, ref) {
    return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'min-h-[88px] px-3 py-2.5 leading-relaxed', className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, children, invalid, ...props }, ref) {
    return (
        <select
            ref={ref}
            aria-invalid={invalid || undefined}
            className={cn(
                control,
                "h-10 appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b716d' stroke-width='1.8' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[right_10px_center] bg-no-repeat pr-9 pl-3",
                className,
            )}
            {...props}
        >
            {children}
        </select>
    );
});

export function Switch({ checked, onChange, label, description, disabled, size = 'md' }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; size?: 'sm' | 'md' }) {
    const sw = (
        <SwitchPrimitive.Root
            checked={checked}
            onCheckedChange={onChange}
            disabled={disabled}
            className={cn(
                'data-[state=checked]:bg-primary bg-input focus-visible:ring-ring/25 relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
                size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
            )}
        >
            <SwitchPrimitive.Thumb
                className={cn(
                    'pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform',
                    size === 'sm' ? 'size-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]' : 'size-5 translate-x-0.5 data-[state=checked]:translate-x-[22px]',
                )}
            />
        </SwitchPrimitive.Root>
    );
    if (!label) return sw;
    return (
        <label className={cn('flex cursor-pointer items-start justify-between gap-6', disabled && 'cursor-not-allowed opacity-60')}>
            <span className="min-w-0">
                <span className="block text-sm font-medium">{label}</span>
                {description && <span className="text-muted-foreground mt-0.5 block text-[13px] leading-relaxed">{description}</span>}
            </span>
            {sw}
        </label>
    );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, onSubmit }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; onSubmit?: () => void }) {
    return (
        <form
            className={cn('relative', className)}
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit?.();
            }}
        >
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(control, 'h-9 pr-8 pl-9')} />
            {value && (
                <button
                    type="button"
                    onClick={() => {
                        onChange('');
                        setTimeout(() => onSubmit?.(), 0);
                    }}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 p-0.5"
                    aria-label="Clear"
                >
                    <X className="size-3.5" />
                </button>
            )}
        </form>
    );
}

/** iOS-style segmented control, used for filters, time ranges, modes. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
    return (
        <div className={cn('bg-muted inline-flex items-center gap-0.5 rounded-lg p-0.5', className)} role="tablist">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition',
                        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
                        value === o.value ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.label}
                    {o.count !== undefined && <span className={cn('tabular text-[11px]', value === o.value ? 'text-muted-foreground' : 'opacity-70')}>{o.count}</span>}
                </button>
            ))}
        </div>
    );
}

/** Underlined page tabs (Orders: All / Active / …). */
export function TabBar<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
    return (
        <div className="scroll-quiet -mb-px flex gap-6 overflow-x-auto border-b">
            {options.map((o) => (
                <button
                    key={o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'flex shrink-0 items-center gap-2 border-b-2 pt-1 pb-3 text-sm font-medium transition',
                        value === o.value ? 'border-foreground text-foreground' : 'text-muted-foreground hover:text-foreground border-transparent',
                    )}
                >
                    {o.label}
                    {o.count !== undefined && (
                        <span className={cn('tabular rounded-full px-1.5 py-px text-[11px] font-semibold', value === o.value ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground')}>{o.count}</span>
                    )}
                </button>
            ))}
        </div>
    );
}

export function Checkbox({ checked, onChange, label, indeterminate }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; indeterminate?: boolean }) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
                type="checkbox"
                checked={checked}
                ref={(el) => {
                    if (el) el.indeterminate = !!indeterminate;
                }}
                onChange={(e) => onChange(e.target.checked)}
                className="accent-[var(--primary)] size-4 cursor-pointer rounded"
            />
            {label}
        </label>
    );
}

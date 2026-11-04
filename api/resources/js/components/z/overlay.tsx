import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { AlertTriangle, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

/** Right-side panel for create/edit forms and detail views. Keeps the list visible behind it. */
export function Drawer({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    width = 'md',
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    width?: 'sm' | 'md' | 'lg' | 'xl';
}) {
    const w = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[width];
    return (
        <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
                <Dialog.Content
                    className={cn(
                        'bg-surface data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right fixed inset-y-0 right-0 z-50 flex w-full flex-col shadow-(--shadow-pop) duration-200 sm:border-l',
                        w,
                    )}
                >
                    <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
                        <div className="min-w-0">
                            <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">{title}</Dialog.Title>
                            {description ? <Dialog.Description className="text-muted-foreground mt-1 text-sm">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{String(title)}</Dialog.Description>}
                        </div>
                        <Dialog.Close className="text-muted-foreground hover:bg-muted hover:text-foreground -mr-2 rounded-md p-1.5" aria-label="Close">
                            <X className="size-5" />
                        </Dialog.Close>
                    </header>
                    <div className="scroll-quiet flex-1 overflow-y-auto px-6 py-5">{children}</div>
                    {footer && <footer className="bg-subtle flex items-center justify-end gap-2 border-t px-6 py-4">{footer}</footer>}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/** Centered modal for focused tasks. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
    const w = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }[size];
    return (
        <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
                <Dialog.Content
                    className={cn(
                        'bg-surface data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border shadow-(--shadow-pop) duration-150',
                        w,
                    )}
                >
                    <div className="px-6 pt-6">
                        <Dialog.Title className="text-lg font-semibold tracking-[-0.01em]">{title}</Dialog.Title>
                        {description ? <Dialog.Description className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{String(title)}</Dialog.Description>}
                    </div>
                    {children && <div className="px-6 pt-5">{children}</div>}
                    <div className="flex justify-end gap-2 px-6 pt-6 pb-6">{footer}</div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

export function Popover({ trigger, children, align = 'end', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
    return (
        <PopoverPrimitive.Root>
            <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    align={align}
                    sideOffset={8}
                    className={cn('bg-popover data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-50 rounded-xl border p-1 shadow-(--shadow-pop)', className)}
                >
                    {children}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

// ── Confirm dialog as a promise: `if (await confirm({...})) …` ─────────

interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    tone?: 'default' | 'danger';
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
    const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
    const close = (v: boolean) => {
        state?.resolve(v);
        setState(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <Modal
                open={!!state}
                onClose={() => close(false)}
                size="sm"
                title={
                    <span className="flex items-center gap-2.5">
                        {state?.tone === 'danger' && (
                            <span className="bg-zred-50 dark:bg-zred/15 flex size-8 items-center justify-center rounded-full">
                                <AlertTriangle className="text-zred size-4" />
                            </span>
                        )}
                        {state?.title}
                    </span>
                }
                description={state?.description}
                footer={
                    <>
                        <Button variant="outline" onClick={() => close(false)}>
                            Cancel
                        </Button>
                        <Button variant={state?.tone === 'danger' ? 'destructive' : 'default'} onClick={() => close(true)} autoFocus>
                            {state?.confirmLabel ?? 'Confirm'}
                        </Button>
                    </>
                }
            />
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => useContext(ConfirmContext);

import { Button } from '@/components/ui/button';
import { Logo } from '@/layouts/site-layout';
import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Toaster } from 'sonner';

export default function SignIn({ phone: sentTo }: { phone: string | null }) {
    const [step, setStep] = useState<'phone' | 'code'>(sentTo ? 'code' : 'phone');
    const phoneForm = useForm({ phone: '' });
    const codeForm = useForm({ code: '', name: '' });
    const codeRef = useRef<HTMLInputElement>(null);
    const [resendIn, setResendIn] = useState(0);

    useEffect(() => {
        if (step === 'code') codeRef.current?.focus();
    }, [step]);
    useEffect(() => {
        if (resendIn <= 0) return;
        const t = setTimeout(() => setResendIn(resendIn - 1), 1000);
        return () => clearTimeout(t);
    }, [resendIn]);

    const send = () => phoneForm.post('/signin/code', { onSuccess: () => { setStep('code'); setResendIn(45); }, preserveScroll: true });

    return (
        <div className="grid min-h-screen bg-white md:grid-cols-2 dark:bg-[#0c0e0d]">
            <Head title="Sign in · Zvino" />
            <Toaster position="top-center" />
            <div className="flex flex-col px-6 py-8 md:px-16">
                <Link href="/"><Logo /></Link>
                <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
                    {step === 'phone' ? (
                        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
                            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.04em]">What’s your number?</h1>
                            <p className="text-muted-foreground mt-2">We’ll text you a code to sign in. No password needed.</p>
                            <div className="mt-8 flex h-14 items-center rounded-2xl border-2 focus-within:border-[#111412] dark:focus-within:border-white">
                                <span className="flex h-full items-center gap-2 border-r px-4 font-semibold">🇿🇼 +263</span>
                                <input autoFocus inputMode="tel" autoComplete="tel" value={phoneForm.data.phone} onChange={(e) => phoneForm.setData('phone', e.target.value)} placeholder="77 123 4567" className="h-full flex-1 bg-transparent px-4 text-lg outline-none" />
                            </div>
                            {phoneForm.errors.phone && <p className="mt-2 text-sm text-[#c8102e]">Enter a valid Zimbabwean mobile number.</p>}
                            <Button type="submit" variant="dark" className="mt-6 h-14 w-full rounded-full text-base" disabled={phoneForm.processing || phoneForm.data.phone.replace(/\D/g, '').length < 9}>Continue</Button>
                            <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">By continuing you agree to Zvino’s <Link href="/p/terms" className="underline">Terms</Link> and <Link href="/p/privacy" className="underline">Privacy Policy</Link>. Standard SMS rates may apply.</p>
                        </form>
                    ) : (
                        <form onSubmit={(e) => { e.preventDefault(); codeForm.post('/signin/verify'); }}>
                            <button type="button" onClick={() => setStep('phone')} className="text-muted-foreground mb-6 flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" /> Change number</button>
                            <span className="bg-muted flex size-14 items-center justify-center rounded-2xl dark:bg-white/10"><Smartphone className="size-6" /></span>
                            <h1 className="mt-5 text-[34px] leading-tight font-extrabold tracking-[-0.04em]">Enter the code</h1>
                            <p className="text-muted-foreground mt-2">Sent to <b className="text-foreground">{sentTo ?? phoneForm.data.phone}</b></p>
                            <input ref={codeRef} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codeForm.data.code} onChange={(e) => codeForm.setData('code', e.target.value.replace(/\D/g, ''))} placeholder="••••••" className="mt-8 h-16 w-full rounded-2xl border-2 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-[#111412] dark:bg-transparent dark:focus:border-white" />
                            {codeForm.errors.code && <p className="mt-2 text-sm text-[#c8102e]">{codeForm.errors.code}</p>}
                            <input value={codeForm.data.name} onChange={(e) => codeForm.setData('name', e.target.value)} placeholder="Your first name (new customers)" className="mt-3 h-12 w-full rounded-xl border px-4 outline-none focus:border-[#111412] dark:bg-transparent" />
                            <Button type="submit" variant="dark" className="mt-6 h-14 w-full rounded-full text-base" disabled={codeForm.processing || codeForm.data.code.length !== 6}>Sign in</Button>
                            <button type="button" disabled={resendIn > 0} onClick={() => { phoneForm.setData('phone', sentTo ?? phoneForm.data.phone); send(); }} className="text-muted-foreground mt-4 w-full text-center text-sm disabled:opacity-60">{resendIn > 0 ? `Resend code in ${resendIn}s` : 'Didn’t get it? Resend code'}</button>
                        </form>
                    )}
                </div>
            </div>
            <div className="relative hidden overflow-hidden bg-[#0a120e] md:block">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(11,110,79,0.6),transparent_60%),radial-gradient(ellipse_at_bottom_left,rgba(201,148,18,0.25),transparent_55%)]" />
                <div className="relative flex h-full flex-col justify-end p-16 text-white">
                    <p className="text-4xl leading-tight font-extrabold tracking-[-0.04em]">Sadza, braai, pizza and groceries.<br /><span className="text-[#5fe0b3]">At your gate in minutes.</span></p>
                    <p className="mt-4 text-white/60">Pay with EcoCash, InnBucks, OneMoney, card or cash.</p>
                </div>
            </div>
        </div>
    );
}

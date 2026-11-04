import { Head } from '@inertiajs/react';

export default function Maintenance({ message }: { message: string }) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#1c1c1c] px-6 text-center text-white">
            <Head title="Back soon · Zvino" />
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-3xl font-extrabold">z</span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight">We’ll be right back</h1>
            <p className="mt-3 max-w-md text-lg text-white/65">{message}</p>
        </div>
    );
}

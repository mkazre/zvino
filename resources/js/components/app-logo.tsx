import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';

export default function AppLogo() {
    const { auth } = usePage<SharedData>().props;

    return (
        <>
            {/* TODO: swap for the real Zvino logo once supplied */}
            <div className="bg-brand flex aspect-square size-8 items-center justify-center rounded-lg text-base font-extrabold text-white">z</div>
            <div className="ml-1 grid flex-1 text-left text-sm">
                <span className="truncate leading-none font-bold">Zvino</span>
                <span className="text-muted-foreground mt-0.5 truncate text-xs">{auth.user?.vendor?.name ?? 'Admin'}</span>
            </div>
        </>
    );
}

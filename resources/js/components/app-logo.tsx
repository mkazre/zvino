import { type SharedData } from '@/types';
import { usePage } from '@inertiajs/react';

export default function AppLogo() {
    const { auth, brand } = usePage<SharedData & { brand?: { logo: string; name: string } }>().props;

    return (
        <div className="grid flex-1 text-left">
            <img src={brand?.logo ?? '/brand/logo.png'} alt={brand?.name ?? 'Zvino'} className="h-7 w-auto self-start" />
            <span className="text-muted-foreground mt-1 truncate text-xs">{auth.user?.vendor?.name ?? 'Admin'}</span>
        </div>
    );
}

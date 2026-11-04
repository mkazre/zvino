import { usePage } from '@inertiajs/react';

type BrandProps = Record<string, unknown> & { brand?: { name: string; logo: string; logo_dark: string; mark: string }; appVersion?: { version: string; build: string | null } };

/** Full Zvino logo. `inverse` = white version for dark backgrounds. */
export function BrandLogo({ inverse = false, className = 'h-8 w-auto' }: { inverse?: boolean; className?: string }) {
    const { brand } = usePage<BrandProps>().props;
    return <img src={(inverse ? brand?.logo_dark : brand?.logo) ?? (inverse ? '/brand/logo-inverse.png' : '/brand/logo.png')} alt={brand?.name ?? 'Zvino'} className={className} />;
}

/** "Zvino v1.0.0 (build)" for footers and About sections. */
export function AppVersion({ className = '' }: { className?: string }) {
    const { appVersion, brand } = usePage<BrandProps>().props;
    if (!appVersion) return null;
    return <span className={className}>{brand?.name ?? 'Zvino'} v{appVersion.version}{appVersion.build ? ` (${appVersion.build})` : ''}</span>;
}

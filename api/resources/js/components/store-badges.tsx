import { cn } from '@/lib/utils';
import { usePage } from '@inertiajs/react';

/** Official "Download on the App Store" / "Get it on Google Play" badges (public/images/badges). */
export function StoreBadges({ className, size = 'md', ios, android }: { className?: string; size?: 'sm' | 'md' | 'lg'; ios?: string | null; android?: string | null }) {
    const { site } = usePage<{ site?: { apps?: { ios?: string; android?: string } } }>().props;
    const links = { ios: ios ?? site?.apps?.ios, android: android ?? site?.apps?.android };
    const h = { sm: 'h-10', md: 'h-12', lg: 'h-14' }[size];
    const badge = (key: 'ios' | 'android', src: string, alt: string) => {
        const href = links[key];
        return (
            <a key={key} href={href || undefined} target={href ? '_blank' : undefined} rel="noreferrer" title={href ? alt : `${alt} (coming soon)`} aria-disabled={!href} className={cn('inline-block shrink-0 transition hover:opacity-90', !href && 'cursor-default')}>
                <img src={src} alt={alt} className={cn(h, 'w-auto')} loading="lazy" />
            </a>
        );
    };
    return (
        <div className={cn('flex flex-wrap items-center gap-3', className)}>
            {badge('ios', '/images/badges/app-store.svg', 'Download on the App Store')}
            {badge('android', '/images/badges/google-play.svg', 'Get it on Google Play')}
        </div>
    );
}

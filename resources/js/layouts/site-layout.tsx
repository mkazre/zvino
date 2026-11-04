import { Button } from '@/components/ui/button';
import { Avatar, Popover } from '@/components/z';
import { cart, useCart } from '@/lib/cart';
import { usd, zig } from '@/lib/money';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { ChevronDown, Globe, MapPin, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';

export interface SiteProps extends SharedData {
    site: {
        cities: string[];
        city: string | null;
        tagline: string;
        support_phone: string;
        support_whatsapp: string;
        support_email: string;
        social: { facebook: string; instagram: string; tiktok: string };
        apps: { ios: string; android: string };
        web_ordering: boolean;
        platform_mode: 'single' | 'marketplace';
    };
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
    const { brand } = usePage<SiteProps>().props;
    if (brand?.logo) return <img src={brand.logo} alt={brand.name} className="h-8 w-auto" />;
    return (
        <span className="flex items-center gap-2">
            <span className="bg-brand flex size-8 items-center justify-center rounded-[9px] text-lg font-extrabold text-white">z</span>
            <span className={cn('text-xl font-extrabold tracking-[-0.04em]', inverse && 'text-white')}>{brand?.name ?? 'Zvino'}</span>
        </span>
    );
}

export default function SiteLayout({ children, transparent = false, hideCart = false }: { children: ReactNode; transparent?: boolean; hideCart?: boolean }) {
    const { flash } = usePage<SiteProps>().props;
    const [cartOpen, setCartOpen] = useState(false);

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

    useEffect(() => {
        const open = () => setCartOpen(true);
        window.addEventListener('zvino:open-cart', open);
        return () => window.removeEventListener('zvino:open-cart', open);
    }, []);

    return (
        <div className="flex min-h-screen flex-col bg-white text-[#111412] dark:bg-[#0c0e0d] dark:text-[#eef0ef]">
            <Header transparent={transparent} onCart={() => setCartOpen(true)} hideCart={hideCart} />
            <main className="flex-1">{children}</main>
            <Footer />
            <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
            <MobileCartBar hidden={hideCart} onOpen={() => setCartOpen(true)} />
            <Toaster position="top-center" toastOptions={{ className: 'font-sans !rounded-xl' }} />
        </div>
    );
}

function Header({ transparent, onCart, hideCart }: { transparent: boolean; onCart: () => void; hideCart: boolean }) {
    const { auth, site } = usePage<SiteProps>().props;
    const { count, subtotal } = useCart();
    const [q, setQ] = useState('');
    const [scrolled, setScrolled] = useState(!transparent);
    const user = auth?.user;
    const isCustomer = user && ['customer', 'driver'].includes(user.role);
    const t = useT();

    useEffect(() => {
        if (!transparent) return;
        const on = () => setScrolled(window.scrollY > 40);
        on();
        window.addEventListener('scroll', on, { passive: true });
        return () => window.removeEventListener('scroll', on);
    }, [transparent]);

    return (
        <header className={cn('sticky top-0 z-40 transition-colors', scrolled ? 'border-b bg-white/90 backdrop-blur-md dark:bg-[#0c0e0d]/90' : 'bg-transparent')}>
            <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 md:h-[72px] md:gap-6 md:px-6">
                <Link href="/" className="shrink-0"><Logo inverse={!scrolled} /></Link>

                {site.platform_mode === 'marketplace' && (
                    <Popover
                        align="start"
                        className="w-56 p-1.5"
                        trigger={
                            <button className={cn('hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition md:flex', scrolled ? 'hover:bg-muted' : 'text-white hover:bg-white/15')}>
                                <MapPin className="size-4" /> {site.city ?? 'All cities'} <ChevronDown className="size-3.5 opacity-60" />
                            </button>
                        }
                    >
                        {site.cities.map((c) => (
                            <button key={c} onClick={() => router.post('/city', { city: c }, { preserveScroll: true })} className={cn('hover:bg-muted w-full rounded-lg px-3 py-2 text-left text-sm', site.city === c && 'font-semibold')}>{c}</button>
                        ))}
                    </Popover>
                )}

                {site.platform_mode === 'marketplace' && (
                    <form onSubmit={(e) => { e.preventDefault(); router.get('/stores', { q }); }} className="relative hidden max-w-lg flex-1 md:block">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search food, restaurants, groceries…" className="bg-muted h-11 w-full rounded-full pr-4 pl-11 text-sm outline-none focus:ring-2 focus:ring-[#111412]/10 dark:bg-white/10" />
                    </form>
                )}

                <nav className="ml-auto flex items-center gap-1.5">
                    {!hideCart && (
                        <button onClick={onCart} className={cn('relative flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition', count ? 'bg-[#111412] text-white dark:bg-white dark:text-black' : scrolled ? 'hover:bg-muted' : 'text-white hover:bg-white/15')}>
                            <ShoppingBag className="size-[18px]" />
                            {count > 0 ? <><span>{count}</span><span className="hidden sm:inline">· {zig(subtotal)}</span></> : <span className="hidden sm:inline">{t('Basket')}</span>}
                        </button>
                    )}
                    {isCustomer ? (
                        <Popover align="end" className="w-56 p-1.5" trigger={<button className="ml-1 rounded-full"><Avatar name={user.name || user.phone || '?'} size={40} /></button>}>
                            <div className="px-3 py-2"><div className="text-sm font-semibold">{user.name || 'Welcome!'}</div><div className="text-muted-foreground text-xs">{user.phone}</div></div>
                            {[['Orders', '/account?tab=orders'], ['Wallet', '/account?tab=wallet'], ['Addresses', '/account?tab=addresses'], ['Zvino+', '/plus'], ['Invite friends', '/account?tab=refer']].map(([l, h]) => (
                                <Link key={h} href={h} className="hover:bg-muted block rounded-lg px-3 py-2 text-sm">{t(l)}</Link>
                            ))}
                            <Link href="/signout" method="post" as="button" className="hover:bg-muted text-zred block w-full rounded-lg px-3 py-2 text-left text-sm">{t('Sign out')}</Link>
                        </Popover>
                    ) : user ? (
                        <Button asChild size="sm" variant="dark" className="rounded-full"><Link href="/dashboard">Admin</Link></Button>
                    ) : (
                        <Button asChild variant={scrolled ? 'dark' : 'secondary'} className="h-11 rounded-full px-5"><Link href="/signin">{t('Sign in')}</Link></Button>
                    )}
                </nav>
            </div>
        </header>
    );
}

function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { vendor, lines, subtotal, count } = useCart();
    const { zigPerUsd, auth } = usePage<SiteProps>().props;
    const short = vendor ? Math.max(0, vendor.min_order_zig - subtotal) : 0;

    return (
        <div className={cn('fixed inset-0 z-50 transition', open ? 'visible' : 'invisible')}>
            <div className={cn('absolute inset-0 bg-black/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
            <aside className={cn('absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-[#141716]', open ? 'translate-x-0' : 'translate-x-full')}>
                <header className="flex items-center justify-between border-b px-6 py-5">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight">Your basket</h2>
                        {vendor && <Link href={`/store/${vendor.slug}`} onClick={onClose} className="text-muted-foreground text-sm hover:underline">from {vendor.name}</Link>}
                    </div>
                    <button onClick={onClose} className="hover:bg-muted rounded-full p-2" aria-label="Close"><X className="size-5" /></button>
                </header>
                {lines.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                        <div className="bg-muted flex size-16 items-center justify-center rounded-full"><ShoppingBag className="size-7" /></div>
                        <p className="font-semibold">Your basket is empty</p>
                        <p className="text-muted-foreground text-sm">Add something delicious to get started.</p>
                        <Button variant="dark" className="mt-2 rounded-full" asChild onClick={onClose}><Link href="/stores">Browse stores</Link></Button>
                    </div>
                ) : (
                    <>
                        <ul className="flex-1 divide-y overflow-y-auto px-6">
                            {lines.map((l) => (
                                <li key={l.key} className="flex gap-4 py-4">
                                    {l.image ? <img src={l.image} alt="" className="size-16 shrink-0 rounded-lg object-cover" /> : <div className="bg-muted size-16 shrink-0 rounded-lg" />}
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold">{l.name}</div>
                                        {(l.variant || l.modifiers.length > 0) && <div className="text-muted-foreground text-[13px]">{[l.variant, ...l.modifiers].filter(Boolean).join(' · ')}</div>}
                                        {l.notes && <div className="text-muted-foreground text-xs italic">“{l.notes}”</div>}
                                        <div className="mt-2 flex items-center justify-between">
                                            <div className="bg-muted flex items-center rounded-full">
                                                <button onClick={() => cart.setQty(l.key, l.quantity - 1)} className="flex size-8 items-center justify-center" aria-label="Less">{l.quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}</button>
                                                <span className="tabular w-6 text-center text-sm font-semibold">{l.quantity}</span>
                                                <button onClick={() => cart.setQty(l.key, l.quantity + 1)} className="flex size-8 items-center justify-center" aria-label="More"><Plus className="size-3.5" /></button>
                                            </div>
                                            <span className="tabular font-semibold">{zig(l.unit_zig * l.quantity)}</span>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <footer className="border-t px-6 py-5">
                            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal · {count} items</span><span className="tabular font-semibold">{zig(subtotal)}</span></div>
                            <div className="text-muted-foreground mb-4 text-right text-xs">{usd(subtotal / zigPerUsd)} · fees calculated at checkout</div>
                            {short > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Add {zig(short)} more to reach the {zig(vendor!.min_order_zig)} minimum.</p>}
                            <Button className="h-14 w-full rounded-full text-base" variant="dark" disabled={short > 0} onClick={() => { onClose(); router.visit('/checkout'); }}>
                                Go to checkout · {zig(subtotal)}
                            </Button>
                        </footer>
                    </>
                )}
            </aside>
        </div>
    );
}

function MobileCartBar({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
    const { count, subtotal } = useCart();
    if (hidden || !count) return null;
    return (
        <button onClick={onOpen} className="fixed inset-x-4 bottom-4 z-30 flex h-14 items-center justify-between rounded-full bg-[#111412] px-6 text-white shadow-2xl md:hidden">
            <span className="flex items-center gap-2 font-semibold"><ShoppingBag className="size-5" /> View basket · {count}</span>
            <span className="tabular font-bold">{zig(subtotal)}</span>
        </button>
    );
}

function Footer() {
    const { site, brand } = usePage<SiteProps>().props;
    const cols: [string, [string, string][]][] = [
        ['Zvino', [['About us', '/p/about'], ['Zvino+', '/plus'], ['Gift cards', '/gift-cards'], ['Send groceries home', '/hampers'], ['Catering', '/catering'], ['Help & FAQ', '/p/faq']]],
        ['Work with us', [['Add your restaurant', '/partners'], ['Drive with Zvino', '/drive'], ['Corporate accounts', '/p/about']]],
        ['Legal', [['Terms of service', '/p/terms'], ['Privacy policy', '/p/privacy']]],
    ];
    return (
        <footer className="mt-20 bg-[#111412] text-white">
            <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.3fr_repeat(3,1fr)]">
                <div>
                    <Logo inverse />
                    <p className="mt-4 max-w-xs text-sm text-white/60">{site.tagline}</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                        {['ios', 'android'].map((k) => (
                            <a key={k} href={site.apps[k as 'ios' | 'android'] || '#'} className="flex items-center gap-2 rounded-lg border border-white/15 px-3.5 py-2 text-xs hover:bg-white/5">
                                <span className="text-lg">{k === 'ios' ? '' : '▶'}</span><span><span className="block text-[10px] opacity-60">{k === 'ios' ? 'Download on the' : 'Get it on'}</span><span className="font-semibold">{k === 'ios' ? 'App Store' : 'Google Play'}</span></span>
                            </a>
                        ))}
                    </div>
                </div>
                {cols.map(([title, links]) => (
                    <div key={title}>
                        <div className="text-sm font-semibold">{title}</div>
                        <ul className="mt-4 grid gap-2.5 text-sm text-white/60">{links.map(([l, h]) => <li key={h + l}><Link href={h} className="hover:text-white">{l}</Link></li>)}</ul>
                    </div>
                ))}
            </div>
            <div className="border-t border-white/10">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-white/50">
                    <span>© {new Date().getFullYear()} {brand?.name ?? 'Zvino'} · Made in Zimbabwe 🇿🇼</span>
                    <LanguagePicker />
                    <span className="flex gap-4">
                        {site.support_phone && <a href={`tel:${site.support_phone}`} className="hover:text-white">{site.support_phone}</a>}
                        {site.support_whatsapp && <a href={`https://wa.me/${site.support_whatsapp.replace(/\D/g, '')}`} className="hover:text-white">WhatsApp</a>}
                        {site.support_email && <a href={`mailto:${site.support_email}`} className="hover:text-white">{site.support_email}</a>}
                    </span>
                </div>
            </div>
        </footer>
    );
}

function LanguagePicker() {
    const { locale, languages } = useLocale();
    return (
        <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            {Object.entries(languages).map(([code, name]) => (
                <button key={code} onClick={() => router.post('/locale', { locale: code }, { preserveScroll: true })} className={cn('rounded px-1.5 py-0.5 hover:text-white', locale === code && 'bg-white/10 font-semibold text-white')}>{name}</button>
            ))}
        </span>
    );
}

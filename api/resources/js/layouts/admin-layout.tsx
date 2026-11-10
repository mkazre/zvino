import { Avatar, ConfirmProvider, Kbd, LiveDot, Popover } from '@/components/z';
import { useAppearance } from '@/hooks/use-appearance';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Command } from 'cmdk';
import { BarChart3, Truck, Bell, Bike, Building2, Calculator, ClipboardCheck, ChefHat, ChevronDown, CookingPot, CreditCard, FileClock, Gift, LayoutDashboard, LayoutTemplate, LifeBuoy, LogOut, Map, Megaphone, Menu, Moon, Package, Radar, ReceiptText, RotateCcw, Search, Settings, ShieldCheck, Smartphone, Star, Store, Sun, Users, UtensilsCrossed, Wallet, X, type LucideIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { AppVersion, BrandLogo } from '@/components/brand-logo';
import { CurrencySwitch } from '@/components/currency-switch';
import { StaffAlerts, chime, setSoundOn, soundOn } from '@/components/staff-alerts';

interface NavItem {
    title: string;
    href: string;
    icon: LucideIcon;
    can?: string;
    badge?: keyof SharedData['badges'];
    badgeTone?: 'dark' | 'red';
    marketplaceOnly?: boolean;
    platformOnly?: boolean;
}

const NAV: { group: string; items: NavItem[] }[] = [
    {
        group: 'Overview',
        items: [
            { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, can: 'orders.view' },
            { title: 'Command centre', href: '/admin/dispatch', icon: Radar, can: 'dispatch.manage', badge: 'unassigned', badgeTone: 'red' },
            { title: 'Applications', href: '/admin/applications', icon: ClipboardCheck, can: 'applications.review', badge: 'applications', badgeTone: 'red' },
        ],
    },
    {
        group: 'Operations',
        items: [
            { title: 'Orders', href: '/admin/orders', icon: ReceiptText, can: 'orders.view', badge: 'orders' },
            { title: 'Refunds', href: '/admin/refunds', icon: RotateCcw, can: 'refunds.approve', badge: 'refunds', badgeTone: 'red' },
            { title: 'Support', href: '/admin/support', icon: LifeBuoy, can: 'support.manage', badge: 'support' },
            { title: 'Reviews', href: '/admin/reviews', icon: Star, can: 'orders.view' },
            { title: 'Catering', href: '/admin/catering', icon: CookingPot, can: 'orders.manage' },
        ],
    },
    {
        group: 'Catalogue',
        items: [
            { title: 'Stores', href: '/admin/vendors', icon: Store, can: 'vendors.manage', marketplaceOnly: true },
            { title: 'Menu', href: '/admin/catalog', icon: UtensilsCrossed, can: 'catalog.manage' },
            { title: 'Suppliers', href: '/admin/suppliers/tmpnp', icon: Truck, can: 'vendors.manage', marketplaceOnly: true },
            { title: 'Hampers', href: '/admin/hampers', icon: Package, can: 'catalog.manage' },
        ],
    },
    {
        group: 'Fleet',
        items: [
            { title: 'Drivers', href: '/admin/drivers', icon: Bike, can: 'drivers.manage', badge: 'drivers' },
            { title: 'Zones & fees', href: '/admin/zones', icon: Map, can: 'settings.manage' },
        ],
    },
    {
        group: 'Growth',
        items: [
            { title: 'Home builder', href: '/admin/home-builder', icon: LayoutTemplate, can: 'marketing.manage' },
            { title: 'Promotions', href: '/admin/rewards-promos', icon: Gift, can: 'marketing.manage' },
            { title: 'Campaigns', href: '/admin/campaigns', icon: Megaphone, can: 'marketing.manage' },
            { title: 'App onboarding', href: '/admin/app-content', icon: Smartphone, can: 'marketing.manage' },
        ],
    },
    {
        group: 'People',
        items: [
            { title: 'Customers', href: '/admin/users', icon: Users, can: 'customers.manage' },
            { title: 'Companies', href: '/admin/companies', icon: Building2, can: 'customers.manage' },
            { title: 'Staff & roles', href: '/admin/staff', icon: ShieldCheck, can: 'staff.manage' },
        ],
    },
    {
        group: 'Finance',
        items: [
            { title: 'Payouts', href: '/admin/payouts', icon: Wallet, can: 'payouts.manage' },
            { title: 'Reports', href: '/admin/reports', icon: BarChart3, can: 'reports.view' },
        ],
    },
    {
        group: 'Store tools',
        items: [
            { title: 'Point of sale', href: '/admin/pos', icon: Calculator, can: 'pos.use' },
            { title: 'Kitchen display', href: '/admin/kitchen', icon: ChefHat, can: 'kitchen.use' },
        ],
    },
    {
        group: 'Platform',
        items: [
            { title: 'Settings', href: '/admin/settings', icon: Settings, can: 'settings.manage' },
            { title: 'Audit log', href: '/admin/audit', icon: FileClock, can: 'audit.view' },
        ],
    },
];

function useNav() {
    const { can, platformMode } = usePage<SharedData>().props;
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => (!i.can || can.includes(i.can)) && !(i.marketplaceOnly && platformMode === 'single')) })).filter((g) => g.items.length);
}

export default function AdminLayout({ title, children, fullBleed = false }: { title: string; children: ReactNode; fullBleed?: boolean }) {
    const { flash } = usePage<SharedData>().props;
    const [mobileOpen, setMobileOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    useEffect(() => {
        if (flash?.success) toast.success(flash.success);
        if (flash?.error) toast.error(flash.error);
    }, [flash]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setPaletteOpen((v) => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => router.on('navigate', () => setMobileOpen(false)), []);

    return (
        <ConfirmProvider>
            <Head title={title} />
            <div className="bg-background flex min-h-screen">
                {/* Desktop sidebar */}
                <aside className="bg-sidebar sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r lg:flex">
                    <Sidebar />
                </aside>

                {/* Mobile sidebar */}
                {mobileOpen && (
                    <div className="fixed inset-0 z-50 lg:hidden">
                        <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
                        <aside className="bg-sidebar animate-in slide-in-from-left absolute inset-y-0 left-0 flex w-[280px] flex-col border-r shadow-(--shadow-pop) duration-200">
                            <button className="text-muted-foreground absolute top-4 right-3 p-1" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                                <X className="size-5" />
                            </button>
                            <Sidebar />
                        </aside>
                    </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                    <Topbar title={title} onMenu={() => setMobileOpen(true)} onSearch={() => setPaletteOpen(true)} />
                    <main className={cn('flex-1', fullBleed && 'flex flex-col')}>{children}</main>
                </div>
            </div>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
            <StaffAlerts />
            <Toaster position="bottom-right" toastOptions={{ className: 'font-sans !rounded-xl !border !shadow-(--shadow-pop)' }} />
        </ConfirmProvider>
    );
}

function Sidebar() {
    const { url } = usePage();
    const { badges, brand, auth } = usePage<SharedData>().props;
    const nav = useNav();
    const path = url.split('?')[0];

    return (
        <>
            <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
                <BrandLogo className="h-8 w-auto" />
                {auth.user.vendor && <span className="text-muted-foreground ml-auto max-w-20 truncate text-xs">{auth.user.vendor.name}</span>}
            </Link>
            <nav className="scroll-quiet flex-1 overflow-y-auto px-3 pb-4">
                {nav.map((g) => (
                    <div key={g.group} className="mt-4 first:mt-1">
                        <div className="text-muted-foreground/80 px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider uppercase">{g.group}</div>
                        <ul className="grid gap-px">
                            {g.items.map((i) => {
                                const active = path === i.href || (i.href !== '/dashboard' && path.startsWith(i.href));
                                const count = i.badge ? badges?.[i.badge] : 0;
                                return (
                                    <li key={i.href}>
                                        <Link
                                            href={i.href}
                                            prefetch
                                            className={cn(
                                                'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
                                                active ? 'bg-sidebar-accent text-foreground shadow-[inset_3px_0_0_var(--color-brand)]' : 'text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-foreground',
                                            )}
                                        >
                                            <i.icon className={cn('size-[17px] shrink-0', active ? 'text-brand-600' : 'text-muted-foreground group-hover:text-foreground')} strokeWidth={active ? 2.2 : 1.9} />
                                            <span className="truncate">{i.title}</span>
                                            {!!count && (
                                                <span
                                                    className={cn(
                                                        'tabular ml-auto rounded-full px-1.5 py-px text-[11px] font-semibold',
                                                        i.badgeTone === 'red' ? 'bg-zred text-white' : 'bg-foreground text-background',
                                                    )}
                                                >
                                                    {count > 99 ? '99+' : count}
                                                </span>
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
            <div className="text-muted-foreground border-t px-5 py-3 text-[11px]"><AppVersion /></div>
        </>
    );
}

function Topbar({ title, onMenu, onSearch }: { title: string; onMenu: () => void; onSearch: () => void }) {
    const { auth, zigPerUsd, pusher } = usePage<SharedData>().props;
    const { appearance, updateAppearance } = useAppearance();
    const dark = appearance === 'dark' || (appearance === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return (
        <header className="bg-background/85 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b px-4 backdrop-blur-md md:px-8">
            <button className="text-muted-foreground hover:text-foreground -ml-1 p-1 lg:hidden" onClick={onMenu} aria-label="Open menu">
                <Menu className="size-5" />
            </button>
            <span className="truncate text-sm font-semibold lg:hidden">{title}</span>

            <button
                onClick={onSearch}
                className="bg-surface text-muted-foreground hover:border-foreground/20 hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border px-3 text-sm transition md:flex"
            >
                <Search className="size-4" />
                <span className="flex-1 text-left">Search orders, customers, stores…</span>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
            </button>

            <div className="ml-auto flex items-center gap-1.5">
                <span className="text-muted-foreground hidden items-center gap-2 rounded-lg px-2.5 text-xs font-medium xl:flex" title="Today's ZiG/USD rate">
                    <span className="tabular">1 USD = {zigPerUsd} ZiG</span>
                </span>
                <CurrencySwitch />
                <span className="text-muted-foreground hidden items-center gap-2 px-2.5 text-xs font-medium sm:flex" title={pusher.key ? 'Live updates via Pusher' : 'Live updates by polling'}>
                    <LiveDot /> Live
                </span>
                <button onClick={onSearch} className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2 md:hidden" aria-label="Search">
                    <Search className="size-[18px]" />
                </button>
                <button
                    onClick={() => updateAppearance(dark ? 'light' : 'dark')}
                    className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-2"
                    aria-label="Toggle dark mode"
                >
                    {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                </button>
                <NotificationBell />
                <Popover
                    trigger={
                        <button className="hover:bg-muted ml-1 flex items-center gap-2 rounded-lg py-1 pr-2 pl-1">
                            <Avatar name={auth.user.name} size={30} />
                            <span className="hidden text-left leading-tight sm:block">
                                <span className="block text-[13px] font-semibold">{auth.user.name}</span>
                                <span className="text-muted-foreground block text-[11px] capitalize">{auth.user.role.replace('_', ' ')}</span>
                            </span>
                            <ChevronDown className="text-muted-foreground size-3.5" />
                        </button>
                    }
                    className="w-56"
                >
                    <Link href="/settings/profile" className="hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
                        <CreditCard className="size-4" /> My profile
                    </Link>
                    <Link method="post" href="/logout" as="button" className="hover:bg-muted text-zred flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm">
                        <LogOut className="size-4" /> Sign out
                    </Link>
                </Popover>
            </div>
        </header>
    );
}

/** Bell: new applications and other alerts for this staff member. */
function NotificationBell() {
    const { notifications } = usePage<SharedData>().props;
    const unread = notifications?.unread ?? 0;
    const list = notifications?.latest ?? [];
    const [sound, setSound] = useState(soundOn);
    const [desk, setDesk] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'));
    return (
        <Popover
            align="end"
            className="w-[min(22rem,calc(100vw-2rem))] p-0"
            trigger={
                <button className="text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-lg p-2" aria-label={unread ? `${unread} unread notifications` : 'Notifications'}>
                    <Bell className="size-[18px]" />
                    {unread > 0 && <span className="bg-zred absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
                </button>
            }
        >
            <div className="flex items-center justify-between border-b px-4 py-3">
                <span className="text-sm font-semibold">Notifications</span>
                {unread > 0 && <button onClick={() => router.post('/admin/notifications/read', {}, { preserveScroll: true, preserveState: true })} className="text-muted-foreground hover:text-foreground text-xs font-medium">Mark all read</button>}
            </div>
            {list.length === 0 ? (
                <p className="text-muted-foreground px-4 py-8 text-center text-sm">You’re all caught up.</p>
            ) : (
                <ul className="max-h-96 overflow-y-auto py-1">
                    {list.map((n) => (
                        <li key={n.id}>
                            <Link href={`/admin/notifications/${n.id}`} className="hover:bg-muted flex gap-3 px-4 py-2.5">
                                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} />
                                <span className="min-w-0 flex-1">
                                    <span className={cn('block truncate text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                                    <span className="text-muted-foreground block truncate text-xs">{n.body}</span>
                                    <span className="text-muted-foreground text-[11px]">{new Date(n.created_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5 text-xs">
                <button onClick={() => { setSoundOn(!sound); setSound(!sound); if (!sound) chime(); }} className="hover:bg-muted rounded-md border px-2 py-1 font-medium">{sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
                {desk === 'default' && <button onClick={async () => setDesk(await Notification.requestPermission())} className="hover:bg-muted rounded-md border px-2 py-1 font-medium">Turn on desktop alerts</button>}
                {desk === 'granted' && <span className="text-muted-foreground">Desktop alerts on</span>}
                {desk === 'denied' && <span className="text-muted-foreground">Desktop alerts blocked in this browser</span>}
            </div>
            <div className="border-t px-4 py-2.5 text-xs">
                <Link href="/admin/applications" className="font-medium hover:underline">All applications</Link>
                <span className="text-muted-foreground"> · </span>
                <Link href="/admin/support" className="font-medium hover:underline">Support</Link>
            </div>
        </Popover>
    );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const nav = useNav();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ type: string; label: string; sub?: string; href: string }[]>([]);

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    useEffect(() => {
        if (query.length < 2) {
            setResults([]);
            return;
        }
        const ctrl = new AbortController();
        const t = setTimeout(() => {
            fetch(`/admin/search?q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
                .then((r) => (r.ok ? r.json() : []))
                .then(setResults)
                .catch(() => {});
        }, 180);
        return () => {
            clearTimeout(t);
            ctrl.abort();
        };
    }, [query]);

    if (!open) return null;
    const go = (href: string) => {
        onClose();
        router.visit(href);
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
            <Command
                className="bg-popover w-full max-w-xl overflow-hidden rounded-2xl border shadow-(--shadow-pop)"
                onClick={(e) => e.stopPropagation()}
                shouldFilter={true}
                onKeyDown={(e) => e.key === 'Escape' && onClose()}
            >
                <div className="flex items-center gap-3 border-b px-4">
                    <Search className="text-muted-foreground size-4" />
                    <Command.Input autoFocus value={query} onValueChange={setQuery} placeholder="Search orders (ZV-…), customers, stores, or jump to a page" className="h-14 flex-1 bg-transparent text-[15px] outline-none" />
                    <Kbd>Esc</Kbd>
                </div>
                <Command.List className="scroll-quiet max-h-[60vh] overflow-y-auto p-2">
                    <Command.Empty className="text-muted-foreground py-10 text-center text-sm">No matches.</Command.Empty>
                    {results.length > 0 && (
                        <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium">
                            {results.map((r) => (
                                <Command.Item key={r.href} value={`${r.label} ${r.sub ?? ''} ${query}`} onSelect={() => go(r.href)} className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                                    <span className="text-muted-foreground w-16 shrink-0 text-xs capitalize">{r.type}</span>
                                    <span className="font-medium">{r.label}</span>
                                    {r.sub && <span className="text-muted-foreground truncate text-xs">{r.sub}</span>}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    )}
                    {nav.map((g) => (
                        <Command.Group key={g.group} heading={g.group} className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium">
                            {g.items.map((i) => (
                                <Command.Item key={i.href} value={`${g.group} ${i.title}`} onSelect={() => go(i.href)} className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm">
                                    <i.icon className="text-muted-foreground size-4" />
                                    {i.title}
                                </Command.Item>
                            ))}
                        </Command.Group>
                    ))}
                </Command.List>
            </Command>
        </div>
    );
}

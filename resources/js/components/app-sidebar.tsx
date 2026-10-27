import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem, type Role, type SharedData } from '@/types';
import { Link, usePage } from '@inertiajs/react';
import { Calculator, ChefHat, Gift, LayoutDashboard, LayoutTemplate, ReceiptText, Store, Users, UtensilsCrossed } from 'lucide-react';
import AppLogo from './app-logo';

const ALL: (NavItem & { roles: Role[]; marketplaceOnly?: boolean })[] = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, roles: ['super_admin', 'vendor_manager'] },
    { title: 'Orders', url: '/admin/orders', icon: ReceiptText, roles: ['super_admin', 'vendor_manager', 'cashier'] },
    { title: 'Catalog', url: '/admin/catalog', icon: UtensilsCrossed, roles: ['super_admin', 'vendor_manager'] },
    { title: 'Vendors', url: '/admin/vendors', icon: Store, roles: ['super_admin'], marketplaceOnly: true },
    { title: 'Users', url: '/admin/users', icon: Users, roles: ['super_admin'] },
    { title: 'Home builder', url: '/admin/home-builder', icon: LayoutTemplate, roles: ['super_admin'] },
    { title: 'Rewards & promos', url: '/admin/rewards-promos', icon: Gift, roles: ['super_admin'] },
    { title: 'POS', url: '/admin/pos', icon: Calculator, roles: ['super_admin', 'vendor_manager', 'cashier'] },
    { title: 'Kitchen display', url: '/admin/kitchen', icon: ChefHat, roles: ['super_admin', 'vendor_manager', 'kitchen'] },
];

export function AppSidebar() {
    const { auth, platformMode } = usePage<SharedData>().props;
    const items = ALL.filter((i) => i.roles.includes(auth.user.role) && !(i.marketplaceOnly && platformMode === 'single'));

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/dashboard" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={items} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

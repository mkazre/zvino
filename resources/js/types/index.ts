import { LucideIcon } from 'lucide-react';

export type Role = 'customer' | 'driver' | 'super_admin' | 'admin' | 'support' | 'vendor_manager' | 'cashier' | 'kitchen';

export interface Auth {
    user: User;
}

export interface BreadcrumbItem {
    title: string;
    href: string;
}

export interface NavGroup {
    title: string;
    items: NavItem[];
}

export interface NavItem {
    title: string;
    url: string;
    icon?: LucideIcon | null;
    isActive?: boolean;
}

export interface SharedData {
    name: string;
    auth: Auth;
    platformMode: 'single' | 'marketplace';
    zigPerUsd: number;
    currency: import('@/lib/money').CurrencyProps;
    pusher: { key: string | null; cluster: string | null };
    flash: { success: string | null; error: string | null };
    can: string[];
    badges: { orders?: number; incoming?: number; unassigned?: number; refunds?: number; drivers?: number; support?: number; applications?: number };
    notifications?: { unread: number; latest: { id: number; type: string; title: string; body: string; read_at: string | null; created_at: string }[] } | null;
    brand: { name: string; logo: string | null };
    [key: string]: unknown;
}

export interface User {
    id: number;
    name: string;
    email: string;
    phone?: string | null;
    role: Role;
    vendor_id: number | null;
    vendor?: { id: number; name: string } | null;
    avatar?: string;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown; // This allows for additional properties...
}

export interface Money {
    zig: number;
    usd: number;
}

export interface PageLink {
    url: string | null;
    label: string;
    active: boolean;
}

export interface Order {
    id: number;
    reference: string;
    source: 'app' | 'web' | 'pos';
    fulfilment: 'delivery' | 'pickup' | 'dine_in';
    status: string;
    kitchen_stage: 'new' | 'cooking' | 'ready';
    payment_method: string;
    payment_status: string;
    totals: Record<'subtotal' | 'delivery' | 'service' | 'discount' | 'vat' | 'total', Money>;
    vendor?: { id: number; name: string };
    customer?: { id: number; name: string; phone: string } | null;
    items?: { name: string; quantity: number; options: { variant?: string; modifiers?: string[] } | null; notes: string | null; line_total: Money }[];
    rider: { name: string; phone: string } | null;
    created_at: string;
}

export interface Item {
    id: number;
    vendor_id: number;
    category_id: number | null;
    name: string;
    description: string | null;
    image: string | null;
    price: Money;
    special_price: Money | null;
    is_available: boolean;
    is_special: boolean;
    variants: { name: string; price_delta_zig: number }[];
    modifiers: { group: string; max: number; options: { name: string; price_delta_zig: number }[] }[];
}

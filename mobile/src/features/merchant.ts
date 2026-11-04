import { type Money } from '@/lib/api';

export interface MerchantMe {
    role: string;
    store: { id: number; name: string; is_busy: boolean; busy_extra_minutes: number; power_out: boolean; power_out_extra_minutes: number; auto_accept: boolean; paused_until: string | null; prep_minutes: number; offers_delivery: boolean; offers_pickup: boolean; rating: number; rating_count: number };
    availability: { is_open: boolean; reason: string | null; is_busy: boolean; power_out: boolean; prep_minutes: number; next_open_at: string | null };
    today: { orders: number; sales: Money; avg_prep_minutes: number };
    incoming: number;
}

export interface StoreOrder {
    id: number;
    reference: string;
    status: string;
    kitchen_stage: 'new' | 'cooking' | 'ready';
    source: string;
    fulfilment: 'delivery' | 'pickup' | 'dine_in';
    payment_method: string;
    notes: string | null;
    no_cutlery?: boolean;
    created_at: string;
    scheduled_for: string | null;
    estimated_delivery_at: string | null;
    totals: { subtotal: Money; total: Money };
    customer?: { name: string; phone: string } | null;
    driver?: { name: string; phone: string } | null;
    items: { name: string; quantity: number; options: { variant?: string; modifiers?: string[] } | null; notes: string | null }[];
}

export const REJECT_REASONS = [
    ['too_busy', 'Too busy'],
    ['item_unavailable', 'Item unavailable'],
    ['closing_soon', 'Closing soon'],
    ['power_outage', 'Power outage'],
    ['other', 'Other'],
] as const;

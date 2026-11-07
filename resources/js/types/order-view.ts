import { type Money } from '@/types';

/** Mirrors App\Support\OrderView (shared by the website order page and the app). */
export interface OrderView {
    id: number;
    reference: string;
    status: string;
    fulfilment: 'delivery' | 'pickup';
    is_done: boolean;
    placed_at: string;
    time: { label: string; at: string | null; trend?: { type: 'early' | 'late'; minutes: number; text: string } | null };
    banner: { key: string; image: string; title: string; subtitle: string | null };
    review_banner: string | null;
    timeline: { key: string; label: string; at: string | null; state: 'done' | 'current' | 'upcoming' | 'stopped'; detail: string | null }[];
    store: { id: number; name: string; slug: string; logo: string | null; address: string | null; phone: string | null; lat: number | null; lng: number | null };
    driver: { name: string; phone: string; vehicle: string; plate: string | null; rating: number; lat: number | null; lng: number | null; heading?: number | null; located_at?: string | null; stops_before?: number } | null;
    live?: boolean;
    delivery_pin: string | null;
    can_cancel: boolean;
    review: { vendor_rating: number } | null;
    receipt: {
        lines: { name: string; quantity: number; options: string[]; notes: string | null; unit: Money; total: Money }[];
        totals: { label: string; amount: Money; help?: string }[];
        total: Money;
        vat: Money;
        wallet_applied: Money | null;
        pdf_url: string;
    };
    details: {
        address: { label?: string; line1?: string; landmark?: string; suburb?: string; city?: string } | null;
        address_lat: number | null;
        address_lng: number | null;
        instructions: string | null;
        dropoff: string | null;
        no_cutlery: boolean;
        account: { name: string | null; phone: string | null; email: string | null };
        payment: { method: string; status: string; cash_part: Money | null };
        scheduled_for: string | null;
    };
    support: { phone: string; whatsapp: string };
}

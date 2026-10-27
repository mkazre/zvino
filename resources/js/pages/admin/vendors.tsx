import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, StatusBadge, Switch, Tabs, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { zig } from '@/lib/money';
import { Head, router, useForm } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface Vendor {
    id: number;
    name: string;
    cuisine: string | null;
    description: string | null;
    city: string;
    address: string | null;
    status: 'active' | 'pending' | 'suspended';
    commission_pct: number;
    prep_minutes: number;
    delivery_fee_zig: number;
    min_order_zig: number;
    rating: number;
    is_featured: boolean;
    orders_30d: number;
    revenue_30d: number | null;
    commission_30d: number | null;
}

export default function Vendors({ vendors, filters, cities }: { vendors: Vendor[]; filters: { status?: string; q?: string }; cities: string[] }) {
    const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
    const status = filters.status ?? '';

    return (
        <AppLayout breadcrumbs={[{ title: 'Vendors', href: '/admin/vendors' }]}>
            <Head title="Vendors" />
            <div className="flex flex-col gap-4 p-4 md:p-6">
                <PageHeader title="Vendors" subtitle="Restaurants and stores on the marketplace" actions={<Button onClick={() => setEditing('new')}><Plus /> Add vendor</Button>} />

                <Tabs
                    value={status}
                    onChange={(s) => router.get('/admin/vendors', { status: s || undefined }, { preserveState: true })}
                    options={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }, { value: 'suspended', label: 'Suspended' }]}
                />

                <Panel>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                                <tr>{['Vendor', 'City', 'Status', 'Commission', 'Orders (30d)', 'Revenue (30d)', 'Our cut (30d)', ''].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y">
                                {vendors.map((v) => (
                                    <tr key={v.id} className="hover:bg-muted/40">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{v.name} {v.is_featured && <span className="text-gold text-xs">★ Featured</span>}</div>
                                            <div className="text-muted-foreground text-xs">{v.cuisine} · ★ {v.rating}</div>
                                        </td>
                                        <td className="px-4 py-3">{v.city}</td>
                                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                                        <td className="px-4 py-3 tabular-nums">{v.commission_pct}%</td>
                                        <td className="px-4 py-3 tabular-nums">{v.orders_30d}</td>
                                        <td className="px-4 py-3 tabular-nums">{zig(v.revenue_30d ?? 0)}</td>
                                        <td className="text-brand px-4 py-3 font-semibold tabular-nums">{zig(v.commission_30d ?? 0)}</td>
                                        <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {vendors.length === 0 && <Empty>No vendors found.</Empty>}
                    </div>
                </Panel>
            </div>
            {editing && <VendorDialog vendor={editing === 'new' ? null : editing} cities={cities} onClose={() => setEditing(null)} />}
        </AppLayout>
    );
}

function VendorDialog({ vendor, cities, onClose }: { vendor: Vendor | null; cities: string[]; onClose: () => void }) {
    const { data, setData, post, patch, processing, errors } = useForm({
        name: vendor?.name ?? '',
        cuisine: vendor?.cuisine ?? '',
        description: vendor?.description ?? '',
        city: vendor?.city ?? cities[0],
        address: vendor?.address ?? '',
        status: vendor?.status ?? 'pending',
        commission_pct: vendor?.commission_pct ?? 15,
        prep_minutes: vendor?.prep_minutes ?? 20,
        delivery_fee_zig: vendor?.delivery_fee_zig ?? 15,
        min_order_zig: vendor?.min_order_zig ?? 50,
        is_featured: vendor?.is_featured ?? false,
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const opts = { preserveScroll: true, onSuccess: onClose };
        vendor ? patch(`/admin/vendors/${vendor.id}`, opts) : post('/admin/vendors', opts);
    };
    const field = (k: keyof typeof data, labelText: string, type = 'text') => (
        <label className="block">
            {labelText}
            <input type={type} step="any" className={fieldClass} value={data[k] as string | number} onChange={(e) => setData(k, e.target.value as never)} />
            {errors[k] && <p className="text-zred mt-1 text-xs">{errors[k]}</p>}
        </label>
    );

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader><DialogTitle>{vendor ? `Edit ${vendor.name}` : 'New vendor'}</DialogTitle></DialogHeader>
                <form onSubmit={submit} className="grid grid-cols-2 gap-3 text-sm">
                    <div className="col-span-2">{field('name', 'Name')}</div>
                    {field('cuisine', 'Cuisine')}
                    <label className="block">City
                        <select className={fieldClass} value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</select>
                    </label>
                    <div className="col-span-2">{field('address', 'Address')}</div>
                    <label className="block">Status
                        <select className={fieldClass} value={data.status} onChange={(e) => setData('status', e.target.value as Vendor['status'])}>
                            <option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option>
                        </select>
                    </label>
                    {field('commission_pct', 'Commission %', 'number')}
                    {field('delivery_fee_zig', 'Delivery fee (ZiG)', 'number')}
                    {field('min_order_zig', 'Min order (ZiG)', 'number')}
                    {field('prep_minutes', 'Prep time (min)', 'number')}
                    <div className="flex items-end"><Switch checked={data.is_featured} onChange={(v) => setData('is_featured', v)} label="Featured" /></div>
                    <div className="col-span-2 flex justify-end border-t pt-3"><Button disabled={processing}>Save vendor</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

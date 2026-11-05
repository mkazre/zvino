import { Button } from '@/components/ui/button';
import { Badge, Card, DataTable, Drawer, Field, Input, Page, PageHeader, SearchInput, Select, Stars, StatusPill, TabBar, Thumb, Toolbar, type Column } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { router, useForm } from '@inertiajs/react';
import { Plus, Store, Zap } from 'lucide-react';
import { useState } from 'react';

interface Vendor {
    id: number; name: string; cuisine: string | null; city: string; logo_path: string | null; status: string; commission_pct: number; rating: number; rating_count: number; is_featured: boolean;
    orders_30d: number; revenue_30d: number | null; commission_30d: number | null; items_count: number; balance_zig: number; zone?: { name: string } | null;
    availability: { is_open: boolean; reason: string | null; is_busy: boolean; power_out: boolean };
}

export default function Vendors({ vendors, filters, cities, zones, defaultCommission }: { vendors: Vendor[]; filters: { status?: string; q?: string; city?: string }; cities: string[]; zones: { id: number; name: string }[]; defaultCommission: number }) {
    const [q, setQ] = useState(filters.q ?? '');
    const [creating, setCreating] = useState(false);
    const go = (p: Record<string, string | undefined>) => router.get('/admin/vendors', { ...filters, ...p }, { preserveState: true, replace: true });

    const live = (v: Vendor) => (v.status !== 'active' ? <StatusPill status={v.status} /> : v.availability.power_out ? <StatusPill status="power_out" label="Load-shedding" /> : v.availability.is_busy ? <StatusPill status="busy" /> : v.availability.is_open ? <StatusPill status="open" label="Open" /> : <StatusPill status={v.availability.reason ?? 'closed'} />);

    const columns: Column<Vendor>[] = [
        { key: 'name', header: 'Store', sort: (v) => v.name, cell: (v) => <div className="flex items-center gap-3"><Thumb src={v.logo_path} size={40} /><div><div className="flex items-center gap-1.5 font-semibold">{v.name}{v.is_featured && <Zap className="text-gold size-3.5 fill-current" />}</div><div className="text-muted-foreground text-xs">{v.cuisine} · {v.city}{v.zone && ` · ${v.zone.name}`}</div></div></div> },
        { key: 'live', header: 'Right now', cell: live },
        { key: 'rating', header: 'Rating', sort: (v) => v.rating, hideOnMobile: true, cell: (v) => (v.rating_count ? <Stars value={v.rating} count={v.rating_count} /> : <span className="text-muted-foreground text-xs">No reviews</span>) },
        { key: 'orders', header: 'Orders (30d)', align: 'right', sort: (v) => v.orders_30d, cell: (v) => <span className="tabular">{v.orders_30d}</span> },
        { key: 'gmv', header: 'Sales (30d)', align: 'right', sort: (v) => v.revenue_30d ?? 0, cell: (v) => <span className="tabular font-medium">{zig(v.revenue_30d ?? 0)}</span> },
        { key: 'comm', header: 'Commission', align: 'right', hideOnMobile: true, sort: (v) => v.commission_30d ?? 0, cell: (v) => <div className="tabular"><div className="font-medium">{zig(v.commission_30d ?? 0)}</div><div className="text-muted-foreground text-xs">{v.commission_pct}%</div></div> },
        { key: 'owed', header: 'Owed to store', align: 'right', hideOnMobile: true, sort: (v) => v.balance_zig, cell: (v) => <span className="tabular">{zig(v.balance_zig)}</span> },
    ];

    const count = (s?: string) => vendors.filter((v) => !s || v.status === s).length;
    return (
        <AdminLayout title="Stores">
            <Page wide>
                <PageHeader title="Stores" description="Restaurants, grocers and pharmacies on Zvino." actions={<Button onClick={() => setCreating(true)}><Plus /> Add store</Button>} />
                <TabBar value={filters.status ?? ''} onChange={(s) => go({ status: s || undefined })} options={[{ value: '', label: 'All', count: count() }, { value: 'active', label: 'Active', count: count('active') }, { value: 'pending', label: 'Onboarding', count: count('pending') }, { value: 'suspended', label: 'Suspended', count: count('suspended') }]} />
                <Card>
                    <Toolbar>
                        <SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Store or cuisine" className="w-72" />
                        <Select value={filters.city ?? ''} onChange={(e) => go({ city: e.target.value || undefined })} className="h-9 w-auto"><option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}</Select>
                    </Toolbar>
                    <DataTable rows={vendors} columns={columns} onRowClick={(v) => router.visit(`/admin/vendors/${v.id}`)} empty={<div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-sm"><Store className="size-6" />No stores yet.</div>} />
                </Card>
            </Page>
            {creating && <CreateStore cities={cities} zones={zones} defaultCommission={defaultCommission} onClose={() => setCreating(false)} />}
        </AdminLayout>
    );
}

function CreateStore({ cities, zones, defaultCommission, onClose }: { cities: string[]; zones: { id: number; name: string }[]; defaultCommission: number; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', cuisine: '', city: cities[0], zone_id: '', address: '', phone: '', email: '', status: 'pending', commission_pct: defaultCommission, prep_minutes: 20, delivery_fee_zig: 15, min_order_zig: 50, lat: '', lng: '' });
    return (
        <Drawer open onClose={onClose} title="Add a store" description="You can set the menu, opening hours and staff on the next screen."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post('/admin/vendors')}>Create store</Button></>}>
            <div className="grid gap-4">
                <Field label="Store name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Cuisine / type"><Input value={data.cuisine} onChange={(e) => setData('cuisine', e.target.value)} placeholder="Traditional, Grills, Pharmacy…" /></Field>
                    <Field label="City"><Select value={data.city} onChange={(e) => setData('city', e.target.value)}>{cities.map((c) => <option key={c}>{c}</option>)}</Select></Field>
                </div>
                <Field label="Address"><Input value={data.address} onChange={(e) => setData('address', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude" hint="From Google Maps: right-click → copy"><Input value={data.lat} onChange={(e) => setData('lat', e.target.value)} placeholder="-17.8292" /></Field>
                    <Field label="Longitude"><Input value={data.lng} onChange={(e) => setData('lng', e.target.value)} placeholder="31.0522" /></Field>
                    <Field label="Phone"><Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} /></Field>
                    <Field label="Email"><Input value={data.email} onChange={(e) => setData('email', e.target.value)} /></Field>
                    <Field label="Commission"><Input type="number" suffix="%" value={data.commission_pct} onChange={(e) => setData('commission_pct', Number(e.target.value))} /></Field>
                    <Field label="Zone"><Select value={data.zone_id} onChange={(e) => setData('zone_id', e.target.value)}><option value="">Auto-detect</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
                </div>
            </div>
        </Drawer>
    );
}

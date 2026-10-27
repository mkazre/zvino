import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, Tabs, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { label, zig } from '@/lib/money';
import { type PageLink } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Pagination } from './orders';

interface Row {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    vendor?: { id: number; name: string } | null;
    vendor_id: number | null;
    loyalty?: { points: number; tier: string } | null;
    orders_count: number;
    spend_zig: number | null;
    created_at: string;
}

interface Props {
    users: { data: Row[]; links: PageLink[]; total: number };
    filters: { type: 'customers' | 'staff'; q: string | null; tier: string | null };
    tiers: string[];
    roles: string[];
    vendors: { id: number; name: string }[];
}

const TIER_TONE: Record<string, string> = { Bronze: 'bg-orange-100 text-orange-800', Silver: 'bg-slate-200 text-slate-800', Gold: 'bg-amber-100 text-amber-800', Platinum: 'bg-emerald-100 text-emerald-800' };

export default function Users({ users, filters, tiers, roles, vendors }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [creating, setCreating] = useState(false);
    const go = (p: Partial<Props['filters']>) => router.get('/admin/users', { ...filters, ...p }, { preserveState: true, replace: true });
    const staff = filters.type === 'staff';

    return (
        <AppLayout breadcrumbs={[{ title: 'Users', href: '/admin/users' }]}>
            <Head title="Users" />
            <div className="flex flex-col gap-4 p-4 md:p-6">
                <PageHeader title={staff ? 'Staff' : 'Customers'} subtitle={`${users.total} ${staff ? 'staff accounts' : 'customers'}`} actions={staff && <Button onClick={() => setCreating(true)}><Plus /> Add staff</Button>} />

                <div className="flex flex-wrap items-center gap-3">
                    <Tabs value={filters.type} onChange={(type) => go({ type, tier: null })} options={[{ value: 'customers', label: 'Customers' }, { value: 'staff', label: 'Staff' }]} />
                    {!staff && (
                        <select className={`${fieldClass} w-36`} value={filters.tier ?? ''} onChange={(e) => go({ tier: e.target.value || null })}>
                            <option value="">All tiers</option>
                            {tiers.map((t) => <option key={t}>{t}</option>)}
                        </select>
                    )}
                    <form className="ml-auto" onSubmit={(e) => { e.preventDefault(); go({ q }); }}>
                        <input className={fieldClass} placeholder="Name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} />
                    </form>
                </div>

                <Panel>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                                <tr>{(staff ? ['Name', 'Email', 'Role', 'Vendor'] : ['Customer', 'Phone', 'Tier', 'Points', 'Orders', 'Lifetime spend', 'Joined']).map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y">
                                {users.data.map((u) =>
                                    staff ? (
                                        <tr key={u.id}>
                                            <td className="px-4 py-3 font-medium">{u.name}</td>
                                            <td className="px-4 py-3">{u.email}</td>
                                            <td className="px-4 py-3">
                                                <select className={`${fieldClass} h-8 w-40`} value={u.role} onChange={(e) => router.patch(`/admin/users/staff/${u.id}`, { role: e.target.value, vendor_id: u.vendor_id }, { preserveScroll: true })}>
                                                    {roles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-4 py-3">{u.vendor?.name ?? <span className="text-muted-foreground">All vendors</span>}</td>
                                        </tr>
                                    ) : (
                                        <tr key={u.id}>
                                            <td className="px-4 py-3 font-medium">{u.name || <span className="text-muted-foreground">(no name yet)</span>}</td>
                                            <td className="px-4 py-3 tabular-nums">{u.phone}</td>
                                            <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_TONE[u.loyalty?.tier ?? 'Bronze']}`}>{u.loyalty?.tier ?? 'Bronze'}</span></td>
                                            <td className="px-4 py-3 tabular-nums">{u.loyalty?.points ?? 0}</td>
                                            <td className="px-4 py-3 tabular-nums">{u.orders_count}</td>
                                            <td className="px-4 py-3 tabular-nums">{zig(u.spend_zig ?? 0)}</td>
                                            <td className="text-muted-foreground px-4 py-3">{new Date(u.created_at).toLocaleDateString('en-ZW')}</td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                        {users.data.length === 0 && <Empty>No users found.</Empty>}
                    </div>
                    <Pagination links={users.links} />
                </Panel>
            </div>
            {creating && <StaffDialog roles={roles} vendors={vendors} onClose={() => setCreating(false)} />}
        </AppLayout>
    );
}

function StaffDialog({ roles, vendors, onClose }: { roles: string[]; vendors: Props['vendors']; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({ name: '', email: '', password: '', role: 'cashier', vendor_id: vendors[0]?.id ?? '' });

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>New staff account</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); post('/admin/users/staff', { onSuccess: onClose }); }} className="space-y-3 text-sm">
                    {(['name', 'email', 'password'] as const).map((k) => (
                        <label key={k} className="block">
                            {label(k)}
                            <input type={k === 'password' ? 'password' : k === 'email' ? 'email' : 'text'} className={fieldClass} value={data[k]} onChange={(e) => setData(k, e.target.value)} />
                            {errors[k] && <p className="text-zred mt-1 text-xs">{errors[k]}</p>}
                        </label>
                    ))}
                    <label className="block">Role
                        <select className={fieldClass} value={data.role} onChange={(e) => setData('role', e.target.value)}>
                            {roles.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                        </select>
                    </label>
                    {data.role !== 'super_admin' && (
                        <label className="block">Vendor
                            <select className={fieldClass} value={data.vendor_id} onChange={(e) => setData('vendor_id', Number(e.target.value))}>
                                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            {errors.vendor_id && <p className="text-zred mt-1 text-xs">{errors.vendor_id}</p>}
                        </label>
                    )}
                    <div className="flex justify-end border-t pt-3"><Button disabled={processing}>Create account</Button></div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

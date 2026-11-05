import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardHeader, Drawer, Field, Input, Page, PageHeader, Select, Switch, TabBar, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type SharedData } from '@/types';
import { router, useForm, usePage } from '@inertiajs/react';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';

interface Staff { id: number; name: string; email: string; phone: string | null; role: string; vendor_id: number | null; vendor?: { name: string } | null; banned_at: string | null; last_seen_at: string | null }
interface Props {
    staff: Staff[];
    roles: string[];
    storeRoles: string[];
    vendors: { id: number; name: string }[];
    permissions: Record<string, string>;
    matrix: Record<string, string[]>;
}

const ROLE_DESC: Record<string, string> = {
    super_admin: 'Everything, including roles and permissions',
    admin: 'Runs day-to-day operations across all stores',
    support: 'Customer support, refunds and order fixes',
    vendor_manager: 'Manages one store: menu, orders, POS, kitchen',
    cashier: 'Point of sale at one store',
    kitchen: 'Kitchen display at one store',
};

export default function StaffPage(p: Props) {
    const [tab, setTab] = useState<'people' | 'roles'>('people');
    const [editing, setEditing] = useState<Staff | 'new' | null>(null);
    const { auth } = usePage<SharedData>().props;

    return (
        <AdminLayout title="Staff & roles">
            <Page wide>
                <PageHeader title="Staff & roles" description="Who can sign in to the admin, merchant and POS apps, and what they can do." actions={tab === 'people' && <Button onClick={() => setEditing('new')}><Plus /> Add staff</Button>} />
                <TabBar value={tab} onChange={setTab} options={[{ value: 'people', label: 'People', count: p.staff.length }, { value: 'roles', label: 'Roles & permissions' }]} />

                {tab === 'people' ? (
                    <div className="grid gap-4">
                        {p.roles.map((role) => {
                            const people = p.staff.filter((s) => s.role === role);
                            if (!people.length) return null;
                            return (
                                <Card key={role}>
                                    <CardHeader title={label(role)} description={ROLE_DESC[role]} />
                                    <ul className="divide-y border-t">
                                        {people.map((s) => (
                                            <li key={s.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', s.banned_at && 'opacity-50')}>
                                                <Avatar name={s.name} size={34} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-semibold">{s.name} {s.id === auth.user.id && <span className="text-muted-foreground text-xs font-normal">(you)</span>}</div>
                                                    <div className="text-muted-foreground text-xs">{s.email}{s.vendor && ` · ${s.vendor.name}`}</div>
                                                </div>
                                                {s.banned_at ? <Badge tone="danger">Deactivated</Badge> : <span className="text-muted-foreground text-xs">{s.last_seen_at ? `Active ${timeAgo(s.last_seen_at)}` : 'Never signed in'}</span>}
                                                <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                                            </li>
                                        ))}
                                    </ul>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <PermissionMatrix permissions={p.permissions} matrix={p.matrix} />
                )}
            </Page>
            {editing && <StaffDrawer {...p} member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
        </AdminLayout>
    );
}

function PermissionMatrix({ permissions, matrix }: { permissions: Props['permissions']; matrix: Props['matrix'] }) {
    const [state, setState] = useState(matrix);
    const roles = Object.keys(state);
    const dirty = (r: string) => JSON.stringify([...state[r]].sort()) !== JSON.stringify([...matrix[r]].sort());

    return (
        <Card className="overflow-hidden">
            <div className="scroll-quiet overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-subtle border-b">
                            <th className="px-5 py-3 text-left text-xs font-medium">Permission</th>
                            <th className="text-muted-foreground px-3 py-3 text-center text-xs font-medium">Super admin</th>
                            {roles.map((r) => <th key={r} className="px-3 py-3 text-center text-xs font-medium whitespace-nowrap">{label(r)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {Object.entries(permissions).map(([key, desc]) => (
                            <tr key={key} className="hover:bg-subtle">
                                <td className="px-5 py-2.5"><div className="font-medium">{desc}</div><code className="text-muted-foreground text-[11px]">{key}</code></td>
                                <td className="text-center"><Check className="text-muted-foreground mx-auto size-4" /></td>
                                {roles.map((r) => (
                                    <td key={r} className="px-3 text-center">
                                        <input type="checkbox" className="accent-[var(--primary)] size-4 cursor-pointer" checked={state[r].includes(key)} onChange={(e) => setState({ ...state, [r]: e.target.checked ? [...state[r], key] : state[r].filter((x) => x !== key) })} aria-label={`${label(r)}: ${desc}`} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-subtle border-t">
                            <td className="text-muted-foreground px-5 py-3 text-xs">Changes apply the next time each person loads a page.</td>
                            <td />
                            {roles.map((r) => (
                                <td key={r} className="px-2 py-3 text-center">
                                    <Button size="sm" variant={dirty(r) ? 'default' : 'ghost'} disabled={!dirty(r)} onClick={() => router.put(`/admin/staff/permissions/${r}`, { permissions: state[r] }, { preserveScroll: true })}>Save</Button>
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                </table>
            </div>
        </Card>
    );
}

function StaffDrawer({ member: staff, roles, storeRoles, vendors, onClose }: Props & { member: Staff | null; onClose: () => void }) {
    const confirm = useConfirm();
    const { data, setData, post, patch, processing, errors } = useForm({
        name: staff?.name ?? '',
        email: staff?.email ?? '',
        phone: staff?.phone ?? '',
        password: '',
        role: staff?.role ?? 'cashier',
        vendor_id: staff?.vendor_id ?? vendors[0]?.id ?? '',
    });
    const needsStore = storeRoles.includes(data.role);

    return (
        <Drawer open onClose={onClose} title={staff ? `Edit ${staff.name}` : 'Add staff member'} description={staff ? staff.email : 'They’ll sign in with this email and password.'}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => (staff ? patch(`/admin/staff/${staff.id}`, { onSuccess: onClose }) : post('/admin/staff', { onSuccess: onClose }))}>{staff ? 'Save' : 'Create account'}</Button></>}>
            <div className="grid gap-4">
                {!staff && (
                    <>
                        <Field label="Full name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                        <Field label="Email" error={errors.email}><Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} /></Field>
                        <Field label="Phone" optional><Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} placeholder="+263…" /></Field>
                    </>
                )}
                <Field label="Role" error={errors.role}>
                    <div className="grid gap-2">
                        {roles.map((r) => (
                            <button key={r} type="button" onClick={() => setData('role', r)} className={cn('rounded-lg border px-3 py-2.5 text-left transition', data.role === r ? 'border-foreground ring-foreground/10 ring-4' : 'hover:border-foreground/30')}>
                                <div className="text-sm font-semibold">{label(r)}</div>
                                <div className="text-muted-foreground text-xs">{ROLE_DESC[r]}</div>
                            </button>
                        ))}
                    </div>
                </Field>
                {needsStore && (
                    <Field label="Store" error={errors.vendor_id}>
                        <Select value={data.vendor_id} onChange={(e) => setData('vendor_id', Number(e.target.value))}>
                            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    </Field>
                )}
                <Field label={staff ? 'Reset password' : 'Password'} hint="At least 8 characters." error={errors.password} optional={!!staff}>
                    <Input type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} autoComplete="new-password" />
                </Field>
                {staff && (
                    <div className="border-t pt-4">
                        <Switch checked={!staff.banned_at} label="Account active" description="Deactivating signs them out everywhere immediately."
                            onChange={async (v) => (v || (await confirm({ title: `Deactivate ${staff.name}?`, tone: 'danger', confirmLabel: 'Deactivate' }))) && router.patch(`/admin/staff/${staff.id}`, { active: v }, { onSuccess: onClose })} />
                    </div>
                )}
            </div>
        </Drawer>
    );
}

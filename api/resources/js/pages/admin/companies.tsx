import { Button } from '@/components/ui/button';
import { Badge, Card, Drawer, Field, Input, Modal, Page, PageHeader, StatusPill, Switch, Textarea } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { router, useForm } from '@inertiajs/react';
import { Building2, FileText, Pencil, Plus, UserPlus } from 'lucide-react';
import { useState } from 'react';

interface Member { id: number; phone: string; name: string | null; role: string; is_active: boolean; daily_allowance_zig: number | null; user: { name: string } | null }
interface Invoice { id: number; number: string; amount_zig: number; orders_count: number; period_start: string; period_end: string; due_on: string; status: string }
interface Company {
    id: number; name: string; billing_email: string | null; billing_contact: string | null; vat_number: string | null;
    monthly_budget_zig: number | null; daily_allowance_zig: number | null; allowed_days: number[] | null; payment_terms_days: number; is_active: boolean;
    members_count: number; members: Member[]; invoices: Invoice[]; spent_month_zig: number; unbilled_zig: number;
}
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Corporate accounts: staff lunches on the company tab, invoiced monthly. */
export default function Companies({ companies }: { companies: Company[] }) {
    const [editing, setEditing] = useState<Company | 'new' | null>(null);
    const [adding, setAdding] = useState<Company | null>(null);
    const [paying, setPaying] = useState<Invoice | null>(null);
    return (
        <AdminLayout title="Companies">
            <Page>
                <PageHeader title="Corporate accounts" description="Staff order on the company’s tab within a daily allowance. Zvino invoices each company on the 1st of the month."
                    actions={<><Button variant="outline" onClick={() => router.post('/admin/company-invoices')}><FileText /> Invoice now</Button><Button onClick={() => setEditing('new')}><Plus /> New company</Button></>} />
                {companies.length === 0 && <Card padded className="text-muted-foreground text-center text-sm"><Building2 className="mx-auto mb-2 size-6" />No corporate accounts yet.</Card>}
                <div className="grid gap-4">
                    {companies.map((c) => (
                        <Card key={c.id} padded>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-semibold">{c.name} {!c.is_active && <Badge>Paused</Badge>}</h3>
                                    <p className="text-muted-foreground text-[13px]">{c.members_count} staff · {c.daily_allowance_zig ? `${zig(c.daily_allowance_zig)}/day each` : 'no daily limit'} · {c.monthly_budget_zig ? `${zig(c.monthly_budget_zig)}/month budget` : 'no monthly cap'} · {c.allowed_days?.length ? c.allowed_days.map((d) => DAYS[d - 1]).join(', ') : 'every day'}</p>
                                    <p className="text-muted-foreground text-[13px]">Bills to {c.billing_contact ?? '—'} {c.billing_email} · {c.payment_terms_days}-day terms</p>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setAdding(c)}><UserPlus /> Add staff</Button>
                                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setEditing(c)}><Pencil /></Button>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                                <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{zig(c.spent_month_zig)}</div><div className="text-muted-foreground">this month</div></div>
                                <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{zig(c.unbilled_zig)}</div><div className="text-muted-foreground">not yet invoiced</div></div>
                                <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{c.invoices.filter((i) => i.status !== 'paid').length}</div><div className="text-muted-foreground">unpaid invoices</div></div>
                                <div className="bg-subtle rounded-lg p-2"><div className="tabular text-sm font-semibold">{zig(c.invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount_zig, 0))}</div><div className="text-muted-foreground">owed</div></div>
                            </div>
                            {c.invoices.length > 0 && (
                                <div className="mt-3 grid gap-1">
                                    {c.invoices.map((i) => (
                                        <div key={i.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                                            <span className="font-mono text-xs">{i.number}</span>
                                            <span className="text-muted-foreground text-xs">{i.orders_count} orders · due {new Date(i.due_on).toLocaleDateString('en-ZW')}</span>
                                            <span className="tabular font-semibold">{zig(i.amount_zig)}</span>
                                            {i.status === 'paid' ? <StatusPill status="paid" /> : <Button size="sm" variant="outline" onClick={() => setPaying(i)}>Mark paid</Button>}
                                        </div>
                                    ))}
                                </div>
                            )}
                            {c.members.length > 0 && (
                                <details className="mt-3 text-sm">
                                    <summary className="cursor-pointer font-medium">Staff ({c.members.length})</summary>
                                    <div className="mt-2 grid gap-1">
                                        {c.members.map((m) => (
                                            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-neutral-50 dark:hover:bg-white/5">
                                                <span>{m.user?.name ?? m.name ?? 'Invited'} <span className="text-muted-foreground font-mono text-xs">{m.phone}</span> {m.role === 'admin' && <Badge>Admin</Badge>} {!m.user && <Badge tone="warning">Not signed up yet</Badge>}</span>
                                                <Switch checked={m.is_active} onChange={(v) => router.patch(`/admin/company-members/${m.id}`, { is_active: v }, { preserveScroll: true })} />
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </Card>
                    ))}
                </div>
            </Page>
            {editing && <CompanyDrawer c={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
            {adding && <AddStaff c={adding} onClose={() => setAdding(null)} />}
            {paying && <PayInvoice i={paying} onClose={() => setPaying(null)} />}
        </AdminLayout>
    );
}

function CompanyDrawer({ c, onClose }: { c: Company | null; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        name: c?.name ?? '', billing_email: c?.billing_email ?? '', billing_contact: c?.billing_contact ?? '', vat_number: c?.vat_number ?? '',
        monthly_budget_zig: c?.monthly_budget_zig ?? '', daily_allowance_zig: c?.daily_allowance_zig ?? '', allowed_days: c?.allowed_days ?? [1, 2, 3, 4, 5],
        payment_terms_days: c?.payment_terms_days ?? 30, is_active: c?.is_active ?? true,
    });
    return (
        <Drawer open onClose={onClose} title={c ? `Edit ${c.name}` : 'New company'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post(c ? `/admin/companies/${c.id}` : '/admin/companies', { onSuccess: onClose })}>Save</Button></>}>
            <div className="grid gap-4">
                <Field label="Company name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Billing contact"><Input value={data.billing_contact} onChange={(e) => setData('billing_contact', e.target.value)} /></Field>
                    <Field label="Billing email" error={errors.billing_email}><Input type="email" value={data.billing_email} onChange={(e) => setData('billing_email', e.target.value)} /></Field>
                    <Field label="VAT / BP number" optional><Input value={data.vat_number} onChange={(e) => setData('vat_number', e.target.value)} /></Field>
                    <Field label="Payment terms"><Input type="number" suffix="days" value={data.payment_terms_days} onChange={(e) => setData('payment_terms_days', Number(e.target.value))} /></Field>
                    <Field label="Daily allowance per person" optional><Input type="number" prefix="ZiG" value={data.daily_allowance_zig} onChange={(e) => setData('daily_allowance_zig', e.target.value)} placeholder="No limit" /></Field>
                    <Field label="Monthly budget" optional><Input type="number" prefix="ZiG" value={data.monthly_budget_zig} onChange={(e) => setData('monthly_budget_zig', e.target.value)} placeholder="No cap" /></Field>
                </div>
                <Field label="Covered days"><div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => <Button key={d} type="button" size="sm" variant={data.allowed_days.includes(i + 1) ? 'dark' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setData('allowed_days', data.allowed_days.includes(i + 1) ? data.allowed_days.filter((x) => x !== i + 1) : [...data.allowed_days, i + 1])}>{d}</Button>)}</div></Field>
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Account active" />
            </div>
        </Drawer>
    );
}

function AddStaff({ c, onClose }: { c: Company; onClose: () => void }) {
    const { data, setData, post, processing } = useForm({ phones: '', role: 'member' });
    return (
        <Modal open onClose={onClose} title={`Add staff to ${c.name}`} description="One per line: phone, then optional name. They can pay with “Company account” as soon as they sign in with that number."
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || !data.phones.trim()} onClick={() => post(`/admin/companies/${c.id}/members`, { onSuccess: onClose, preserveScroll: true })}>Add</Button></>}>
            <Textarea rows={8} value={data.phones} onChange={(e) => setData('phones', e.target.value)} placeholder={'0771234567, Tendai Moyo\n0782345678, Rudo Ncube'} className="font-mono text-sm" />
        </Modal>
    );
}

function PayInvoice({ i, onClose }: { i: Invoice; onClose: () => void }) {
    const { data, setData, post, processing } = useForm({ reference: '' });
    return (
        <Modal open onClose={onClose} title={`Invoice ${i.number} paid`} description={`${zig(i.amount_zig)} for ${i.orders_count} orders.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || !data.reference} onClick={() => post(`/admin/company-invoices/${i.id}/paid`, { onSuccess: onClose, preserveScroll: true })}>Mark paid</Button></>}>
            <Field label="Payment reference (bank / EcoCash)"><Input value={data.reference} onChange={(e) => setData('reference', e.target.value)} /></Field>
        </Modal>
    );
}

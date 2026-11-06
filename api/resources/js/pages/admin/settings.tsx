import { Button } from '@/components/ui/button';
import { Badge, Card, Field, FormSection, Input, Page, PageHeader, Select, Switch, Textarea } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import {
    Bell, Bike, Building2, ClipboardList, Coins, CreditCard, FileText, Gift, IdCard, MessageSquareText, Palette, Plug, Receipt, ShieldAlert, Smartphone, type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

interface FieldDef {
    key: string;
    type: 'string' | 'text' | 'bool' | 'int' | 'decimal' | 'money' | 'percent' | 'select' | 'color' | 'image' | 'json' | 'time' | 'list';
    label: string;
    help?: string;
    options?: string[];
    secret?: boolean;
    value: unknown;
}

interface Props {
    group: string;
    groups: { key: string; label: string; icon: string }[];
    fields: FieldDef[];
    pages: { id: number; slug: string; title: string; body: string; is_published: boolean }[];
    templates: { id: number; event: string; channel: string; title: string | null; body: string; is_active: boolean }[];
    rateHistory: { id: number; zig_per_usd: number; effective_at: string }[];
    vendors: { id: number; name: string }[];
}

const ICONS: Record<string, LucideIcon> = {
    building: Building2, palette: Palette, coins: Coins, receipt: Receipt, bike: Bike, clipboard: ClipboardList, 'credit-card': CreditCard,
    gift: Gift, bell: Bell, plug: Plug, smartphone: Smartphone, 'id-card': IdCard, message: MessageSquareText, file: FileText, shield: ShieldAlert,
};

/** Visual grouping of fields inside a tab (keeps long tabs scannable). */
const SECTIONS: Record<string, { title: string; description: string; keys: string[] }[]> = {
    general: [
        { title: 'Business details', description: 'Shown on receipts, invoices and the website footer.', keys: ['business_name', 'legal_name', 'vat_number', 'address'] },
        { title: 'Customer support', description: 'How customers, drivers and stores reach you.', keys: ['support_phone', 'support_whatsapp', 'support_email'] },
        { title: 'Operations', description: 'Where Zvino operates and how the platform behaves.', keys: ['cities', 'timezone', 'platform_mode', 'single_vendor_id'] },
    ],
    fees: [
        { title: 'Service fee', description: 'Charged on every order, as a percentage with a floor and ceiling.', keys: ['service_fee_pct', 'service_fee_min_zig', 'service_fee_max_zig'] },
        { title: 'Small orders', description: 'Discourage tiny orders that cost more to deliver than they earn.', keys: ['small_order_threshold_zig', 'small_order_fee_zig'] },
        { title: 'Commission', description: 'Default for new stores. Override per store on the store page.', keys: ['default_commission_pct', 'pickup_commission_pct'] },
        { title: 'Surge', description: 'Zones can raise delivery fees when demand outstrips drivers.', keys: ['surge_enabled', 'max_surge'] },
    ],
    delivery: [
        { title: 'Dispatch', description: 'How jobs are offered to drivers.', keys: ['dispatch_mode', 'dispatch_when', 'offer_timeout_seconds', 'max_offer_radius_km', 'max_offer_attempts', 'allow_batching'] },
        { title: 'Driver pay', description: 'What drivers earn per trip. Delivery fees charged to customers are set per zone.', keys: ['driver_base_pay_zig', 'driver_per_km_zig', 'driver_keeps_tips_pct'] },
        { title: 'Drop-off & safety', description: 'Proof of delivery and cash handling.', keys: ['require_delivery_pin', 'require_proof_photo', 'cash_on_delivery_limit_zig', 'driver_cash_limit_zig', 'location_interval_seconds'] },
    ],
};

export default function Settings({ group, groups, fields, pages, templates, rateHistory, vendors }: Props) {
    const current = groups.find((g) => g.key === group);

    return (
        <AdminLayout title="Settings">
            <Page wide>
                <PageHeader title="Settings" description="Everything that controls how Zvino runs. Changes apply immediately and are recorded in the audit log." />
                <div className="grid gap-6 lg:grid-cols-[232px_1fr]">
                    <nav className="lg:sticky lg:top-24 lg:self-start">
                        <ul className="scroll-quiet flex gap-1 overflow-x-auto lg:grid lg:overflow-visible">
                            {groups.map((g) => {
                                const Icon = ICONS[g.icon] ?? Building2;
                                return (
                                    <li key={g.key}>
                                        <Link
                                            href={`/admin/settings/${g.key}`}
                                            preserveScroll
                                            className={cn(
                                                'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium whitespace-nowrap transition',
                                                g.key === group ? 'bg-surface text-foreground border shadow-(--shadow-card)' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            {g.label}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    <div className="min-w-0">
                        {group === 'pages' ? <PagesEditor pages={pages} /> : group === 'templates' ? <TemplatesEditor templates={templates} /> : <GroupForm key={group} group={group} title={current?.label ?? ''} fields={fields} rateHistory={rateHistory} vendors={vendors} />}
                    </div>
                </div>
            </Page>
        </AdminLayout>
    );
}

function GroupForm({ group, title, fields, rateHistory, vendors }: { group: string; title: string; fields: FieldDef[]; rateHistory: Props['rateHistory']; vendors: Props['vendors'] }) {
    const initial = useMemo(() => Object.fromEntries(fields.map((f) => [f.key, f.value])), [fields]);
    const [values, setValues] = useState<Record<string, unknown>>(initial);
    const [files, setFiles] = useState<Record<string, File>>({});
    const [saving, setSaving] = useState(false);
    const dirty = JSON.stringify(values) !== JSON.stringify(initial) || Object.keys(files).length > 0;
    const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

    const sections = SECTIONS[group] ?? [{ title, description: '', keys: fields.map((f) => f.key) }];
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    const leftover = fields.filter((f) => !sections.some((s) => s.keys.includes(f.key)));

    const save = () => {
        setSaving(true);
        router.post(`/admin/settings/${group}`, { values, files } as never, { forceFormData: Object.keys(files).length > 0, preserveScroll: true, onFinish: () => setSaving(false), onSuccess: () => setFiles({}) });
    };

    return (
        <Card>
            <div className="px-6">
                {[...sections, ...(leftover.length ? [{ title: 'More', description: '', keys: leftover.map((f) => f.key) }] : [])].map((s) => (
                    <FormSection key={s.title} title={s.title} description={s.description}>
                        {s.keys.map((k) => byKey[k]).filter(Boolean).map((f) =>
                            f.key === 'single_vendor_id' && values.platform_mode !== 'single' ? null : (
                                <SettingControl key={f.key} f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} onFile={(file) => setFiles((s) => ({ ...s, [f.key]: file }))} vendors={vendors} />
                            ),
                        )}
                    </FormSection>
                ))}
                {group === 'notifications' && <TestEmail />}
                {group === 'currency' && rateHistory.length > 0 && (
                    <FormSection title="Rate history" description="Every order stores the rate in force when it was placed.">
                        <ul className="divide-y rounded-lg border text-sm">
                            {rateHistory.map((r) => (
                                <li key={r.id} className="flex justify-between px-3 py-2"><span className="text-muted-foreground">{new Date(r.effective_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="tabular font-medium">1 USD = {r.zig_per_usd} ZiG</span></li>
                            ))}
                        </ul>
                    </FormSection>
                )}
            </div>
            <div className={cn('bg-subtle sticky bottom-0 flex items-center justify-between gap-3 rounded-b-xl border-t px-6 py-3 transition', dirty ? 'opacity-100' : 'opacity-70')}>
                <span className="text-muted-foreground text-[13px]">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => { setValues(initial); setFiles({}); }}>Discard</Button>
                    <Button size="sm" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</Button>
                </div>
            </div>
        </Card>
    );
}

function SettingControl({ f, value, onChange, onFile, vendors }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; onFile: (f: File) => void; vendors: Props['vendors'] }) {
    if (f.type === 'bool') return <Switch checked={!!value} onChange={onChange} label={f.label} description={f.help} />;

    const control = (() => {
        switch (f.type) {
            case 'text':
                return <Textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
            case 'select':
                return (
                    <Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
                        {f.options?.map((o) => <option key={o} value={o}>{label(o)}</option>)}
                    </Select>
                );
            case 'int':
                if (f.key === 'single_vendor_id')
                    return (
                        <Select value={String(value ?? '')} onChange={(e) => onChange(Number(e.target.value))}>
                            <option value="">Choose a restaurant</option>
                            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </Select>
                    );
                return <Input type="number" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
            case 'decimal':
                return <Input type="number" step="any" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
            case 'money':
                return <Input type="number" step="0.01" prefix="ZiG" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
            case 'percent':
                return <Input type="number" step="0.1" suffix="%" value={value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value)} />;
            case 'time':
                return <Input type="time" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="w-40" />;
            case 'color':
                return (
                    <div className="flex items-center gap-3">
                        <input type="color" value={String(value ?? '#000000')} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border" />
                        <Input value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className="w-32 font-mono" />
                    </div>
                );
            case 'image':
                return (
                    <div className="flex items-center gap-4">
                        <div className="bg-muted flex h-14 w-24 items-center justify-center overflow-hidden rounded-lg border">
                            {value ? <img src={String(value)} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-muted-foreground text-xs">None</span>}
                        </div>
                        <input type="file" accept="image/*" className="text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
                    </div>
                );
            case 'list':
                return <TagInput value={(value as (string | number)[]) ?? []} onChange={onChange} />;
            case 'json':
                return <TierEditor value={(value as Record<string, number>) ?? {}} onChange={onChange} />;
            default:
                return <Input type={f.secret ? 'password' : 'text'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} autoComplete="off" />;
        }
    })();

    return (
        <Field label={<span className="flex items-center gap-2">{f.label}{f.secret && <Badge>Secret</Badge>}</span>} hint={f.help}>
            {control}
        </Field>
    );
}

function TagInput({ value, onChange }: { value: (string | number)[]; onChange: (v: unknown) => void }) {
    const [draft, setDraft] = useState('');
    const add = () => {
        const v = draft.trim();
        if (v && !value.map(String).includes(v)) onChange([...value, isNaN(Number(v)) ? v : Number(v)]);
        setDraft('');
    };
    return (
        <div className="border-input bg-surface focus-within:border-ring focus-within:ring-ring/15 flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 focus-within:ring-4">
            {value.map((v) => (
                <span key={String(v)} className="bg-muted inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-medium">
                    {label(String(v))}
                    <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${v}`}>×</button>
                </span>
            ))}
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} placeholder="Add and press Enter" className="min-w-28 flex-1 bg-transparent px-1 text-sm outline-none" />
        </div>
    );
}

function TierEditor({ value, onChange }: { value: Record<string, number>; onChange: (v: unknown) => void }) {
    const rows = Object.entries(value);
    return (
        <div className="grid gap-2">
            {rows.map(([name, pts], i) => (
                <div key={i} className="flex gap-2">
                    <Input value={name} onChange={(e) => onChange(Object.fromEntries(rows.map(([n, p], j) => (j === i ? [e.target.value, p] : [n, p]))))} className="flex-1" />
                    <Input type="number" value={pts} suffix="pts" onChange={(e) => onChange(Object.fromEntries(rows.map(([n, p], j) => (j === i ? [n, Number(e.target.value)] : [n, p]))))} className="w-40" />
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange({ ...value, [`Tier ${rows.length + 1}`]: (rows.at(-1)?.[1] ?? 0) + 1000 })}>Add tier</Button>
        </div>
    );
}

function TemplatesEditor({ templates }: { templates: Props['templates'] }) {
    return (
        <Card>
            <div className="border-b px-6 py-5">
                <h2 className="text-[15px] font-semibold">Message templates</h2>
                <p className="text-muted-foreground mt-1 text-[13px]">Wording for automatic push notifications and SMS. Use placeholders like <code className="bg-muted rounded px-1">{'{{store}}'}</code>, <code className="bg-muted rounded px-1">{'{{driver}}'}</code>, <code className="bg-muted rounded px-1">{'{{order_ref}}'}</code>, <code className="bg-muted rounded px-1">{'{{eta}}'}</code>, <code className="bg-muted rounded px-1">{'{{code}}'}</code>.</p>
            </div>
            <ul className="divide-y">
                {templates.map((t) => <TemplateRow key={t.id} t={t} />)}
            </ul>
        </Card>
    );
}

function TemplateRow({ t }: { t: Props['templates'][number] }) {
    const [title, setTitle] = useState(t.title ?? '');
    const [body, setBody] = useState(t.body);
    const [active, setActive] = useState(t.is_active);
    const dirty = title !== (t.title ?? '') || body !== t.body || active !== t.is_active;
    return (
        <li className="grid gap-3 px-6 py-5 md:grid-cols-[220px_1fr]">
            <div>
                <div className="font-mono text-[13px] font-semibold">{t.event}</div>
                <Badge className="mt-1.5" tone={t.channel === 'sms' ? 'warning' : 'info'}>{t.channel.toUpperCase()}</Badge>
            </div>
            <div className="grid gap-2">
                {t.channel !== 'sms' && <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />}
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[64px]" />
                <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{t.channel === 'sms' ? `${body.length}/160 characters` : ''}</span>
                    <div className="flex items-center gap-3">
                        <Switch size="sm" checked={active} onChange={setActive} />
                        <Button size="sm" variant="outline" disabled={!dirty} onClick={() => router.post(`/admin/settings-templates/${t.id}`, { title, body, is_active: active }, { preserveScroll: true })}>Save</Button>
                    </div>
                </div>
            </div>
        </li>
    );
}

function PagesEditor({ pages }: { pages: Props['pages'] }) {
    const [activeId, setActiveId] = useState(pages[0]?.id);
    const page = pages.find((p) => p.id === activeId);
    const [draft, setDraft] = useState<Record<number, { title: string; body: string; is_published: boolean }>>({});
    const d = page ? (draft[page.id] ?? { title: page.title, body: page.body, is_published: page.is_published }) : null;

    return (
        <Card className="overflow-hidden">
            <div className="grid md:grid-cols-[220px_1fr]">
                <ul className="bg-subtle border-b p-2 md:border-r md:border-b-0">
                    {pages.map((p) => (
                        <li key={p.id}>
                            <button onClick={() => setActiveId(p.id)} className={cn('w-full rounded-lg px-3 py-2 text-left text-sm', p.id === activeId ? 'bg-surface font-semibold shadow-(--shadow-card)' : 'text-muted-foreground hover:text-foreground')}>
                                {p.title}
                                <span className="text-muted-foreground block font-mono text-[11px] font-normal">/{p.slug}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                {page && d && (
                    <div className="grid gap-4 p-6">
                        <Field label="Title"><Input value={d.title} onChange={(e) => setDraft({ ...draft, [page.id]: { ...d, title: e.target.value } })} /></Field>
                        <Field label="Content" hint="Basic HTML is supported (headings, paragraphs, lists, links).">
                            <Textarea value={d.body} onChange={(e) => setDraft({ ...draft, [page.id]: { ...d, body: e.target.value } })} className="min-h-[360px] font-mono text-[13px]" />
                        </Field>
                        <div className="flex items-center justify-between">
                            <Switch checked={d.is_published} onChange={(v) => setDraft({ ...draft, [page.id]: { ...d, is_published: v } })} label="Published on website and apps" />
                            <Button size="sm" onClick={() => router.post(`/admin/settings-pages/${page.id}`, d, { preserveScroll: true })}>Save page</Button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

/** Sends a real email now and shows the mail server's answer (success or the exact error). */
function TestEmail() {
    const [to, setTo] = useState('');
    const [busy, setBusy] = useState(false);
    return (
        <FormSection title="Test email" description="Check that order, receipt and application emails can be delivered. Leave empty to send to yourself.">
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="you@example.com" className="sm:max-w-xs" />
                <Button variant="outline" disabled={busy} onClick={() => { setBusy(true); router.post('/admin/settings/test-email', to ? { to } : {}, { preserveScroll: true, onFinish: () => setBusy(false) }); }}>Send a test email</Button>
            </div>
        </FormSection>
    );
}

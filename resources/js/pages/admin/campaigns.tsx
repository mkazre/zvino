import { Button } from '@/components/ui/button';
import { Badge, Card, Drawer, EmptyState, Field, Input, Page, PageHeader, Segmented, Select, StatusPill, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo } from '@/lib/money';
import { router, useForm } from '@inertiajs/react';
import { Megaphone, MessageSquare, Moon, Plus, Send, Smartphone, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Campaign { id: number; name: string; kind?: 'marketing' | 'service'; image_path?: string | null; channel: 'push' | 'sms'; title: string | null; body: string; audience: Record<string, string | number>; link_to: string | null; status: string; scheduled_at: string | null; sent_count: number; created_at: string }
interface Props { campaigns: Campaign[]; presets: { name: string; title: string; body: string }[]; cities: string[]; tiers: string[]; quiet: { start: string; end: string } }

export default function Campaigns({ campaigns, presets, cities, tiers, quiet }: Props) {
    const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
    const confirm = useConfirm();

    return (
        <AdminLayout title="Campaigns">
            <Page>
                <PageHeader title="Campaigns" description={<>Push and SMS to targeted customers. Messages never go out during quiet hours (<Moon className="inline size-3.5" /> {quiet.start}–{quiet.end}).</>} actions={<Button onClick={() => setEditing({ channel: 'push', audience: {} })}><Plus /> New campaign</Button>} />

                <Card padded>
                    <div className="mb-3 text-sm font-semibold">Start from a template</div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {presets.map((p) => (
                            <button key={p.name} onClick={() => setEditing({ name: p.name, title: p.title, body: p.body, channel: 'push', audience: {} })} className="hover:border-foreground/30 hover:bg-subtle rounded-lg border p-3 text-left transition">
                                <div className="text-sm font-semibold">{p.name}</div>
                                <div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">{p.body}</div>
                            </button>
                        ))}
                    </div>
                </Card>

                <Card>
                    {campaigns.length === 0 ? (
                        <EmptyState icon={Megaphone} title="No campaigns yet" description="Win back lapsed customers, announce new stores or push a weekend deal." />
                    ) : (
                        <ul className="divide-y">
                            {campaigns.map((c) => (
                                <li key={c.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                                    <span className="bg-muted flex size-9 items-center justify-center rounded-lg">{c.channel === 'sms' ? <MessageSquare className="size-4" /> : <Smartphone className="size-4" />}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2"><span className="font-semibold">{c.name}</span><StatusPill status={c.status} /></div>
                                        <div className="text-muted-foreground truncate text-[13px]">{c.title ? `${c.title} · ` : ''}{c.body}</div>
                                        <div className="text-muted-foreground mt-1 flex flex-wrap gap-1.5 text-xs">
                                            {Object.entries(c.audience ?? {}).filter(([, v]) => v).map(([k, v]) => <Badge key={k}>{label(k)}: {String(v)}</Badge>)}
                                            {c.kind === 'service' && <Badge tone="warning">Service notice</Badge>}
                                            {!Object.values(c.audience ?? {}).some(Boolean) && <Badge>All customers</Badge>}
                                        </div>
                                    </div>
                                    <div className="text-muted-foreground text-right text-xs">
                                        {c.status === 'sent' ? <><b className="text-foreground tabular text-sm">{c.sent_count.toLocaleString()}</b> sent</> : c.scheduled_at ? `Scheduled ${new Date(c.scheduled_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}` : `Draft · ${timeAgo(c.created_at)}`}
                                    </div>
                                    {c.status !== 'sent' && (
                                        <div className="flex gap-2">
                                            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                                            <Button size="sm" variant="dark" onClick={async () => (await confirm({ title: `Send “${c.name}” now?`, description: 'This can’t be undone.', confirmLabel: 'Send now' })) && router.post(`/admin/campaigns/${c.id}/send`)}><Send /> Send</Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </Page>
            {editing && <CampaignDrawer c={editing} cities={cities} tiers={tiers} onClose={() => setEditing(null)} />}
        </AdminLayout>
    );
}

function CampaignDrawer({ c, cities, tiers, onClose }: { c: Partial<Campaign>; cities: string[]; tiers: string[]; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        name: c.name ?? '',
        kind: (c.kind ?? 'marketing') as 'marketing' | 'service',
        image: null as File | null,
        remove_image: false as boolean,
        channel: c.channel ?? 'push',
        title: c.title ?? '',
        body: c.body ?? '',
        audience: (c.audience ?? {}) as Record<string, string | number | undefined>,
        link_to: c.link_to ?? '',
        scheduled_at: c.scheduled_at?.slice(0, 16) ?? '',
    });
    const [reach, setReach] = useState<number | null>(null);
    const [imgPreview, setImgPreview] = useState<string | null>(c.image_path ?? null);
    useEffect(() => {
        if (!data.image) return;
        const u = URL.createObjectURL(data.image);
        setImgPreview(u);
        return () => URL.revokeObjectURL(u);
    }, [data.image]);
    const [linkType, linkValue] = (() => {
        const [t, ...rest] = (data.link_to || '').split(':');
        return ['store', 'promo', 'url'].includes(t) ? [t, rest.join(':')] : data.link_to ? ['screen', data.link_to] : ['none', ''];
    })();
    const setLink = (t: string, v: string) => setData('link_to', t === 'none' ? '' : t === 'screen' ? v : `${t}:${v}`);
    const setAud = (k: string, v: string | number | undefined) => setData('audience', { ...data.audience, [k]: v || undefined });

    useEffect(() => {
        const t = setTimeout(() => {
            fetch('/admin/campaigns-audience', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '') }, body: JSON.stringify({ audience: { ...data.audience, kind: data.kind } }) })
                .then((r) => r.json()).then((d) => setReach(d.count)).catch(() => setReach(null));
        }, 300);
        return () => clearTimeout(t);
    }, [data.audience, data.kind]);

    return (
        <Drawer open onClose={onClose} width="lg" title={c.id ? 'Edit campaign' : 'New campaign'}
            footer={<><span className="text-muted-foreground mr-auto flex items-center gap-1.5 text-sm"><Users className="size-4" /> {reach === null ? '…' : reach.toLocaleString()} people</span><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post(c.id ? `/admin/campaigns/${c.id}` : '/admin/campaigns', { forceFormData: true, onSuccess: onClose })}>{data.scheduled_at ? 'Schedule' : 'Save draft'}</Button></>}>
            <div className="grid gap-5">
                <Field label="Internal name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                <Field label="Type" hint={data.kind === 'service' ? 'Outages, holiday hours, safety. Reaches everyone in the audience, even people who turned off promotions, and ignores quiet hours.' : 'Promotions. Only people who allow marketing, never during quiet hours.'}>
                    <Segmented value={data.kind} onChange={(v) => setData('kind', v as 'marketing' | 'service')} options={[{ value: 'marketing', label: 'Marketing' }, { value: 'service', label: 'Service announcement' }]} />
                </Field>
                <Field label="Send to"><Segmented value={String(data.audience.roles ?? 'customers')} onChange={(v) => setAud('roles', v)} options={[{ value: 'all', label: 'Everyone' }, { value: 'customers', label: 'Customers' }, { value: 'drivers', label: 'Drivers' }, { value: 'staff', label: 'Store staff' }]} /></Field>
                <Field label="Channel"><Segmented value={data.channel} onChange={(v) => setData('channel', v)} options={[{ value: 'push', label: 'Push notification' }, { value: 'sms', label: 'SMS' }]} /></Field>
                {data.channel === 'push' && <Field label="Title" hint="Use {{name}} for the customer’s first name."><Input value={data.title} onChange={(e) => setData('title', e.target.value)} /></Field>}
                <Field label="Message" error={errors.body} hint={data.channel === 'sms' ? `${data.body.length}/160. “Reply STOP to opt out” is added automatically.` : undefined}><Textarea value={data.body} onChange={(e) => setData('body', e.target.value)} /></Field>

                {data.channel === 'push' && (
                    <Field label="Image" optional hint="Shown in the notification and the app inbox. Wide images (2:1) look best.">
                        <div className="flex items-center gap-2">
                            <label className="hover:bg-subtle flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed p-3 text-sm">{data.image ? data.image.name : imgPreview ? 'Replace image' : 'Upload image'}<input type="file" accept="image/*" className="hidden" onChange={(e) => { setData('image', e.target.files?.[0] ?? null); setData('remove_image', false); }} /></label>
                            {imgPreview && <Button variant="ghost" size="sm" onClick={() => { setImgPreview(null); setData({ ...data, image: null, remove_image: true }); }}>Remove</Button>}
                        </div>
                    </Field>
                )}

                <div className="bg-foreground text-background mx-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-(--shadow-pop)">
                    <div className="p-4 pb-2">
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] opacity-60"><img src="/brand/mark.png" alt="" className="size-4 rounded bg-white" />ZVINO · now</div>
                    {data.channel === 'push' && <div className="text-sm font-semibold">{(data.title || 'Title').replace('{{name}}', 'Tendai')}</div>}
                    <div className="text-[13px] opacity-90">{(data.body || 'Your message preview').replace('{{name}}', 'Tendai')}</div>
                    </div>
                    {data.channel === 'push' && imgPreview && <img src={imgPreview} alt="" className="max-h-40 w-full object-cover" />}
                </div>

                <div className="grid gap-3 border-t pt-5">
                    <div className="text-sm font-semibold">Audience</div>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="City"><Select value={String(data.audience.city ?? '')} onChange={(e) => setAud('city', e.target.value)}><option value="">All cities</option>{cities.map((x) => <option key={x}>{x}</option>)}</Select></Field>
                        <Field label="Loyalty tier"><Select value={String(data.audience.tier ?? '')} onChange={(e) => setAud('tier', e.target.value)}><option value="">All tiers</option>{tiers.map((x) => <option key={x}>{x}</option>)}</Select></Field>
                        <Field label="Hasn’t ordered for" optional><Input type="number" suffix="days" value={data.audience.inactive_days ?? ''} onChange={(e) => setAud('inactive_days', Number(e.target.value) || undefined)} /></Field>
                        <Field label="At least" optional><Input type="number" suffix="orders" value={data.audience.min_orders ?? ''} onChange={(e) => setAud('min_orders', Number(e.target.value) || undefined)} /></Field>
                        <Field label="Language"><Select value={String(data.audience.locale ?? '')} onChange={(e) => setAud('locale', e.target.value)}><option value="">Any</option><option value="en">English</option><option value="sn">Shona</option><option value="nd">Ndebele</option></Select></Field>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t pt-5">
                    <Field label="When tapped" error={errors.link_to}>
                        <div className="grid gap-2">
                            <Select value={linkType} onChange={(e) => setLink(e.target.value, '')}><option value="none">Open the app</option><option value="store">Open a store</option><option value="promo">Apply a promo code</option><option value="url">Open a web page</option><option value="screen">Open a screen</option></Select>
                            {linkType !== 'none' && <Input value={linkValue} onChange={(e) => setLink(linkType, e.target.value)} placeholder={{ store: 'Store ID, e.g. 12', promo: 'Code, e.g. ZVINO20', url: 'https://…', screen: 'e.g. plans, hampers, wallet' }[linkType]} />}
                        </div>
                    </Field>
                    <Field label="Send at" hint="Leave empty to save as draft" optional error={errors.scheduled_at}><Input type="datetime-local" value={data.scheduled_at} onChange={(e) => setData('scheduled_at', e.target.value)} /></Field>
                </div>
            </div>
        </Drawer>
    );
}

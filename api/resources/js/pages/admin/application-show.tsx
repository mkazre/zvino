import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Field, Input, Modal, Page, PageHeader, Select, StatusPill, Switch, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { timeAgo } from '@/lib/money';
import { fileSize } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { type AppField, type AppSchema, displayValue, isVisible } from '@/types/applications';
import { type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Check, Download, ExternalLink, FileText, Mail, MessageCircle, Pencil, Phone, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { STATUS_LABEL, TYPE_ICON } from './applications';

interface Doc { id: number; field: string; label: string; original_name: string; mime: string; size: number; url: string; is_image: boolean; created_at: string }
interface Props {
    application: {
        id: number; reference: string; type: 'restaurant' | 'driver' | 'corporate'; type_label: string; status: string; title: string; contact_name: string; email: string | null; phone: string | null; city: string | null;
        details: Record<string, unknown>; notes: string | null; decision_message: string | null; reviewed_at: string | null; approved_at: string | null; created_at: string; ip: string | null; reviewer: string | null;
        history: { at: string; by: string | null; action: string; message: string | null }[] | null;
    };
    schema: AppSchema;
    documents: Doc[];
    linked: { type: string; id: number; name: string; url: string } | null;
    approve: { commission: number; zones: { id: number; name: string }[] };
}

const ACTION_LABEL: Record<string, string> = { submitted: 'Submitted', draft: 'Moved to draft', in_review: 'Review started', needs_info: 'Asked for more information', rejected: 'Rejected', approved: 'Approved', edited: 'Details corrected' };

export default function ApplicationShow({ application: a, schema, documents, linked, approve }: Props) {
    const { auth } = usePage<SharedData>().props;
    const confirm = useConfirm();
    const [modal, setModal] = useState<null | 'approve' | 'needs_info' | 'rejected'>(null);
    const [preview, setPreview] = useState<Doc | null>(null);
    const [notes, setNotes] = useState(a.notes ?? '');
    const Icon = TYPE_ICON[a.type];
    const done = a.status === 'approved';
    const steps = schema.steps.filter((s) => s.fields.some((f) => f.type !== 'file'));
    const docsByField = (key: string) => documents.filter((d) => d.field === key);
    const fileFields = schema.steps.flatMap((s) => s.fields.filter((f) => f.type === 'file'));
    const wa = a.phone ? `https://wa.me/${a.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${a.contact_name.split(' ')[0]}, this is Zvino about your application ${a.reference}.`)}` : null;

    const setStatus = (status: string, message?: string) => router.post(`/admin/applications/${a.id}/status`, { status, message, notify: true }, { preserveScroll: true, onSuccess: () => setModal(null) });

    return (
        <AdminLayout title={a.title}>
            <Page wide>
                <Link href="/admin/applications" className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" /> Applications</Link>
                <PageHeader
                    eyebrow={<span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" />{a.type_label} · <span className="font-mono">{a.reference}</span></span>}
                    title={<span className="flex flex-wrap items-center gap-3">{a.title}<StatusPill status={a.status} label={STATUS_LABEL[a.status]} /></span>}
                    description={`Submitted ${new Date(a.created_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })} (${timeAgo(a.created_at)})${a.reviewer ? ` · reviewed by ${a.reviewer}` : ''}`}
                    actions={done ? (
                        linked && <Button asChild><Link href={linked.url}><ExternalLink /> Open {linked.type === 'Vendor' ? 'store' : linked.type === 'Driver' ? 'driver' : 'company'}</Link></Button>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {a.status === 'draft' && <Button variant="outline" onClick={() => setStatus('in_review')}><Search /> Start review</Button>}
                            <Button variant="outline" onClick={() => setModal('needs_info')}><MessageCircle /> Ask for info</Button>
                            {a.status !== 'rejected' && <Button variant="outline" className="text-zred" onClick={() => setModal('rejected')}><X /> Reject</Button>}
                            <Button onClick={() => setModal('approve')}><Check /> Approve</Button>
                        </div>
                    )}
                />
                {a.decision_message && a.status !== 'approved' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        <b>{a.status === 'rejected' ? 'Reason given:' : 'Asked the applicant:'}</b> {a.decision_message}
                    </div>
                )}

                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="grid min-w-0 content-start gap-5">
                        {steps.map((s) => <DetailsCard key={s.key} id={a.id} title={s.title} fields={s.fields.filter((f) => f.type !== 'file')} details={a.details} editable={!done} />)}

                        <Card>
                            <CardHeader title={`Documents & photos (${documents.length})`} description="Stored privately. Only staff who can review applications can open them, before and after approval." />
                            <div className="grid gap-4 border-t p-4 sm:grid-cols-2 xl:grid-cols-3">
                                {fileFields.filter((f) => isVisible(f, a.details as never) || docsByField(f.key).length).map((f) => {
                                    const docs = docsByField(f.key);
                                    return (
                                        <div key={f.key} className="min-w-0">
                                            <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px] font-semibold"><span className="truncate">{f.label}</span>{f.required && !docs.length && <Badge tone="danger">Missing</Badge>}</div>
                                            {docs.length === 0 ? (
                                                <div className="text-muted-foreground flex h-28 items-center justify-center rounded-lg border border-dashed text-xs">Not provided</div>
                                            ) : (
                                                <div className="grid gap-2">
                                                    {docs.map((d) => (
                                                        <div key={d.id} className="group overflow-hidden rounded-lg border">
                                                            <button type="button" onClick={() => (d.is_image ? setPreview(d) : window.open(d.url, '_blank'))} className="bg-muted relative flex h-32 w-full items-center justify-center overflow-hidden">
                                                                {d.is_image ? <img src={d.url} alt={d.label} loading="lazy" className="size-full object-cover transition group-hover:scale-105" /> : <span className="flex flex-col items-center gap-1 text-xs"><FileText className="size-8" />PDF</span>}
                                                            </button>
                                                            <div className="flex items-center gap-2 px-2.5 py-2 text-xs">
                                                                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{d.original_name}</span><span className="text-muted-foreground">{fileSize(d.size)}</span></span>
                                                                <a href={d.url} target="_blank" rel="noreferrer" className="hover:bg-muted rounded p-1" aria-label="Open"><ExternalLink className="size-3.5" /></a>
                                                                <a href={`${d.url}?download=1`} className="hover:bg-muted rounded p-1" aria-label="Download"><Download className="size-3.5" /></a>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </div>

                    <div className="grid content-start gap-5 lg:sticky lg:top-24 lg:self-start">
                        <Card padded className="grid gap-3">
                            <div className="text-sm font-semibold">Contact</div>
                            <div className="text-sm"><div className="font-medium">{a.contact_name}</div><div className="text-muted-foreground">{[a.phone, a.email, a.city].filter(Boolean).join(' · ')}</div></div>
                            <div className="flex flex-wrap gap-2">
                                {a.phone && <Button size="sm" variant="outline" asChild><a href={`tel:${a.phone}`}><Phone /> Call</a></Button>}
                                {wa && <Button size="sm" variant="outline" asChild><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp</a></Button>}
                                {a.email && <Button size="sm" variant="outline" asChild><a href={`mailto:${a.email}?subject=${encodeURIComponent(`Your Zvino application ${a.reference}`)}`}><Mail /> Email</a></Button>}
                            </div>
                            {linked && <div className="bg-brand-50 dark:bg-brand/10 rounded-lg px-3 py-2 text-sm">Created: <Link href={linked.url} className="font-semibold underline">{linked.name}</Link></div>}
                        </Card>
                        <Card padded className="grid gap-2">
                            <div className="text-sm font-semibold">Internal notes</div>
                            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Only staff see this. e.g. Called owner, licence renewal in progress." />
                            <div className="flex justify-end"><Button size="sm" variant="outline" disabled={notes === (a.notes ?? '')} onClick={() => router.post(`/admin/applications/${a.id}/notes`, { notes }, { preserveScroll: true })}>Save notes</Button></div>
                        </Card>
                        <Card padded>
                            <div className="mb-3 text-sm font-semibold">History</div>
                            <ol className="grid gap-3 border-l pl-4">
                                {(a.history ?? []).slice().reverse().map((h, i) => (
                                    <li key={i} className="relative text-sm">
                                        <span className={cn('absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-[var(--color-surface,white)]', h.action === 'approved' ? 'bg-brand' : h.action === 'rejected' ? 'bg-zred' : 'bg-neutral-400')} />
                                        <div className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</div>
                                        <div className="text-muted-foreground text-xs">{new Date(h.at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })}{h.by ? ` · ${h.by}` : ''}</div>
                                        {h.message && <div className="text-muted-foreground mt-0.5 text-xs italic">“{h.message}”</div>}
                                    </li>
                                ))}
                            </ol>
                            {a.ip && <p className="text-muted-foreground mt-3 text-[11px]">Sent from {a.ip}</p>}
                        </Card>
                        {auth.user.role === 'super_admin' && !done && (
                            <Button variant="ghost" className="text-zred justify-start" onClick={async () => (await confirm({ title: `Delete ${a.reference}?`, description: 'The application and its documents are removed permanently. Use this for spam only.', tone: 'danger', confirmLabel: 'Delete' })) && router.delete(`/admin/applications/${a.id}`)}><Trash2 /> Delete (spam)</Button>
                        )}
                    </div>
                </div>

                {modal === 'approve' && <ApproveModal a={a} approve={approve} onClose={() => setModal(null)} />}
                {(modal === 'needs_info' || modal === 'rejected') && <MessageModal kind={modal} a={a} onClose={() => setModal(null)} onSend={(m) => setStatus(modal, m)} />}
                {preview && (
                    <Modal open onClose={() => setPreview(null)} size="lg" title={preview.label} description={preview.original_name}
                        footer={<><Button variant="outline" asChild><a href={`${preview.url}?download=1`}><Download /> Download</a></Button><Button onClick={() => setPreview(null)}>Close</Button></>}>
                        <img src={preview.url} alt={preview.label} className="max-h-[65vh] w-full rounded-lg object-contain" />
                    </Modal>
                )}
            </Page>
        </AdminLayout>
    );
}

function DetailsCard({ id, title, fields, details, editable }: { id: number; title: string; fields: AppField[]; details: Record<string, unknown>; editable: boolean }) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Record<string, unknown>>({});
    const shown = fields.filter((f) => isVisible(f, details as never));
    const editableField = (f: AppField) => !['chips', 'bool'].includes(f.type);
    const save = () => router.post(`/admin/applications/${id}/details`, { details: draft as Record<string, string> }, { preserveScroll: true, onSuccess: () => { setEditing(false); setDraft({}); } });

    return (
        <Card>
            <CardHeader title={title} action={editable && (editing ? <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Button><Button size="sm" disabled={!Object.keys(draft).length} onClick={save}>Save</Button></div> : <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil /> Edit</Button>)} />
            <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 sm:grid-cols-2">
                {shown.map((f) => {
                    const v = (draft[f.key] ?? details[f.key]) as never;
                    return (
                        <div key={f.key} className={cn('min-w-0', f.type === 'textarea' && 'sm:col-span-2')}>
                            <dt className="text-muted-foreground text-xs">{f.label}</dt>
                            {editing && editableField(f) ? (
                                f.options ? (
                                    <Select value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                                        <option value="">–</option>
                                        {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                                    </Select>
                                ) : f.type === 'textarea' ? (
                                    <Textarea value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} rows={3} />
                                ) : (
                                    <Input type={['date', 'time', 'number', 'email'].includes(f.type) ? f.type : 'text'} value={String(v ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
                                )
                            ) : (
                                <dd className={cn('text-sm font-medium break-words', !displayValue(f, v) && 'text-muted-foreground font-normal')}>{displayValue(f, v) || '–'}</dd>
                            )}
                        </div>
                    );
                })}
            </dl>
        </Card>
    );
}

function ApproveModal({ a, approve, onClose }: { a: Props['application']; approve: Props['approve']; onClose: () => void }) {
    const [commission, setCommission] = useState(String(approve.commission));
    const [live, setLive] = useState(false);
    const [zone, setZone] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const what = { restaurant: 'a store (with the logo, cover, hours and payout details) and a merchant login for the owner’s email', driver: 'an approved driver profile with these documents, ready to sign in to the Driver app with their number', corporate: 'a company account with budgets and the contact as account admin' }[a.type];

    const submit = () => {
        setBusy(true);
        router.post(`/admin/applications/${a.id}/approve`, { commission_pct: a.type === 'restaurant' ? Number(commission) : undefined, store_status: a.type === 'restaurant' ? (live ? 'active' : 'pending') : undefined, zone_id: zone || undefined, message: message || undefined }, {
            preserveScroll: true,
            onSuccess: onClose,
            onError: (e) => setError(Object.values(e)[0] ?? 'Could not approve.'),
            onFinish: () => setBusy(false),
        });
    };

    return (
        <Modal open onClose={onClose} title={`Approve ${a.title}?`} description={`This creates ${what}, and emails ${a.email ?? 'the applicant'}.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={submit}><Check /> Approve</Button></>}>
            <div className="grid gap-4">
                {a.type === 'restaurant' && (
                    <>
                        <Field label="Commission" hint="On delivery orders. You can change it later on the store."><Input type="number" step="0.5" suffix="%" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
                        <Switch checked={live} onChange={setLive} label="Make the store live straight away" description="Leave off to add the menu first (store starts as Pending)." />
                    </>
                )}
                {a.type !== 'corporate' && approve.zones.length > 0 && (
                    <Field label="Zone" optional><Select value={zone} onChange={(e) => setZone(e.target.value)}><option value="">Choose later</option>{approve.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</Select></Field>
                )}
                <Field label="Note for the record" optional><Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="e.g. Documents verified by phone." /></Field>
                {error && <p className="text-zred text-sm">{error}</p>}
            </div>
        </Modal>
    );
}

function MessageModal({ kind, a, onClose, onSend }: { kind: 'needs_info' | 'rejected'; a: Props['application']; onClose: () => void; onSend: (m: string) => void }) {
    const [m, setM] = useState('');
    const presets = kind === 'needs_info'
        ? ['A clearer photo of your ID (all four corners visible).', 'Your menu with prices.', 'Proof of your bank or EcoCash account.', 'A valid driver’s licence.']
        : ['We already have enough partners in your area right now.', 'We could not verify your documents.', 'Your vehicle does not meet our requirements.'];
    return (
        <Modal open onClose={onClose} title={kind === 'needs_info' ? 'Ask the applicant for more information' : `Reject ${a.title}?`} description={`${a.email ? `We email ${a.email}` : 'The applicant has no email; contact them by phone'} with this message.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={kind === 'rejected' ? 'destructive' : 'default'} disabled={!m.trim()} onClick={() => onSend(m.trim())}>{kind === 'needs_info' ? 'Send request' : 'Reject application'}</Button></>}>
            <div className="grid gap-3">
                <div className="flex flex-wrap gap-1.5">{presets.map((p) => <button key={p} type="button" onClick={() => setM(m ? `${m}\n${p}` : p)} className="hover:bg-muted rounded-full border px-2.5 py-1 text-xs">{p}</button>)}</div>
                <Textarea autoFocus value={m} onChange={(e) => setM(e.target.value)} rows={4} placeholder={kind === 'needs_info' ? 'What do you need from them?' : 'Reason (shown to the applicant)'} />
            </div>
        </Modal>
    );
}

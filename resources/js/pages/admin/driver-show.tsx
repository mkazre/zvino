import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, Field, Grid, KeyValue, Modal, Page, Select, StatCard, Stars, StatusPill, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Link, router } from '@inertiajs/react';
import { ArrowLeft, Check, ExternalLink, FileText, Phone, X } from 'lucide-react';
import { useState } from 'react';

interface Doc { id: number; type: string; status: string; note: string | null; expires_on: string | null; created_at: string }
interface Props {
    driver: {
        id: number; status: string; vehicle_type: string; vehicle_make: string | null; vehicle_plate: string | null; national_id: string | null; licence_number: string | null;
        is_online: boolean; rating: number; rating_count: number; completed_deliveries: number; acceptance_rate: number; zone_id: number | null; approved_at: string | null; created_at: string;
        balance_zig: number; cash_held_zig: number; location_updated_at: string | null; lat: number | null; lng: number | null;
        user: { id: number; name: string; phone: string; avatar_path?: string }; documents: Doc[];
    };
    requiredDocuments: string[];
    zones: { id: number; name: string }[];
    stats: { deliveries_30d: number; earned_30d: number; tips_30d: number; avg_delivery_minutes: number };
    recentOrders: { id: number; reference: string; status: string; total_zig: number; driver_pay_zig: number; tip_zig: number; created_at: string; vendor?: { name: string } }[];
    ledger: { id: number; type: string; amount_zig: number; description: string; created_at: string }[];
    reviews: { id: number; driver_rating: number; comment: string | null; created_at: string; user?: { name: string } }[];
}

export default function DriverShow({ driver: d, requiredDocuments, zones, stats, recentOrders, ledger, reviews }: Props) {
    const confirm = useConfirm();
    const [rejectDoc, setRejectDoc] = useState<Doc | null>(null);
    const [suspend, setSuspend] = useState(false);
    const docsByType = Object.fromEntries(d.documents.map((x) => [x.type, x]));
    const allTypes = Array.from(new Set([...requiredDocuments, ...d.documents.map((x) => x.type)]));
    const readyToApprove = requiredDocuments.every((t) => docsByType[t]?.status === 'approved');

    return (
        <AdminLayout title={d.user.name}>
            <Page>
                <Link href="/admin/drivers" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="size-4" /> Drivers</Link>
                <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={d.user.name} src={d.user.avatar_path} size={64} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-bold tracking-tight">{d.user.name}</h1>
                            <StatusPill status={d.status} />
                            {d.is_online && <StatusPill status="online" />}
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm">{label(d.vehicle_type)} {d.vehicle_make && `· ${d.vehicle_make}`} {d.vehicle_plate && `· ${d.vehicle_plate}`} · joined {timeAgo(d.created_at)}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild><a href={`tel:${d.user.phone}`}><Phone /> Call</a></Button>
                        {d.status !== 'approved' && (
                            <Button size="sm" disabled={!readyToApprove} title={readyToApprove ? '' : 'Approve the required documents first'} onClick={async () => (await confirm({ title: `Approve ${d.user.name}?`, description: 'They can go online and receive deliveries straight away.', confirmLabel: 'Approve driver' })) && router.patch(`/admin/drivers/${d.id}`, { status: 'approved' })}>
                                <Check /> Approve driver
                            </Button>
                        )}
                        {d.status === 'approved' && <Button size="sm" variant="outline" className="text-zred" onClick={() => setSuspend(true)}>Suspend</Button>}
                        {d.status === 'applied' && <Button size="sm" variant="outline" className="text-zred" onClick={() => router.patch(`/admin/drivers/${d.id}`, { status: 'rejected', reason: 'Application not approved' })}>Reject</Button>}
                    </div>
                </div>

                <Grid cols={4}>
                    <StatCard label="Deliveries (30d)" value={stats.deliveries_30d} hint={`${d.completed_deliveries} all time`} />
                    <StatCard label="Earned (30d)" value={zig(stats.earned_30d)} hint={`incl. ${zig(stats.tips_30d)} tips`} />
                    <StatCard label="Rating" value={d.rating_count ? d.rating.toFixed(2) : '–'} hint={`${d.rating_count} ratings · ${Math.round(d.acceptance_rate)}% acceptance`} />
                    <StatCard label="Cash held" value={zig(d.cash_held_zig)} hint={`Balance owed to driver ${zig(d.balance_zig + d.cash_held_zig)}`} />
                </Grid>

                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Documents" description={readyToApprove ? 'All required documents approved.' : 'Check each document against the details below.'} />
                            <ul className="divide-y border-t">
                                {allTypes.map((t) => {
                                    const doc = docsByType[t];
                                    return (
                                        <li key={t} className="flex flex-wrap items-center gap-3 px-5 py-3">
                                            <FileText className="text-muted-foreground size-5" />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium">{label(t)} {requiredDocuments.includes(t) && <span className="text-muted-foreground text-xs font-normal">· required</span>}</div>
                                                <div className="text-muted-foreground text-xs">{doc ? `Uploaded ${timeAgo(doc.created_at)}${doc.expires_on ? ` · expires ${doc.expires_on}` : ''}${doc.note ? ` · “${doc.note}”` : ''}` : 'Not uploaded yet'}</div>
                                            </div>
                                            {doc ? (
                                                <>
                                                    <StatusPill status={doc.status} />
                                                    <Button size="sm" variant="ghost" asChild><a href={`/admin/drivers/documents/${doc.id}/file`} target="_blank" rel="noreferrer"><ExternalLink /> View</a></Button>
                                                    {doc.status !== 'approved' && <Button size="icon-sm" variant="outline" aria-label="Approve" onClick={() => router.patch(`/admin/drivers/documents/${doc.id}`, { status: 'approved' }, { preserveScroll: true })}><Check /></Button>}
                                                    {doc.status !== 'rejected' && <Button size="icon-sm" variant="outline" aria-label="Reject" className="text-zred" onClick={() => setRejectDoc(doc)}><X /></Button>}
                                                </>
                                            ) : <Badge>Missing</Badge>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </Card>

                        <Card>
                            <CardHeader title="Recent deliveries" />
                            <ul className="divide-y border-t">
                                {recentOrders.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No deliveries yet.</li>}
                                {recentOrders.map((o) => (
                                    <li key={o.id}>
                                        <Link href={`/admin/orders/${o.id}`} className="hover:bg-subtle flex items-center gap-3 px-5 py-2.5 text-sm">
                                            <span className="w-24 font-mono text-[13px] font-semibold">{o.reference}</span>
                                            <span className="text-muted-foreground flex-1 truncate">{o.vendor?.name} · {timeAgo(o.created_at)}</span>
                                            <span className="tabular">{zig(o.driver_pay_zig + o.tip_zig)}</span>
                                            <StatusPill status={o.status} />
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </Card>

                        <Card>
                            <CardHeader title="Earnings ledger" description="Positive = Zvino owes the driver. Cash collected on delivery shows as negative until remitted." />
                            <ul className="divide-y border-t text-sm">
                                {ledger.map((l) => (
                                    <li key={l.id} className="flex items-center gap-3 px-5 py-2">
                                        <span className="text-muted-foreground w-24 text-xs">{new Date(l.created_at).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short' })}</span>
                                        <span className="flex-1 truncate">{l.description}</span>
                                        <span className={cn('tabular font-medium', l.amount_zig < 0 && 'text-zred')}>{l.amount_zig < 0 ? '−' : '+'}{zig(Math.abs(l.amount_zig))}</span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>

                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Details" />
                            <CardBody>
                                <KeyValue items={[
                                    ['Phone', d.user.phone],
                                    ['National ID', d.national_id ?? '–'],
                                    ['Licence', d.licence_number ?? '–'],
                                    ['Approved', d.approved_at ? new Date(d.approved_at).toLocaleDateString('en-ZW') : '–'],
                                    ['Last GPS', d.location_updated_at ? timeAgo(d.location_updated_at) : '–'],
                                    ['Avg. delivery', stats.avg_delivery_minutes ? `${stats.avg_delivery_minutes} min` : '–'],
                                ]} />
                                <Field label="Zone" className="mt-4">
                                    <Select value={d.zone_id ?? ''} onChange={(e) => router.patch(`/admin/drivers/${d.id}`, { zone_id: e.target.value || null }, { preserveScroll: true })}>
                                        <option value="">Any zone</option>
                                        {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                                    </Select>
                                </Field>
                                {d.lat && <a href={`https://maps.google.com/?q=${d.lat},${d.lng}`} target="_blank" rel="noreferrer" className="text-primary mt-3 inline-block text-xs font-medium">Last known location →</a>}
                            </CardBody>
                        </Card>
                        <Card>
                            <CardHeader title="Customer feedback" />
                            <ul className="divide-y border-t">
                                {reviews.length === 0 && <li className="text-muted-foreground px-5 py-6 text-center text-sm">No ratings yet.</li>}
                                {reviews.map((r) => (
                                    <li key={r.id} className="px-5 py-3 text-sm">
                                        <div className="flex items-center justify-between"><span className="font-medium">{r.user?.name}</span><Stars value={r.driver_rating} /></div>
                                        {r.comment && <p className="text-muted-foreground mt-1">“{r.comment}”</p>}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    </div>
                </div>
            </Page>
            <ReasonModal open={!!rejectDoc} title={`Reject ${label(rejectDoc?.type ?? '')}?`} placeholder="e.g. Photo is blurry, please re-upload" onClose={() => setRejectDoc(null)} onSubmit={(note) => rejectDoc && router.patch(`/admin/drivers/documents/${rejectDoc.id}`, { status: 'rejected', note }, { preserveScroll: true, onSuccess: () => setRejectDoc(null) })} />
            <ReasonModal open={suspend} title={`Suspend ${d.user.name}?`} placeholder="Reason (sent to the driver)" onClose={() => setSuspend(false)} onSubmit={(reason) => router.patch(`/admin/drivers/${d.id}`, { status: 'suspended', reason }, { onSuccess: () => setSuspend(false) })} danger />
        </AdminLayout>
    );
}

function ReasonModal({ open, title, placeholder, onClose, onSubmit, danger }: { open: boolean; title: string; placeholder: string; onClose: () => void; onSubmit: (r: string) => void; danger?: boolean }) {
    const [reason, setReason] = useState('');
    return (
        <Modal open={open} onClose={onClose} size="sm" title={title} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={danger ? 'destructive' : 'default'} disabled={!reason} onClick={() => onSubmit(reason)}>Confirm</Button></>}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} />
        </Modal>
    );
}

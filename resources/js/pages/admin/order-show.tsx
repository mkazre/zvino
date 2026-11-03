import { Button } from '@/components/ui/button';
import { Avatar, Badge, Card, CardBody, CardHeader, Field, Input, KeyValue, Modal, Money, Page, Select, Stars, StatusPill, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, timeAgo, usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Order, type SharedData } from '@/types';
import { Link, router, usePage } from '@inertiajs/react';
import { ArrowLeft, Bike, Check, MapPin, MessageSquare, Phone, RotateCcw, StickyNote, X } from 'lucide-react';
import { useState } from 'react';

type Detail = Order & {
    address: { line1: string; landmark?: string; suburb?: string; city: string; instructions?: string; lat?: number; lng?: number } | null;
    driver: { id: number; name: string; phone: string; vehicle: string; plate?: string } | null;
    payments: { id: number; method: string; status: string; amount_zig: number; provider_reference?: string; created_at: string }[];
    refunds: { id: number; amount_zig: number; status: string; reason: string; destination: string; created_at: string }[];
    review: { vendor_rating: number; driver_rating?: number; comment?: string } | null;
    messages: { id: number; sender_role: string; body: string; created_at: string; sender?: { name: string } }[];
    offers: { driver: string; status: string; pay_zig: number; created_at: string }[];
    status_history: { status?: string; flag?: string; at: string }[];
    delivery_pin?: string;
    proof_photo?: string;
    scheduled_for?: string;
    estimated_delivery_at?: string;
    distance_km?: number;
    tip_zig: number;
    refunded_zig: number;
    commission_zig: number;
    driver_pay_zig: number;
    cancel_reason?: string;
    cancelled_by?: string;
    dropoff: string;
    zig_per_usd: number;
    notes?: string | null;
};

interface Props {
    order: Detail;
    next: string[];
    nearbyDrivers: { id: number; name: string; km: number | null; active: number }[];
    audit: { id: number; action: string; changes: Record<string, unknown> | null; created_at: string; user?: { name: string } }[];
}

const STEPS = ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered'];

export default function OrderShow({ order: o, next, nearbyDrivers, audit }: Props) {
    const { can } = usePage<SharedData>().props;
    const confirm = useConfirm();
    const [refundOpen, setRefundOpen] = useState(false);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [note, setNote] = useState('');
    const manage = can.includes('orders.manage');
    const reached = new Set(o.status_history.filter((h) => h.status).map((h) => h.status));
    const ended = ['cancelled', 'rejected'].includes(o.status);
    const stepAt = (s: string) => o.status_history.find((h) => h.status === s)?.at;
    const steps = o.fulfilment === 'delivery' ? STEPS : STEPS.filter((s) => s !== 'picked_up');

    return (
        <AdminLayout title={o.reference}>
            <Page wide>
                <div>
                    <Link href="/admin/orders" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
                        <ArrowLeft className="size-4" /> Orders
                    </Link>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="font-mono text-[26px] font-bold tracking-tight">{o.reference}</h1>
                            <StatusPill status={o.status} />
                            <StatusPill status={o.payment_status} />
                            {o.scheduled_for && <Badge tone="info">Scheduled {new Date(o.scheduled_for).toLocaleString('en-ZW', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</Badge>}
                        </div>
                        {manage && (
                            <div className="flex flex-wrap gap-2">
                                {next.filter((s) => s !== 'cancelled').map((s) => (
                                    <Button key={s} size="sm" variant={s === next[0] ? 'dark' : 'outline'} onClick={() => router.patch(`/admin/orders/${o.id}/status`, { status: s }, { preserveScroll: true })}>
                                        <Check /> Mark {s === 'picked_up' ? 'picked up' : label(s).toLowerCase()}
                                    </Button>
                                ))}
                                {can.includes('refunds.approve') && o.payment_status !== 'unpaid' && o.refunded_zig < o.totals.total.zig && (
                                    <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>
                                        <RotateCcw /> Refund
                                    </Button>
                                )}
                                {next.includes('cancelled') && (
                                    <Button size="sm" variant="outline" className="text-zred" onClick={() => setCancelOpen(true)}>
                                        <X /> Cancel
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                    <p className="text-muted-foreground mt-1.5 text-sm">
                        Placed {new Date(o.created_at).toLocaleString('en-ZW', { dateStyle: 'medium', timeStyle: 'short' })} · {label(o.source)} · {label(o.fulfilment)}
                        {o.estimated_delivery_at && !ended && o.status !== 'delivered' && <> · ETA {new Date(o.estimated_delivery_at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</>}
                    </p>
                </div>

                {/* Progress */}
                <Card padded>
                    {ended ? (
                        <div className="text-zred flex items-center gap-3 text-sm font-medium">
                            <X className="size-5" />
                            {label(o.status)} by {o.cancelled_by ?? 'system'}: {o.cancel_reason}
                        </div>
                    ) : (
                        <ol className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
                            {steps.map((s, i) => {
                                const done = reached.has(s) || (s === 'picked_up' && reached.has('arriving'));
                                return (
                                    <li key={s} className="relative flex flex-col items-center text-center">
                                        {i > 0 && <span className={cn('absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2', done ? 'bg-brand' : 'bg-border')} />}
                                        <span className={cn('relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold', done ? 'bg-brand border-brand text-white' : 'bg-surface border-border text-muted-foreground')}>
                                            {done ? <Check className="size-3.5" /> : i + 1}
                                        </span>
                                        <span className="mt-2 text-xs font-medium">{s === 'picked_up' ? 'On the way' : label(s)}</span>
                                        <span className="text-muted-foreground tabular text-[11px]">{stepAt(s) ? new Date(stepAt(s)!).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Items" description={o.vendor?.name} />
                            <ul className="divide-y border-t">
                                {o.items?.map((i, idx) => (
                                    <li key={idx} className="flex gap-4 px-5 py-3 text-sm">
                                        <span className="bg-muted tabular flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold">{i.quantity}×</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium">{i.name}</div>
                                            {(i.options?.variant || i.options?.modifiers?.length) && <div className="text-muted-foreground text-xs">{[i.options?.variant, ...(i.options?.modifiers ?? [])].filter(Boolean).join(' · ')}</div>}
                                            {i.notes && <div className="text-gold mt-0.5 text-xs">“{i.notes}”</div>}
                                        </div>
                                        <span className="tabular font-medium">{zig(i.line_total.zig)}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="bg-subtle rounded-b-xl border-t px-5 py-4">
                                <KeyValue
                                    items={[
                                        ['Subtotal', zig(o.totals.subtotal.zig)],
                                        ...(o.totals.delivery.zig ? [['Delivery' + (o.distance_km ? ` (${o.distance_km} km)` : ''), zig(o.totals.delivery.zig)] as [string, string]] : []),
                                        ['Service fee', zig(o.totals.service.zig)],
                                        ...(o.totals.discount.zig ? [['Discount', `−${zig(o.totals.discount.zig)}`] as [string, string]] : []),
                                        ...(o.tip_zig ? [['Tip', zig(o.tip_zig)] as [string, string]] : []),
                                        ['VAT (included)', zig(o.totals.vat.zig)],
                                        [<b key="t" className="text-foreground">Total</b>, <span key="v" className="text-base"><Money zig={o.totals.total.zig} usd={o.totals.total.usd} /></span>],
                                        ...(o.refunded_zig ? [['Refunded', <span key="r" className="text-zred">−{zig(o.refunded_zig)}</span>] as [string, React.ReactNode]] : []),
                                    ]}
                                />
                                <p className="text-muted-foreground mt-2 text-right text-[11px]">Rate at order time: 1 USD = {o.zig_per_usd} ZiG</p>
                            </div>
                        </Card>

                        {o.notes && (
                            <Card padded className="border-gold/30 bg-gold-50/40 dark:bg-gold/5">
                                <div className="flex gap-3 text-sm"><StickyNote className="text-gold size-4 shrink-0" /><span><b>Customer note:</b> {o.notes}</span></div>
                            </Card>
                        )}

                        {o.messages.length > 0 && (
                            <Card>
                                <CardHeader title={<span className="flex items-center gap-2"><MessageSquare className="size-4" /> Order chat</span>} />
                                <div className="grid gap-2 border-t px-5 py-4">
                                    {o.messages.map((m) => (
                                        <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.sender_role === 'customer' ? 'bg-muted self-start' : 'bg-foreground text-background self-end')}>
                                            <div className="mb-0.5 text-[11px] opacity-60">{label(m.sender_role)} · {timeAgo(m.created_at)}</div>
                                            {m.body}
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Activity" />
                            <ol className="border-t px-5 py-4">
                                {[...o.status_history.map((h) => ({ at: h.at, text: h.status ? `Status → ${label(h.status)}` : `⚠ ${label(h.flag ?? '')}`, who: '' })), ...audit.map((a) => ({ at: a.created_at, text: a.action === 'order.note' ? `Note: ${(a.changes as { note: string })?.note}` : label(a.action.replace('order.', '')), who: a.user?.name ?? '' })), ...o.offers.map((f) => ({ at: f.created_at, text: `Offered to ${f.driver} (${f.status})`, who: '' }))]
                                    .sort((a, b) => b.at.localeCompare(a.at))
                                    .map((e, i) => (
                                        <li key={i} className="relative flex gap-3 pb-4 text-sm last:pb-0">
                                            <span className="bg-border mt-1.5 size-2 shrink-0 rounded-full" />
                                            <span className="flex-1">{e.text}{e.who && <span className="text-muted-foreground"> · {e.who}</span>}</span>
                                            <span className="text-muted-foreground tabular shrink-0 text-xs">{new Date(e.at).toLocaleTimeString('en-ZW', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </li>
                                    ))}
                            </ol>
                            {manage && (
                                <form className="flex gap-2 border-t px-5 py-3" onSubmit={(e) => { e.preventDefault(); router.post(`/admin/orders/${o.id}/note`, { note }, { preserveScroll: true, onSuccess: () => setNote('') }); }}>
                                    <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note…" className="h-9" />
                                    <Button size="sm" variant="outline" disabled={!note}>Add</Button>
                                </form>
                            )}
                        </Card>
                    </div>

                    <div className="grid content-start gap-4">
                        <Card>
                            <CardHeader title="Customer" />
                            <CardBody className="grid gap-3">
                                <div className="flex items-center gap-3">
                                    <Avatar name={o.customer?.name ?? 'Walk-in'} size={40} />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold">{o.customer?.name || 'Walk-in customer'}</div>
                                        {o.customer?.phone && <a href={`tel:${o.customer.phone}`} className="text-muted-foreground text-sm">{o.customer.phone}</a>}
                                    </div>
                                    {o.customer && <Button size="sm" variant="ghost" asChild><Link href={`/admin/users/${o.customer.id}`}>View</Link></Button>}
                                </div>
                                {o.address && (
                                    <div className="bg-subtle rounded-lg p-3 text-sm">
                                        <div className="flex gap-2"><MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                                            <div>
                                                <div className="font-medium">{o.address.line1}</div>
                                                {o.address.landmark && <div className="text-muted-foreground">{o.address.landmark}</div>}
                                                <div className="text-muted-foreground">{[o.address.suburb, o.address.city].filter(Boolean).join(', ')}</div>
                                                {o.address.instructions && <div className="mt-1 text-xs">“{o.address.instructions}”</div>}
                                            </div>
                                        </div>
                                        {o.address.lat && <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${o.address.lat},${o.address.lng}`} className="text-primary mt-2 inline-block text-xs font-medium">Open in Google Maps →</a>}
                                    </div>
                                )}
                                <div className="text-muted-foreground text-xs">Drop-off: {label(o.dropoff)}{o.delivery_pin && <> · PIN <b className="text-foreground font-mono">{o.delivery_pin}</b></>}</div>
                            </CardBody>
                        </Card>

                        {o.fulfilment === 'delivery' && (
                            <Card>
                                <CardHeader title={<span className="flex items-center gap-2"><Bike className="size-4" /> Driver</span>} />
                                <CardBody>
                                    {o.driver ? (
                                        <div className="flex items-center gap-3">
                                            <Avatar name={o.driver.name} size={40} />
                                            <div className="min-w-0 flex-1">
                                                <Link href={`/admin/drivers/${o.driver.id}`} className="font-semibold hover:underline">{o.driver.name}</Link>
                                                <div className="text-muted-foreground text-sm">{label(o.driver.vehicle)} {o.driver.plate && `· ${o.driver.plate}`}</div>
                                            </div>
                                            <Button size="icon-sm" variant="outline" asChild><a href={`tel:${o.driver.phone}`} aria-label="Call driver"><Phone /></a></Button>
                                        </div>
                                    ) : ended || o.status === 'delivered' ? (
                                        <p className="text-muted-foreground text-sm">No driver.</p>
                                    ) : (
                                        <div className="grid gap-2">
                                            <p className="text-muted-foreground text-sm">{o.offers.length ? `${o.offers.length} offer(s) sent, none accepted yet.` : 'Not yet dispatched.'}</p>
                                            {can.includes('dispatch.manage') && nearbyDrivers.map((d) => (
                                                <button key={d.id} onClick={async () => (await confirm({ title: `Assign ${d.name}?`, description: 'The driver is assigned immediately and notified.', confirmLabel: 'Assign' })) && router.post(`/admin/dispatch/${o.id}/assign`, { driver_id: d.id }, { preserveScroll: true })}
                                                    className="hover:bg-muted flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm">
                                                    <Avatar name={d.name} size={28} />
                                                    <span className="flex-1 font-medium">{d.name}</span>
                                                    <span className="text-muted-foreground text-xs">{d.km !== null ? `${d.km} km` : ''}{d.active ? ` · ${d.active} active` : ''}</span>
                                                </button>
                                            ))}
                                            {can.includes('dispatch.manage') && nearbyDrivers.length === 0 && <p className="text-muted-foreground text-xs">No drivers online nearby.</p>}
                                        </div>
                                    )}
                                    {o.proof_photo && <img src={o.proof_photo} alt="Proof of delivery" className="mt-3 aspect-video w-full rounded-lg object-cover" />}
                                </CardBody>
                            </Card>
                        )}

                        <Card>
                            <CardHeader title="Payment" />
                            <CardBody>
                                <KeyValue items={[
                                    ['Method', label(o.payment_method)],
                                    ['Status', <StatusPill key="s" status={o.payment_status} />],
                                    ...o.payments.filter((p) => p.provider_reference).map((p) => ['Reference', <span key={p.id} className="font-mono text-xs">{p.provider_reference}</span>] as [string, React.ReactNode]),
                                    ['Zvino commission', zig(o.commission_zig)],
                                    ...(o.fulfilment === 'delivery' ? [['Driver pay', zig(o.driver_pay_zig + o.tip_zig)] as [string, string]] : []),
                                ]} />
                                {o.refunds.length > 0 && (
                                    <div className="mt-3 grid gap-1.5 border-t pt-3">
                                        {o.refunds.map((r) => (
                                            <div key={r.id} className="flex items-center justify-between text-sm">
                                                <span className="text-muted-foreground">{label(r.reason)} → {r.destination}</span>
                                                <span className="flex items-center gap-2"><span className="tabular">{zig(r.amount_zig)}</span><StatusPill status={r.status} /></span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardBody>
                        </Card>

                        {o.review && (
                            <Card padded>
                                <div className="mb-1 flex items-center justify-between"><span className="text-sm font-semibold">Review</span><Stars value={o.review.vendor_rating} /></div>
                                {o.review.comment && <p className="text-muted-foreground text-sm">“{o.review.comment}”</p>}
                            </Card>
                        )}
                    </div>
                </div>
            </Page>

            <RefundModal open={refundOpen} onClose={() => setRefundOpen(false)} order={o} />
            <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} order={o} />
        </AdminLayout>
    );
}

function RefundModal({ open, onClose, order }: { open: boolean; onClose: () => void; order: Detail }) {
    const max = order.totals.total.zig - order.refunded_zig;
    const [amount, setAmount] = useState(String(max.toFixed(2)));
    const [reason, setReason] = useState('');
    const [destination, setDestination] = useState('wallet');

    return (
        <Modal open={open} onClose={onClose} title="Issue a refund" description={`Up to ${zig(max)} can be refunded on ${order.reference}.`}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!reason || !Number(amount)} onClick={() => router.post(`/admin/orders/${order.id}/refund`, { amount_zig: amount, reason, destination }, { onSuccess: onClose, preserveScroll: true })}>Refund {zig(Number(amount) || 0)}</Button></>}>
            <div className="grid gap-4">
                <Field label="Amount" hint={`≈ ${usd((Number(amount) || 0) / order.zig_per_usd)}`}>
                    <Input type="number" step="0.01" max={max} value={amount} onChange={(e) => setAmount(e.target.value)} prefix="ZiG" />
                </Field>
                <div className="flex gap-2">
                    {[0.25, 0.5, 1].map((f) => <Button key={f} size="sm" variant="outline" onClick={() => setAmount((max * f).toFixed(2))}>{f === 1 ? 'Full' : `${f * 100}%`}</Button>)}
                </div>
                <Field label="Refund to">
                    <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
                        <option value="wallet">Zvino wallet (instant)</option>
                        <option value="original">Original payment method (EcoCash / card reversal)</option>
                    </Select>
                </Field>
                <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Missing drink, customer called support" /></Field>
            </div>
        </Modal>
    );
}

function CancelModal({ open, onClose, order }: { open: boolean; onClose: () => void; order: Detail }) {
    const [reason, setReason] = useState('');
    const presets = ['Customer requested', 'Store closed / can’t fulfil', 'No driver available', 'Suspected fraud', 'Duplicate order'];

    return (
        <Modal open={open} onClose={onClose} size="sm" title={`Cancel ${order.reference}?`} description="Paid amounts are refunded to the customer’s Zvino wallet straight away."
            footer={<><Button variant="outline" onClick={onClose}>Keep order</Button><Button variant="destructive" disabled={!reason} onClick={() => router.post(`/admin/orders/${order.id}/cancel`, { reason }, { onSuccess: onClose })}>Cancel & refund</Button></>}>
            <div className="grid gap-2">
                {presets.map((p) => (
                    <button key={p} onClick={() => setReason(p)} className={cn('rounded-lg border px-3 py-2 text-left text-sm', reason === p ? 'border-foreground bg-muted font-medium' : 'hover:bg-muted')}>{p}</button>
                ))}
                <Input placeholder="Other reason…" value={presets.includes(reason) ? '' : reason} onChange={(e) => setReason(e.target.value)} />
            </div>
        </Modal>
    );
}

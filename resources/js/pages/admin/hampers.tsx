import { Button } from '@/components/ui/button';
import { Badge, Card, Drawer, Field, Input, Page, PageHeader, Select, Switch, Textarea } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { type Money } from '@/types';
import { useForm } from '@inertiajs/react';
import { Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Hamper { id: number; name: string; description: string | null; image_path: string | null; vendor_id: number; vendor: { name: string } | null; price: Money; is_active: boolean; lines: { item_id: number; quantity: number }[]; contents: { name: string; quantity: number }[] }
interface Props { hampers: Hamper[]; vendors: { id: number; name: string }[]; items: { id: number; vendor_id: number; name: string; price_zig: number }[]; subscribers: number }

/** Diaspora hampers: curated grocery baskets families abroad send home once or monthly. */
export default function Hampers(p: Props) {
    const [editing, setEditing] = useState<Hamper | 'new' | null>(null);
    return (
        <AdminLayout title="Hampers">
            <Page>
                <PageHeader title="Diaspora hampers" description={`Grocery baskets people abroad send to family. ${p.subscribers} active monthly subscriptions.`} actions={<Button onClick={() => setEditing('new')}><Plus /> New hamper</Button>} />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {p.hampers.length === 0 && <Card padded className="text-muted-foreground text-center text-sm"><Package className="mx-auto mb-2 size-6" />No hampers yet. Build one from a grocery store’s menu.</Card>}
                    {p.hampers.map((h) => (
                        <Card key={h.id} padded>
                            <div className="flex items-start justify-between gap-2">
                                <div><h3 className="font-semibold">{h.name} {!h.is_active && <Badge>Hidden</Badge>}</h3><p className="text-muted-foreground text-xs">{h.vendor?.name}</p></div>
                                <Button size="icon-sm" variant="ghost" onClick={() => setEditing(h)} aria-label="Edit"><Pencil /></Button>
                            </div>
                            <div className="tabular mt-2 text-xl font-bold">{zig(h.price.zig)} <span className="text-muted-foreground text-sm font-normal">≈ ${h.price.usd.toFixed(2)}</span></div>
                            <p className="text-muted-foreground mt-2 text-xs">{h.contents.map((c) => `${c.quantity}× ${c.name}`).join(' · ')}</p>
                        </Card>
                    ))}
                </div>
            </Page>
            {editing && <HamperDrawer h={editing === 'new' ? null : editing} p={p} onClose={() => setEditing(null)} />}
        </AdminLayout>
    );
}

function HamperDrawer({ h, p, onClose }: { h: Hamper | null; p: Props; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        vendor_id: h?.vendor_id ?? p.vendors[0]?.id ?? 0,
        name: h?.name ?? '', description: h?.description ?? '', is_active: h?.is_active ?? true,
        lines: h?.lines ?? ([] as { item_id: number; quantity: number }[]),
        image: null as File | null,
    });
    const items = p.items.filter((i) => i.vendor_id === Number(data.vendor_id));
    const total = data.lines.reduce((s, l) => s + (items.find((i) => i.id === l.item_id)?.price_zig ?? 0) * l.quantity, 0);
    const err = (k: string) => (errors as Record<string, string>)[k];
    return (
        <Drawer open onClose={onClose} width="lg" title={h ? `Edit ${h.name}` : 'New hamper'}
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing || !data.lines.length || !data.name} onClick={() => post(h ? `/admin/hampers/${h.id}` : '/admin/hampers', { forceFormData: true, onSuccess: onClose })}>Save</Button></>}>
            <div className="grid gap-4">
                <Field label="Grocery store"><Select value={data.vendor_id} onChange={(e) => setData({ ...data, vendor_id: Number(e.target.value), lines: [] })}>{p.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
                <Field label="Name" error={err('name')}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="Family monthly basics" /></Field>
                <Field label="Description" optional><Textarea value={data.description} onChange={(e) => setData('description', e.target.value)} placeholder="Mealie-meal, cooking oil, sugar, rice, kapenta… enough for a family of 4 for a month." /></Field>
                <Field label="Photo" optional><Input type="file" accept="image/*" onChange={(e) => setData('image', e.target.files?.[0] ?? null)} /></Field>
                <div className="grid gap-2">
                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Contents</span><span className="tabular text-sm">{zig(total)}</span></div>
                    {data.lines.map((l, i) => (
                        <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2">
                            <Select value={l.item_id} onChange={(e) => setData('lines', data.lines.map((x, j) => (j === i ? { ...x, item_id: Number(e.target.value) } : x)))}>{items.map((it) => <option key={it.id} value={it.id}>{it.name} · {zig(it.price_zig)}</option>)}</Select>
                            <Input type="number" min={1} value={l.quantity} onChange={(e) => setData('lines', data.lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} />
                            <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setData('lines', data.lines.filter((_, j) => j !== i))}><Trash2 /></Button>
                        </div>
                    ))}
                    {err('lines') && <p className="text-zred text-xs">{err('lines')}</p>}
                    <Button variant="outline" size="sm" disabled={!items.length} onClick={() => setData('lines', [...data.lines, { item_id: items[0].id, quantity: 1 }])}><Plus /> Add item</Button>
                </div>
                <Switch checked={data.is_active} onChange={(v) => setData('is_active', v)} label="Show to customers" />
            </div>
        </Drawer>
    );
}

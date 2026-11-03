import { Button } from '@/components/ui/button';
import { Badge, Card, Checkbox, Drawer, EmptyState, Field, Input, Money, Page, PageHeader, SearchInput, Segmented, Select, Switch, Textarea, Thumb, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Item, type SharedData } from '@/types';
import { router, useForm, usePage } from '@inertiajs/react';
import { Layers, Pencil, Plus, Trash2, UtensilsCrossed, Zap, ZapOff } from 'lucide-react';
import { useState } from 'react';

type MenuItem = Item & { needs_power: boolean; is_popular: boolean; dietary: string[]; calories: number | null; unavailable_until: string | null; modifier_groups?: { id: number; name: string; min: number; max: number }[] };
interface Group { id: number; name: string; min_select: number; max_select: number; items_count: number; options: { id: number; name: string; price_delta_zig: number; is_available: boolean }[] }
interface Props {
    vendor: { id: number; name: string; power_out: boolean } | null;
    vendors: { id: number; name: string }[];
    categories: { id: number; name: string; items_count: number }[];
    items: { data: MenuItem[] };
    groups: Group[];
    filters: { category?: string; q?: string; stock?: string };
}

const DIETARY = ['vegetarian', 'vegan', 'halal', 'no_pork', 'spicy', 'nut_free', 'gluten_free'];

export default function Catalog(p: Props) {
    const { auth, platformMode } = usePage<SharedData>().props;
    const confirm = useConfirm();
    const [q, setQ] = useState(p.filters.q ?? '');
    const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
    const [groupEditing, setGroupEditing] = useState<Group | 'new' | null>(null);
    const [view, setView] = useState<'items' | 'addons'>('items');
    const go = (x: Record<string, string | undefined>) => router.get('/admin/catalog', { vendor_id: p.vendor?.id, ...p.filters, ...x }, { preserveState: true, replace: true });
    const byCat = p.categories.map((c) => ({ ...c, items: p.items.data.filter((i) => i.category_id === c.id) })).filter((c) => !p.filters.category || String(c.id) === p.filters.category);
    const uncategorised = p.items.data.filter((i) => !i.category_id);

    if (!p.vendor) return <AdminLayout title="Menu"><Page><EmptyState icon={UtensilsCrossed} title="No store selected" description="Add a store first." /></Page></AdminLayout>;

    return (
        <AdminLayout title="Menu">
            <Page wide>
                <PageHeader
                    title="Menu"
                    description={<>{p.vendor.name} · {p.items.data.length} items{p.vendor.power_out && <Badge tone="danger" className="ml-2">Load-shedding mode: power items hidden</Badge>}</>}
                    actions={
                        <>
                            {!auth.user.vendor_id && platformMode === 'marketplace' && p.vendors.length > 1 && (
                                <Select className="h-9 w-56" value={p.vendor.id} onChange={(e) => router.get('/admin/catalog', { vendor_id: e.target.value })}>{p.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
                            )}
                            <Segmented value={view} onChange={setView} options={[{ value: 'items', label: 'Items' }, { value: 'addons', label: 'Add-on groups', count: p.groups.length }]} />
                            <Button onClick={() => (view === 'items' ? setEditing('new') : setGroupEditing('new'))}><Plus /> {view === 'items' ? 'Add item' : 'Add group'}</Button>
                        </>
                    }
                />

                {view === 'addons' ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {p.groups.length === 0 && <Card className="md:col-span-2 xl:col-span-3"><EmptyState icon={Layers} title="No add-on groups" description="Create groups like “Choose a side” (required, pick 1) or “Extras” (optional, up to 3) and attach them to items." /></Card>}
                        {p.groups.map((g) => (
                            <Card key={g.id} padded>
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="font-semibold">{g.name}</div>
                                        <div className="text-muted-foreground text-xs">{g.min_select > 0 ? `Required · pick ${g.min_select === g.max_select ? g.min_select : `${g.min_select}–${g.max_select}`}` : `Optional · up to ${g.max_select}`} · used on {g.items_count} items</div>
                                    </div>
                                    <Button size="icon-sm" variant="ghost" onClick={() => setGroupEditing(g)} aria-label="Edit"><Pencil /></Button>
                                </div>
                                <ul className="mt-3 grid gap-1 text-sm">
                                    {g.options.map((o) => <li key={o.id} className={cn('flex justify-between', !o.is_available && 'text-muted-foreground line-through')}><span>{o.name}</span><span className="tabular">{o.price_delta_zig ? `+${zig(o.price_delta_zig)}` : 'Free'}</span></li>)}
                                </ul>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                        <nav className="lg:sticky lg:top-24 lg:self-start">
                            <SearchInput value={q} onChange={setQ} onSubmit={() => go({ q })} placeholder="Search menu" className="mb-3" />
                            <ul className="grid gap-px">
                                <li><button onClick={() => go({ category: undefined })} className={cn('flex w-full justify-between rounded-lg px-3 py-2 text-sm', !p.filters.category ? 'bg-surface font-semibold shadow-(--shadow-card)' : 'text-muted-foreground hover:text-foreground')}>All items <span className="tabular">{p.items.data.length}</span></button></li>
                                {p.categories.map((c) => (
                                    <li key={c.id} className="group flex items-center">
                                        <button onClick={() => go({ category: String(c.id) })} className={cn('flex flex-1 justify-between rounded-lg px-3 py-2 text-sm', p.filters.category === String(c.id) ? 'bg-surface font-semibold shadow-(--shadow-card)' : 'text-muted-foreground hover:text-foreground')}>{c.name} <span className="tabular">{c.items_count}</span></button>
                                        <button className="text-muted-foreground hover:text-foreground hidden p-1 group-hover:block" aria-label="Rename" onClick={() => { const name = prompt('Rename category', c.name); if (name) router.patch(`/admin/catalog/categories/${c.id}`, { name }, { preserveScroll: true }); }}><Pencil className="size-3" /></button>
                                        {c.items_count === 0 && <button className="text-zred hidden p-1 group-hover:block" aria-label="Delete" onClick={() => router.delete(`/admin/catalog/categories/${c.id}`, { preserveScroll: true })}><Trash2 className="size-3" /></button>}
                                    </li>
                                ))}
                            </ul>
                            <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => { const name = prompt('New category name'); if (name) router.post('/admin/catalog/categories', { vendor_id: p.vendor!.id, name }, { preserveScroll: true }); }}><Plus /> New category</Button>
                            <div className="mt-4 border-t pt-4"><Segmented size="sm" className="w-full" value={p.filters.stock ?? 'all'} onChange={(s) => go({ stock: s === 'all' ? undefined : s })} options={[{ value: 'all', label: 'All' }, { value: 'off', label: 'Sold out' }]} /></div>
                        </nav>

                        <div className="grid content-start gap-6">
                            {[...byCat, ...(uncategorised.length && !p.filters.category ? [{ id: 0, name: 'Uncategorised', items_count: uncategorised.length, items: uncategorised }] : [])].filter((c) => c.items.length > 0 || p.filters.category).map((c) => (
                                <section key={c.id}>
                                    <h2 className="mb-3 flex items-baseline gap-2 text-[15px] font-semibold">{c.name}<span className="text-muted-foreground text-xs font-normal">{c.items.length} items</span></h2>
                                    <Card className="divide-y">
                                        {c.items.length === 0 && <div className="text-muted-foreground px-5 py-8 text-center text-sm">No items in this category yet.</div>}
                                        {c.items.map((i) => (
                                            <div key={i.id} className={cn('flex items-center gap-4 px-4 py-3', !i.is_available && 'bg-subtle')}>
                                                <button onClick={() => setEditing(i)} className="shrink-0"><Thumb src={i.image} size={56} className={cn(!i.is_available && 'opacity-50 grayscale')} /></button>
                                                <button onClick={() => setEditing(i)} className="min-w-0 flex-1 text-left">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className={cn('font-semibold', !i.is_available && 'text-muted-foreground')}>{i.name}</span>
                                                        {i.is_popular && <Badge tone="dark">Popular</Badge>}
                                                        {i.special_price && <Badge tone="danger">Special</Badge>}
                                                        {i.needs_power && <Badge tone="warning"><Zap className="size-3" />Needs power</Badge>}
                                                        {i.dietary.map((d) => <Badge key={d}>{label(d)}</Badge>)}
                                                    </div>
                                                    <div className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">{i.description}</div>
                                                    {(i.modifier_groups?.length ?? 0) > 0 && <div className="text-muted-foreground mt-0.5 text-xs">Add-ons: {i.modifier_groups!.map((g) => g.name).join(', ')}</div>}
                                                </button>
                                                <div className="text-right">
                                                    {i.special_price ? <><div className="tabular text-zred font-semibold">{zig(i.special_price.zig)}</div><div className="tabular text-muted-foreground text-xs line-through">{zig(i.price.zig)}</div></> : <Money zig={i.price.zig} usd={i.price.usd} size="sm" />}
                                                </div>
                                                <div className="flex w-28 flex-col items-end gap-1">
                                                    <Switch size="sm" checked={i.is_available} onChange={() => router.patch(`/admin/catalog/items/${i.id}/toggle`, {}, { preserveScroll: true })} />
                                                    <span className="text-muted-foreground text-[11px]">{i.is_available ? 'In stock' : i.unavailable_until ? `Back ${new Date(i.unavailable_until).toLocaleDateString('en-ZW', { weekday: 'short' })}` : 'Sold out'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </Card>
                                </section>
                            ))}
                            {p.items.data.length === 0 && <Card><EmptyState icon={UtensilsCrossed} title="Your menu is empty" description="Add categories (Mains, Sides, Drinks) and then your items." action={<Button onClick={() => setEditing('new')}><Plus /> Add first item</Button>} /></Card>}
                        </div>
                    </div>
                )}
            </Page>
            {editing && <ItemDrawer item={editing === 'new' ? null : editing} vendorId={p.vendor.id} categories={p.categories} groups={p.groups} onClose={() => setEditing(null)} onDelete={async (i) => { if (await confirm({ title: `Delete ${i.name}?`, tone: 'danger', confirmLabel: 'Delete' })) router.delete(`/admin/catalog/items/${i.id}`, { onSuccess: () => setEditing(null) }); }} />}
            {groupEditing && <GroupDrawer group={groupEditing === 'new' ? null : groupEditing} vendorId={p.vendor.id} onClose={() => setGroupEditing(null)} />}
        </AdminLayout>
    );
}

function ItemDrawer({ item, vendorId, categories, groups, onClose, onDelete }: { item: MenuItem | null; vendorId: number; categories: Props['categories']; groups: Group[]; onClose: () => void; onDelete: (i: MenuItem) => void }) {
    const { data, setData, post, processing, errors, transform } = useForm({
        vendor_id: vendorId,
        name: item?.name ?? '',
        description: item?.description ?? '',
        category_id: item?.category_id ?? categories[0]?.id ?? '',
        price_zig: item?.price.zig ?? '',
        special_price_zig: item?.special_price?.zig ?? '',
        is_available: item?.is_available ?? true,
        is_special: item?.is_special ?? false,
        is_popular: item?.is_popular ?? false,
        needs_power: item?.needs_power ?? false,
        dietary: item?.dietary ?? ([] as string[]),
        calories: item?.calories ?? '',
        variants: item?.variants ?? ([] as { name: string; price_delta_zig: number }[]),
        modifier_group_ids: item?.modifier_groups?.map((g) => g.id) ?? ([] as number[]),
        image: null as File | null,
    });
    const [preview, setPreview] = useState<string | null>(item?.image ?? null);
    const err = (k: string) => (errors as Record<string, string>)[k];

    const submit = () => {
        transform((d) => {
            const { vendor_id, ...rest } = d;
            const out: Record<string, unknown> = { ...(item ? rest : { ...rest, vendor_id }), special_price_zig: d.special_price_zig === '' ? null : d.special_price_zig, calories: d.calories === '' ? null : d.calories };
            ['is_available', 'is_special', 'is_popular', 'needs_power'].forEach((k) => (out[k] = d[k as keyof typeof d] ? 1 : 0));
            return out as typeof d;
        });
        post(item ? `/admin/catalog/items/${item.id}` : '/admin/catalog/items', { forceFormData: true, preserveScroll: true, onSuccess: onClose });
    };

    return (
        <Drawer open onClose={onClose} width="lg" title={item ? item.name : 'New menu item'}
            footer={<>{item && <Button variant="ghost" className="text-zred mr-auto" onClick={() => onDelete(item)}><Trash2 /> Delete</Button>}<Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={submit}>{item ? 'Save item' : 'Add item'}</Button></>}>
            <div className="grid gap-5">
                <label className="bg-muted relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed">
                    {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="text-muted-foreground text-sm">Click to add a photo (JPG/PNG/WebP, up to 8 MB)</span>}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0] ?? null; setData('image', f); if (f) setPreview(URL.createObjectURL(f)); }} />
                </label>
                {err('image') && <p className="text-zred -mt-3 text-xs">{err('image')}</p>}
                <Field label="Name" error={err('name')}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} placeholder="e.g. Sadza & Beef Stew" /></Field>
                <Field label="Description"><Textarea value={data.description} onChange={(e) => setData('description', e.target.value)} placeholder="What’s in it? Customers love detail." /></Field>
                <div className="grid grid-cols-3 gap-3">
                    <Field label="Category"><Select value={data.category_id} onChange={(e) => setData('category_id', Number(e.target.value))}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                    <Field label="Price" error={err('price_zig')}><Input type="number" step="0.01" prefix="ZiG" value={data.price_zig} onChange={(e) => setData('price_zig', e.target.value)} /></Field>
                    <Field label="Special price" optional error={err('special_price_zig')}><Input type="number" step="0.01" prefix="ZiG" value={data.special_price_zig} onChange={(e) => setData('special_price_zig', e.target.value)} /></Field>
                </div>

                <div className="grid gap-2 border-t pt-5">
                    <div className="flex items-center justify-between"><span className="text-sm font-semibold">Sizes / portions</span><Button size="sm" variant="ghost" onClick={() => setData('variants', [...data.variants, { name: '', price_delta_zig: 0 }])}><Plus /> Add size</Button></div>
                    {data.variants.length === 0 && <p className="text-muted-foreground text-xs">One size only. Add sizes like Regular / Large with a price difference.</p>}
                    {data.variants.map((v, i) => (
                        <div key={i} className="flex gap-2">
                            <Input value={v.name} placeholder="Large" onChange={(e) => setData('variants', data.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                            <Input type="number" prefix="+ZiG" value={v.price_delta_zig} onChange={(e) => setData('variants', data.variants.map((x, j) => (j === i ? { ...x, price_delta_zig: Number(e.target.value) } : x)))} className="w-36" />
                            <Button size="icon" variant="ghost" onClick={() => setData('variants', data.variants.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                        </div>
                    ))}
                </div>

                <div className="grid gap-2 border-t pt-5">
                    <span className="text-sm font-semibold">Add-on groups</span>
                    {groups.length === 0 && <p className="text-muted-foreground text-xs">Create add-on groups in the “Add-on groups” tab first.</p>}
                    <div className="grid gap-1.5 sm:grid-cols-2">
                        {groups.map((g) => <Checkbox key={g.id} checked={data.modifier_group_ids.includes(g.id)} onChange={(c) => setData('modifier_group_ids', c ? [...data.modifier_group_ids, g.id] : data.modifier_group_ids.filter((x) => x !== g.id))} label={<span>{g.name} <span className="text-muted-foreground text-xs">{g.min_select ? 'required' : 'optional'}</span></span>} />)}
                    </div>
                </div>

                <div className="grid gap-2 border-t pt-5">
                    <span className="text-sm font-semibold">Dietary & labels</span>
                    <div className="flex flex-wrap gap-1.5">
                        {DIETARY.map((d) => (
                            <button key={d} type="button" onClick={() => setData('dietary', data.dietary.includes(d) ? data.dietary.filter((x) => x !== d) : [...data.dietary, d])} className={cn('rounded-full border px-3 py-1 text-[13px]', data.dietary.includes(d) ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted')}>{label(d)}</button>
                        ))}
                    </div>
                    <Field label="Calories" optional><Input type="number" suffix="kcal" value={data.calories} onChange={(e) => setData('calories', e.target.value)} className="w-40" /></Field>
                </div>

                <div className="grid gap-4 border-t pt-5">
                    <Switch checked={data.is_available} onChange={(v) => setData('is_available', v)} label="In stock" />
                    <Switch checked={data.is_popular} onChange={(v) => setData('is_popular', v)} label="Mark as popular" description="Gets a “Popular” badge and appears first." />
                    <Switch checked={data.is_special} onChange={(v) => setData('is_special', v)} label="Feature in Specials" />
                    <Switch checked={data.needs_power} onChange={(v) => setData('needs_power', v)} label={<span className="flex items-center gap-1.5"><ZapOff className="size-4" /> Needs electricity</span>} description="Hidden automatically when the store switches on load-shedding mode." />
                </div>
            </div>
        </Drawer>
    );
}

function GroupDrawer({ group, vendorId, onClose }: { group: Group | null; vendorId: number; onClose: () => void }) {
    const { data, setData, post, processing, errors } = useForm({
        vendor_id: vendorId,
        name: group?.name ?? '',
        min_select: group?.min_select ?? 0,
        max_select: group?.max_select ?? 1,
        options: (group?.options.map((o) => ({ ...o })) ?? [{ id: undefined, name: '', price_delta_zig: 0, is_available: true }]) as { id?: number; name: string; price_delta_zig: number; is_available: boolean }[],
    });
    const required = data.min_select > 0;
    const confirm = useConfirm();
    return (
        <Drawer open onClose={onClose} title={group ? `Edit “${group.name}”` : 'New add-on group'} description="e.g. “Choose your side”, “Extra toppings”, “Drink size”."
            footer={<>{group && <Button variant="ghost" className="text-zred mr-auto" onClick={async () => (await confirm({ title: 'Delete this add-on group?', tone: 'danger', confirmLabel: 'Delete' })) && router.delete(`/admin/catalog/modifier-groups/${group.id}`, { onSuccess: onClose })}><Trash2 /> Delete</Button>}<Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={processing} onClick={() => post(group ? `/admin/catalog/modifier-groups/${group.id}` : '/admin/catalog/modifier-groups', { onSuccess: onClose, preserveScroll: true })}>Save group</Button></>}>
            <div className="grid gap-5">
                <Field label="Group name" error={errors.name}><Input value={data.name} onChange={(e) => setData('name', e.target.value)} /></Field>
                <Segmented value={required ? 'req' : 'opt'} onChange={(v) => { setData('min_select', v === 'req' ? Math.max(1, data.min_select) : 0); }} options={[{ value: 'opt', label: 'Optional' }, { value: 'req', label: 'Required' }]} />
                <div className="grid grid-cols-2 gap-3">
                    {required && <Field label="Minimum picks"><Input type="number" min={1} value={data.min_select} onChange={(e) => setData('min_select', Number(e.target.value))} /></Field>}
                    <Field label="Maximum picks" error={errors.max_select}><Input type="number" min={1} value={data.max_select} onChange={(e) => setData('max_select', Number(e.target.value))} /></Field>
                </div>
                <div className="grid gap-2 border-t pt-5">
                    <span className="text-sm font-semibold">Options</span>
                    {data.options.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <Input value={o.name} placeholder="Chips" onChange={(e) => setData('options', data.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                            <Input type="number" prefix="+ZiG" value={o.price_delta_zig} onChange={(e) => setData('options', data.options.map((x, j) => (j === i ? { ...x, price_delta_zig: Number(e.target.value) } : x)))} className="w-32" />
                            <Switch size="sm" checked={o.is_available} onChange={(v) => setData('options', data.options.map((x, j) => (j === i ? { ...x, is_available: v } : x)))} />
                            <Button size="icon" variant="ghost" disabled={data.options.length === 1} onClick={() => setData('options', data.options.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                        </div>
                    ))}
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setData('options', [...data.options, { id: undefined, name: '', price_delta_zig: 0, is_available: true }])}><Plus /> Add option</Button>
                </div>
            </div>
        </Drawer>
    );
}

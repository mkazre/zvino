import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, PageHeader, Panel, Switch, VendorSwitcher, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { usd, zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { type Item } from '@/types';
import { Head, router, useForm } from '@inertiajs/react';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Props {
    vendor: { id: number; name: string } | null;
    vendors: { id: number; name: string }[];
    categories: { id: number; name: string; items_count: number }[];
    items: { data: Item[] };
    filters: { category?: string; q?: string };
}

export default function Catalog({ vendor, vendors, categories, items, filters }: Props) {
    const [editing, setEditing] = useState<Item | 'new' | null>(null);
    const [q, setQ] = useState(filters.q ?? '');
    const go = (p: Record<string, string | undefined>) => router.get('/admin/catalog', { vendor_id: vendor?.id, ...filters, ...p }, { preserveState: true, replace: true });

    const addCategory = () => {
        const name = prompt('New category name');
        if (name) router.post('/admin/catalog/categories', { vendor_id: vendor?.id, name }, { preserveScroll: true });
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'Catalog', href: '/admin/catalog' }]}>
            <Head title="Catalog" />
            <div className="flex flex-col gap-4 p-4 md:p-6">
                <PageHeader
                    title="Catalog"
                    subtitle={vendor ? `Menu for ${vendor.name}` : 'No vendor selected'}
                    actions={
                        <>
                            <VendorSwitcher vendors={vendors} current={vendor} />
                            <Button onClick={() => setEditing('new')} disabled={!vendor}>
                                <Plus /> Add item
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => go({ category: undefined })} className={cn('rounded-full border px-3 py-1 text-sm', !filters.category && 'bg-primary text-primary-foreground border-primary')}>
                        All
                    </button>
                    {categories.map((c) => (
                        <button key={c.id} onClick={() => go({ category: String(c.id) })} className={cn('rounded-full border px-3 py-1 text-sm', filters.category === String(c.id) && 'bg-primary text-primary-foreground border-primary')}>
                            {c.name} <span className="opacity-60">{c.items_count}</span>
                        </button>
                    ))}
                    <button onClick={addCategory} className="text-primary px-2 text-sm font-medium">+ Category</button>
                    <form onSubmit={(e) => { e.preventDefault(); go({ q }); }} className="ml-auto">
                        <input className={fieldClass} placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
                    </form>
                </div>

                <Panel>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                                <tr>
                                    {['Item', 'Category', 'Price', 'Special', 'Available', ''].map((h) => (
                                        <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.data.map((i) => (
                                    <tr key={i.id} className={cn('hover:bg-muted/40', !i.is_available && 'opacity-60')}>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-accent flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg text-lg">
                                                    {i.image ? <img src={i.image} alt="" className="size-full object-cover" /> : '🍲'}
                                                </div>
                                                <div className="min-w-0">
                                                    <button className="font-medium hover:underline" onClick={() => setEditing(i)}>{i.name}</button>
                                                    <div className="text-muted-foreground max-w-xs truncate text-xs">{i.description}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">{categories.find((c) => c.id === i.category_id)?.name ?? '—'}</td>
                                        <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                                            {zig(i.price.zig)}
                                            <div className="text-muted-foreground text-xs">{usd(i.price.usd)}</div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {i.special_price ? <span className="text-zred font-semibold">{zig(i.special_price.zig)}</span> : i.is_special ? <span className="text-gold font-semibold">Featured</span> : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Switch checked={i.is_available} onChange={() => router.patch(`/admin/catalog/items/${i.id}/toggle`, {}, { preserveScroll: true })} label={i.is_available ? 'On' : 'Off'} />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <Button size="sm" variant="ghost" onClick={() => setEditing(i)}>Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {items.data.length === 0 && <Empty>No items yet. Add your first menu item.</Empty>}
                    </div>
                </Panel>
            </div>

            {editing && vendor && <ItemDialog item={editing === 'new' ? null : editing} vendorId={vendor.id} categories={categories} onClose={() => setEditing(null)} />}
        </AppLayout>
    );
}

function ItemDialog({ item, vendorId, categories, onClose }: { item: Item | null; vendorId: number; categories: Props['categories']; onClose: () => void }) {
    const { data, setData, post, processing, errors, transform } = useForm({
        vendor_id: vendorId,
        name: item?.name ?? '',
        description: item?.description ?? '',
        category_id: item?.category_id ?? categories[0]?.id ?? '',
        price_zig: item?.price.zig ?? '',
        special_price_zig: item?.special_price?.zig ?? '',
        is_available: item?.is_available ?? true,
        is_special: item?.is_special ?? false,
        variants: item?.variants ?? [],
        image: null as File | null,
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        transform((d) => {
            const { vendor_id, ...rest } = d;
            return { ...(item ? rest : { ...rest, vendor_id }), special_price_zig: d.special_price_zig === '' ? null : d.special_price_zig, is_available: d.is_available ? 1 : 0, is_special: d.is_special ? 1 : 0 };
        });
        post(item ? `/admin/catalog/items/${item.id}` : '/admin/catalog/items', { forceFormData: true, preserveScroll: true, onSuccess: onClose });
    };

    const err = (k: string) => (errors as Record<string, string>)[k] && <p className="text-zred mt-1 text-xs">{(errors as Record<string, string>)[k]}</p>;

    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{item ? 'Edit item' : 'New item'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-3 text-sm">
                    <label className="block">Name<input className={fieldClass} value={data.name} onChange={(e) => setData('name', e.target.value)} />{err('name')}</label>
                    <label className="block">Description<textarea className={`${fieldClass} h-20 py-2`} value={data.description} onChange={(e) => setData('description', e.target.value)} /></label>
                    <div className="grid grid-cols-3 gap-3">
                        <label className="block">Category
                            <select className={fieldClass} value={data.category_id} onChange={(e) => setData('category_id', Number(e.target.value))}>
                                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </label>
                        <label className="block">Price (ZiG)<input type="number" step="0.01" className={fieldClass} value={data.price_zig} onChange={(e) => setData('price_zig', e.target.value)} />{err('price_zig')}</label>
                        <label className="block">Special (ZiG)<input type="number" step="0.01" className={fieldClass} value={data.special_price_zig} onChange={(e) => setData('special_price_zig', e.target.value)} />{err('special_price_zig')}</label>
                    </div>
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <span>Portions / variants</span>
                            <button type="button" className="text-primary text-xs font-medium" onClick={() => setData('variants', [...data.variants, { name: '', price_delta_zig: 0 }])}>+ Add</button>
                        </div>
                        {data.variants.map((v, idx) => (
                            <div key={idx} className="mb-2 flex gap-2">
                                <input className={fieldClass} placeholder="e.g. Large" value={v.name} onChange={(e) => setData('variants', data.variants.map((x, j) => (j === idx ? { ...x, name: e.target.value } : x)))} />
                                <input type="number" className={`${fieldClass} w-28`} placeholder="+ZiG" value={v.price_delta_zig} onChange={(e) => setData('variants', data.variants.map((x, j) => (j === idx ? { ...x, price_delta_zig: Number(e.target.value) } : x)))} />
                                <Button type="button" size="icon" variant="ghost" onClick={() => setData('variants', data.variants.filter((_, j) => j !== idx))}><Trash2 /></Button>
                            </div>
                        ))}
                    </div>
                    <label className="block">Photo<input type="file" accept="image/*" className="mt-1 block text-sm" onChange={(e) => setData('image', e.target.files?.[0] ?? null)} />{err('image')}</label>
                    <div className="flex gap-6">
                        <Switch checked={data.is_available} onChange={(v) => setData('is_available', v)} label="Available" />
                        <Switch checked={data.is_special} onChange={(v) => setData('is_special', v)} label="Feature in specials" />
                    </div>
                    <div className="flex justify-between border-t pt-3">
                        {item ? (
                            <Button type="button" variant="ghost" className="text-zred" onClick={() => confirm('Delete this item?') && router.delete(`/admin/catalog/items/${item.id}`, { onSuccess: onClose })}>
                                <Trash2 /> Delete
                            </Button>
                        ) : <span />}
                        <Button disabled={processing}>Save</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

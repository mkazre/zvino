import { Button } from '@/components/ui/button';
import { PageHeader, Panel, Switch, fieldClass } from '@/components/zvino';
import AppLayout from '@/layouts/app-layout';
import { label } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Head, router, useForm } from '@inertiajs/react';
import { Eye, EyeOff, GripVertical, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type Payload = { limit?: number; background?: string; height?: number };

interface Block {
    id: number;
    type: string;
    title: string | null;
    subtitle: string | null;
    cta_label: string | null;
    link_to: string | null;
    city_scope: string | null;
    is_visible: boolean;
    broadcast: boolean;
    payload: Payload | null;
}

const TYPE_INFO: Record<string, { icon: string; desc: string }> = {
    hero: { icon: '🎯', desc: 'Large promo banner with call to action' },
    categories: { icon: '🧭', desc: 'Horizontal rail of food categories' },
    specials: { icon: '🔥', desc: 'Carousel of live discounted items' },
    vendors: { icon: '🏪', desc: 'List of restaurants (marketplace only)' },
    banner: { icon: '📣', desc: 'Announcement strip, can push to all devices' },
    rewards: { icon: '🎁', desc: 'Loyalty points teaser' },
    richtext: { icon: '📝', desc: 'Free-form text' },
    spacer: { icon: '↕️', desc: 'Vertical spacing' },
};

export default function HomeBuilder({ blocks, types, cities }: { blocks: Block[]; types: string[]; cities: string[] }) {
    const [order, setOrder] = useState(blocks);
    const [dragId, setDragId] = useState<number | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(blocks[0]?.id ?? null);
    useEffect(() => setOrder(blocks), [blocks]);

    const selected = order.find((b) => b.id === selectedId) ?? null;

    const onDragOver = (overId: number) => {
        if (dragId === null || dragId === overId) return;
        const from = order.findIndex((b) => b.id === dragId);
        const to = order.findIndex((b) => b.id === overId);
        const next = [...order];
        next.splice(to, 0, next.splice(from, 1)[0]);
        setOrder(next);
    };
    const onDrop = () => {
        setDragId(null);
        router.post('/admin/home-builder/reorder', { ids: order.map((b) => b.id) }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AppLayout breadcrumbs={[{ title: 'Home builder', href: '/admin/home-builder' }]}>
            <Head title="Home builder" />
            <div className="flex flex-col gap-4 p-4 md:p-6">
                <PageHeader title="Home page builder" subtitle="Drag to reorder. Changes go live in the app straight away, with no app release needed." />

                <div className="grid gap-4 xl:grid-cols-[240px_1fr_340px]">
                    <Panel title="Block library">
                        <div className="grid gap-2 p-3">
                            {types.map((t) => (
                                <button key={t} onClick={() => router.post('/admin/home-builder/blocks', { type: t }, { preserveScroll: true })} className="hover:border-primary hover:bg-accent flex items-start gap-2 rounded-lg border p-2.5 text-left transition">
                                    <span className="text-lg">{TYPE_INFO[t]?.icon}</span>
                                    <span>
                                        <span className="block text-sm font-medium">{label(t)}</span>
                                        <span className="text-muted-foreground block text-xs">{TYPE_INFO[t]?.desc}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </Panel>

                    <Panel title={`App home feed · ${order.length} blocks`}>
                        <ul className="space-y-2 p-3">
                            {order.map((b) => (
                                <li
                                    key={b.id}
                                    draggable
                                    onDragStart={() => setDragId(b.id)}
                                    onDragOver={(e) => { e.preventDefault(); onDragOver(b.id); }}
                                    onDragEnd={onDrop}
                                    onClick={() => setSelectedId(b.id)}
                                    className={cn(
                                        'bg-background flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition',
                                        selectedId === b.id && 'border-primary ring-primary/20 ring-2',
                                        dragId === b.id && 'opacity-50',
                                        !b.is_visible && 'border-dashed opacity-60',
                                    )}
                                >
                                    <GripVertical className="text-muted-foreground size-4 shrink-0 cursor-grab" />
                                    <span className="text-xl">{TYPE_INFO[b.type]?.icon}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{b.title || label(b.type)}</div>
                                        <div className="text-muted-foreground truncate text-xs">
                                            {label(b.type)} {b.city_scope ? `· ${b.city_scope} only` : '· All cities'}
                                        </div>
                                    </div>
                                    <button
                                        aria-label={b.is_visible ? 'Hide' : 'Show'}
                                        onClick={(e) => { e.stopPropagation(); router.patch(`/admin/home-builder/blocks/${b.id}`, { is_visible: !b.is_visible }, { preserveScroll: true }); }}
                                        className="text-muted-foreground hover:text-foreground p-1"
                                    >
                                        {b.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </Panel>

                    <Panel title="Edit block">
                        {selected ? <BlockEditor key={selected.id} block={selected} cities={cities} /> : <p className="text-muted-foreground p-4 text-sm">Select a block to edit it.</p>}
                    </Panel>
                </div>
            </div>
        </AppLayout>
    );
}

function BlockEditor({ block, cities }: { block: Block; cities: string[] }) {
    const { data, setData, patch, processing, isDirty } = useForm({
        title: block.title ?? '',
        subtitle: block.subtitle ?? '',
        cta_label: block.cta_label ?? '',
        link_to: block.link_to ?? '',
        city_scope: block.city_scope ?? '',
        is_visible: block.is_visible,
        broadcast: block.broadcast,
        payload: (block.payload ?? {}) as Payload,
    });
    const hasText = !['spacer', 'categories'].includes(block.type);

    return (
        <form
            className="space-y-3 p-4 text-sm"
            onSubmit={(e) => {
                e.preventDefault();
                patch(`/admin/home-builder/blocks/${block.id}`, { preserveScroll: true });
            }}
        >
            {hasText && (
                <>
                    <label className="block">Title<input className={fieldClass} value={data.title} onChange={(e) => setData('title', e.target.value)} /></label>
                    <label className="block">Subtitle<textarea className={`${fieldClass} h-16 py-2`} value={data.subtitle} onChange={(e) => setData('subtitle', e.target.value)} /></label>
                    <div className="grid grid-cols-2 gap-2">
                        <label className="block">CTA label<input className={fieldClass} value={data.cta_label} onChange={(e) => setData('cta_label', e.target.value)} /></label>
                        <label className="block">Link to
                            <input className={fieldClass} placeholder="specials, vendor/12" value={data.link_to} onChange={(e) => setData('link_to', e.target.value)} />
                        </label>
                    </div>
                </>
            )}
            {['specials', 'vendors'].includes(block.type) && (
                <label className="block">Max items
                    <input type="number" className={fieldClass} value={data.payload.limit ?? 10} onChange={(e) => setData('payload', { ...data.payload, limit: Number(e.target.value) })} />
                </label>
            )}
            {block.type === 'hero' && (
                <label className="block">Background colour
                    <input type="color" className="block h-9 w-16 rounded border" value={data.payload.background ?? '#0B6E4F'} onChange={(e) => setData('payload', { ...data.payload, background: e.target.value })} />
                </label>
            )}
            {block.type === 'spacer' && (
                <label className="block">Height (px)
                    <input type="number" className={fieldClass} value={data.payload.height ?? 16} onChange={(e) => setData('payload', { ...data.payload, height: Number(e.target.value) })} />
                </label>
            )}
            <label className="block">City targeting
                <select className={fieldClass} value={data.city_scope} onChange={(e) => setData('city_scope', e.target.value)}>
                    <option value="">All cities</option>
                    {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
            </label>
            <div className="flex flex-col gap-2">
                <Switch checked={data.is_visible} onChange={(v) => setData('is_visible', v)} label="Visible in app" />
                {block.type === 'banner' && <Switch checked={data.broadcast} onChange={(v) => setData('broadcast', v)} label="Also send as push notification" />}
            </div>
            <div className="flex justify-between border-t pt-3">
                <Button type="button" variant="ghost" className="text-zred" onClick={() => confirm('Delete this block?') && router.delete(`/admin/home-builder/blocks/${block.id}`, { preserveScroll: true })}>
                    <Trash2 /> Delete
                </Button>
                <Button disabled={processing || !isDirty}>Save</Button>
            </div>
        </form>
    );
}

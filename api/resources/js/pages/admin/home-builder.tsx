import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Field, Input, Page, PageHeader, Select, Switch, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { label } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { router, useForm } from '@inertiajs/react';
import { Bell, Eye, EyeOff, Flame, Gift, GripVertical, Image, LayoutGrid, MoveVertical, Plus, Store, Trash2, Type } from 'lucide-react';
import { useEffect, useState } from 'react';

type Payload = { limit?: number; background?: string; height?: number; tone?: string; featured_only?: boolean };
interface Block { id: number; type: string; title: string | null; subtitle: string | null; cta_label: string | null; link_to: string | null; city_scope: string | null; is_visible: boolean; broadcast: boolean; payload: Payload | null }

const TYPES: Record<string, { icon: typeof Image; name: string; desc: string }> = {
    hero: { icon: Image, name: 'Hero banner', desc: 'Big promo with a button' },
    categories: { icon: LayoutGrid, name: 'Category rail', desc: 'Scrollable cuisine icons' },
    specials: { icon: Flame, name: 'Specials', desc: 'Live discounted dishes' },
    vendors: { icon: Store, name: 'Store list', desc: 'Popular / featured stores' },
    banner: { icon: Bell, name: 'Announcement', desc: 'Strip message, optional push' },
    rewards: { icon: Gift, name: 'Rewards teaser', desc: 'Points & next reward' },
    richtext: { icon: Type, name: 'Text', desc: 'Free text block' },
    spacer: { icon: MoveVertical, name: 'Spacer', desc: 'Breathing room' },
};

export default function HomeBuilder({ blocks, types, cities }: { blocks: Block[]; types: string[]; cities: string[] }) {
    const [order, setOrder] = useState(blocks);
    const [selectedId, setSelectedId] = useState<number | null>(blocks[0]?.id ?? null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    useEffect(() => setOrder(blocks), [blocks]);
    const selected = order.find((b) => b.id === selectedId) ?? null;

    const onDragEnd = (e: DragEndEvent) => {
        if (!e.over || e.active.id === e.over.id) return;
        const next = arrayMove(order, order.findIndex((b) => b.id === e.active.id), order.findIndex((b) => b.id === e.over!.id));
        setOrder(next);
        router.post('/admin/home-builder/reorder', { ids: next.map((b) => b.id) }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AdminLayout title="Home builder">
            <Page wide>
                <PageHeader title="Home builder" description="Design the app and website home screen. Drag to reorder; changes go live instantly with no app update needed." />
                <div className="grid gap-5 xl:grid-cols-[1fr_340px_380px]">
                    <Card>
                        <CardHeader title="Sections" description={`${order.filter((b) => b.is_visible).length} visible of ${order.length}`} />
                        <div className="border-t p-3">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                                <SortableContext items={order.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                                    <ul className="grid gap-2">{order.map((b) => <Row key={b.id} b={b} active={b.id === selectedId} onSelect={() => setSelectedId(b.id)} />)}</ul>
                                </SortableContext>
                            </DndContext>
                        </div>
                        <div className="border-t p-4">
                            <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Add a section</div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {types.map((t) => {
                                    const T = TYPES[t];
                                    return (
                                        <button key={t} onClick={() => router.post('/admin/home-builder/blocks', { type: t }, { preserveScroll: true })} className="hover:border-foreground/30 hover:bg-subtle flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition">
                                            <T.icon className="text-muted-foreground size-4" /><span className="text-[13px] font-semibold">{T.name}</span><span className="text-muted-foreground text-[11px] leading-tight">{T.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </Card>

                    <div className="xl:sticky xl:top-24 xl:self-start">
                        <PhonePreview blocks={order} selectedId={selectedId} onSelect={setSelectedId} />
                    </div>

                    <Card className="xl:sticky xl:top-24 xl:self-start">
                        <CardHeader title={selected ? TYPES[selected.type]?.name : 'Edit section'} description={selected ? undefined : 'Pick a section to edit.'} />
                        {selected && <Editor key={selected.id} block={selected} cities={cities} />}
                    </Card>
                </div>
            </Page>
        </AdminLayout>
    );
}

function Row({ b, active, onSelect }: { b: Block; active: boolean; onSelect: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
    const T = TYPES[b.type] ?? TYPES.richtext;
    return (
        <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} onClick={onSelect}
            className={cn('bg-surface flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition', active && 'border-foreground ring-foreground/10 ring-4', isDragging && 'z-10 shadow-(--shadow-pop)', !b.is_visible && 'opacity-55')}>
            <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
            <span className="bg-muted flex size-8 items-center justify-center rounded-md"><T.icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{b.title || T.name}</span>
                <span className="text-muted-foreground block text-xs">{T.name}{b.city_scope ? ` · ${b.city_scope} only` : ''}</span>
            </span>
            {b.broadcast && <Badge tone="info">Pushed</Badge>}
            <button onClick={(e) => { e.stopPropagation(); router.patch(`/admin/home-builder/blocks/${b.id}`, { is_visible: !b.is_visible }, { preserveScroll: true }); }} className="text-muted-foreground hover:text-foreground p-1" aria-label={b.is_visible ? 'Hide' : 'Show'}>
                {b.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
        </li>
    );
}

/** Approximates the customer app home screen so staff see what they're building. */
function PhonePreview({ blocks, selectedId, onSelect }: { blocks: Block[]; selectedId: number | null; onSelect: (id: number) => void }) {
    return (
        <div className="mx-auto w-[320px] rounded-[44px] border-[10px] border-[#222222] bg-[#222222] shadow-(--shadow-pop)">
            <div className="scroll-quiet h-[620px] overflow-y-auto rounded-[34px] bg-white text-[#222222]">
                <div className="sticky top-0 z-10 bg-white/95 px-4 pt-4 pb-2 backdrop-blur">
                    <div className="text-[10px] text-neutral-500">Deliver to</div>
                    <div className="text-[13px] font-bold">5 Fife Ave, Avenues ▾</div>
                    <div className="mt-2 rounded-full bg-neutral-100 px-3 py-2 text-[11px] text-neutral-500">Search food, stores, groceries…</div>
                </div>
                <div className="grid gap-3 px-4 pt-2 pb-6">
                    {blocks.filter((b) => b.is_visible).map((b) => (
                        <div key={b.id} onClick={() => onSelect(b.id)} className={cn('cursor-pointer rounded-xl transition', b.id === selectedId && 'ring-brand ring-2 ring-offset-2')}>
                            <PreviewBlock b={b} />
                        </div>
                    ))}
                    {blocks.every((b) => !b.is_visible) && <p className="py-20 text-center text-xs text-neutral-400">Nothing visible yet</p>}
                </div>
            </div>
        </div>
    );
}

function PreviewBlock({ b }: { b: Block }) {
    const tile = (w: string) => <div className={cn('shrink-0 rounded-lg bg-neutral-100', w)} />;
    switch (b.type) {
        case 'hero':
            return (
                <div className="rounded-xl p-4 text-white" style={{ background: b.payload?.background ?? 'var(--color-brand)' }}>
                    <div className="text-[15px] leading-tight font-bold">{b.title || 'Hero title'}</div>
                    <div className="mt-1 text-[11px] opacity-85">{b.subtitle}</div>
                    {b.cta_label && <div className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#222222]">{b.cta_label}</div>}
                </div>
            );
        case 'categories':
            return <div><div className="mb-1.5 text-[12px] font-bold">{b.title || 'Categories'}</div><div className="flex gap-2 overflow-hidden">{['🍲', '🔥', '🍔', '🍕', '🍗'].map((e) => <div key={e} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg">{e}</div>)}</div></div>;
        case 'specials':
        case 'vendors':
            return <div><div className="mb-1.5 flex justify-between text-[12px] font-bold"><span>{b.title || label(b.type)}</span>{b.cta_label && <span className="text-[10px] font-medium text-neutral-500">{b.cta_label}</span>}</div><div className="flex gap-2 overflow-hidden">{tile('h-24 w-32')}{tile('h-24 w-32')}{tile('h-24 w-20')}</div></div>;
        case 'banner':
            return <div className={cn('rounded-lg px-3 py-2.5 text-[11px]', b.payload?.tone === 'gold' ? 'bg-amber-50 text-amber-900' : 'bg-neutral-900 text-white')}><b>{b.title}</b> {b.subtitle}</div>;
        case 'rewards':
            return <div className="flex items-center gap-3 rounded-xl border p-3"><div className="flex size-9 items-center justify-center rounded-full bg-amber-100">🎁</div><div><div className="text-[12px] font-bold">{b.title || 'Rewards'}</div><div className="text-[10px] text-neutral-500">{b.subtitle}</div></div></div>;
        case 'spacer':
            return <div style={{ height: b.payload?.height ?? 16 }} className="rounded border border-dashed border-neutral-200" />;
        default:
            return <div className="text-[11px]"><b>{b.title}</b><p className="text-neutral-600">{b.subtitle}</p></div>;
    }
}

function Editor({ block, cities }: { block: Block; cities: string[] }) {
    const confirm = useConfirm();
    const { data, setData, patch, processing, isDirty } = useForm({
        title: block.title ?? '', subtitle: block.subtitle ?? '', cta_label: block.cta_label ?? '', link_to: block.link_to ?? '', city_scope: block.city_scope ?? '',
        is_visible: block.is_visible, broadcast: block.broadcast, payload: (block.payload ?? {}) as Payload,
    });
    const text = !['spacer', 'categories'].includes(block.type);
    return (
        <div className="grid gap-4 border-t px-5 py-5">
            {text && (
                <>
                    <Field label="Title"><Input value={data.title} onChange={(e) => setData('title', e.target.value)} /></Field>
                    <Field label={block.type === 'richtext' ? 'Text' : 'Subtitle'}><Textarea value={data.subtitle} onChange={(e) => setData('subtitle', e.target.value)} className="min-h-[64px]" /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Button text" optional><Input value={data.cta_label} onChange={(e) => setData('cta_label', e.target.value)} /></Field>
                        <Field label="Opens" hint="specials, vendor/12, rewards" optional><Input value={data.link_to} onChange={(e) => setData('link_to', e.target.value)} /></Field>
                    </div>
                </>
            )}
            {block.type === 'hero' && <Field label="Background"><div className="flex items-center gap-2"><input type="color" value={data.payload.background ?? 'var(--color-brand)'} onChange={(e) => setData('payload', { ...data.payload, background: e.target.value })} className="h-10 w-14 rounded-lg border" />{['var(--color-brand)', '#222222', '#C8102E', '#C99412'].map((c) => <button key={c} onClick={() => setData('payload', { ...data.payload, background: c })} className="size-7 rounded-full border-2 border-white shadow ring-1 ring-black/10" style={{ background: c }} aria-label={c} />)}</div></Field>}
            {['specials', 'vendors'].includes(block.type) && <Field label="How many to show"><Input type="number" value={data.payload.limit ?? 10} onChange={(e) => setData('payload', { ...data.payload, limit: Number(e.target.value) })} /></Field>}
            {block.type === 'vendors' && <Switch checked={!!data.payload.featured_only} onChange={(v) => setData('payload', { ...data.payload, featured_only: v })} label="Featured stores only" />}
            {block.type === 'banner' && <Field label="Style"><Select value={data.payload.tone ?? 'dark'} onChange={(e) => setData('payload', { ...data.payload, tone: e.target.value })}><option value="dark">Dark</option><option value="gold">Gold</option></Select></Field>}
            {block.type === 'spacer' && <Field label="Height"><Input type="number" suffix="px" value={data.payload.height ?? 16} onChange={(e) => setData('payload', { ...data.payload, height: Number(e.target.value) })} /></Field>}
            <Field label="Show to"><Select value={data.city_scope} onChange={(e) => setData('city_scope', e.target.value)}><option value="">Everyone</option>{cities.map((c) => <option key={c} value={c}>{c} only</option>)}</Select></Field>
            <Switch checked={data.is_visible} onChange={(v) => setData('is_visible', v)} label="Visible" />
            {block.type === 'banner' && <Switch checked={data.broadcast} onChange={(v) => setData('broadcast', v)} label="Also send as a push notification" description="Sent once to every customer when you save." />}
            <div className="flex justify-between border-t pt-4">
                <Button variant="ghost" className="text-zred" onClick={async () => (await confirm({ title: 'Remove this section?', tone: 'danger', confirmLabel: 'Remove' })) && router.delete(`/admin/home-builder/blocks/${block.id}`, { preserveScroll: true })}><Trash2 /> Remove</Button>
                <Button disabled={processing || !isDirty} onClick={() => patch(`/admin/home-builder/blocks/${block.id}`, { preserveScroll: true })}>Save</Button>
            </div>
        </div>
    );
}

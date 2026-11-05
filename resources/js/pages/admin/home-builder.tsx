import { ICONS, backgroundCss, overlayCss } from '@/components/home-blocks';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardHeader, Field, Input, Modal, Page, PageHeader, Segmented, Select, Switch, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { BLOCKS, GROUPS, ICON_CHOICES, STYLE_CONTROLS, type BlockDef, type Ctl, type Payload } from '@/lib/blocks';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { router, useForm } from '@inertiajs/react';
import { ArrowDown, ArrowUp, Copy, ExternalLink, Eye, EyeOff, GripVertical, ImagePlus, Loader2, Monitor, Plus, RefreshCw, Search, Smartphone, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Block { id: number; type: string; title: string | null; subtitle: string | null; cta_label: string | null; link_to: string | null; city_scope: string | null; is_visible: boolean; broadcast: boolean; payload: Payload | null }
interface Props {
    blocks: Block[];
    types: string[];
    appTypes: string[];
    cities: string[];
    vendors: { id: number; name: string; city: string; status: string; logo_path: string | null }[];
    items: { id: number; name: string; vendor_id: number; image_path: string | null; price_zig: number; vendor?: { id: number; name: string } }[];
}
type Pickers = Pick<Props, 'vendors' | 'items'>;

export default function HomeBuilder({ blocks, types, appTypes, cities, vendors, items }: Props) {
    const [order, setOrder] = useState(blocks);
    const [selectedId, setSelectedId] = useState<number | null>(blocks[0]?.id ?? null);
    const [adding, setAdding] = useState(false);
    const [preview, setPreview] = useState<'web' | 'app'>('web');
    const [reload, setReload] = useState(0);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    useEffect(() => {
        setOrder(blocks);
        setReload((n) => n + 1);
        if (!blocks.some((b) => b.id === selectedId)) setSelectedId(blocks[0]?.id ?? null);
    }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps
    const selected = order.find((b) => b.id === selectedId) ?? null;

    const onDragEnd = (e: DragEndEvent) => {
        if (!e.over || e.active.id === e.over.id) return;
        const next = arrayMove(order, order.findIndex((b) => b.id === e.active.id), order.findIndex((b) => b.id === e.over!.id));
        setOrder(next);
        router.post('/admin/home-builder/reorder', { ids: next.map((b) => b.id) }, { preserveScroll: true, preserveState: true });
    };

    const add = (type: string) => {
        const d = BLOCKS[type]?.defaults ?? {};
        const before = new Set(order.map((b) => b.id));
        router.post('/admin/home-builder/blocks', { type, title: d.title ?? null, subtitle: d.subtitle ?? null, cta_label: d.cta_label ?? null, link_to: d.link_to ?? null, payload: (d.payload ?? {}) as never, after_id: selectedId ?? undefined }, {
            preserveScroll: true,
            onSuccess: (page) => {
                const created = (page.props as unknown as Props).blocks.find((b) => !before.has(b.id));
                if (created) setSelectedId(created.id);
                setAdding(false);
            },
        });
    };

    return (
        <AdminLayout title="Home builder">
            <Page wide>
                <PageHeader title="Home builder" description="Design the website and app home page. Drag to reorder; saved changes go live straight away, with no app update needed."
                    actions={<><Button variant="outline" asChild><a href="/" target="_blank" rel="noreferrer"><ExternalLink /> View website</a></Button><Button onClick={() => setAdding(true)}><Plus /> Add section</Button></>} />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_420px]">
                    <Card className="min-w-0 self-start">
                        <CardHeader title="Sections" description={`${order.filter((b) => b.is_visible).length} visible of ${order.length}`} />
                        <div className="border-t p-3">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                                <SortableContext items={order.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                                    <ul className="grid gap-2">{order.map((b) => <Row key={b.id} b={b} app={appTypes.includes(b.type)} active={b.id === selectedId} onSelect={() => setSelectedId(b.id)} />)}</ul>
                                </SortableContext>
                            </DndContext>
                            {order.length === 0 && <p className="text-muted-foreground py-8 text-center text-sm">No sections yet.</p>}
                            <Button variant="outline" className="mt-3 w-full" onClick={() => setAdding(true)}><Plus /> Add section</Button>
                        </div>
                    </Card>

                    <Card className="min-w-0 self-start 2xl:order-last">
                        {selected ? <Editor key={selected.id} block={selected} cities={cities} app={appTypes.includes(selected.type)} pickers={{ vendors, items }} /> : <CardHeader title="Edit section" description="Pick a section on the left, or add one." />}
                    </Card>

                    <div className="min-w-0 lg:col-span-2 2xl:col-span-1 2xl:sticky 2xl:top-24 2xl:self-start">
                        <Card>
                            <div className="flex items-center justify-between gap-2 px-4 py-3">
                                <Segmented size="sm" value={preview} onChange={setPreview} options={[{ value: 'web', label: <span className="flex items-center gap-1.5"><Monitor className="size-3.5" />Website</span> }, { value: 'app', label: <span className="flex items-center gap-1.5"><Smartphone className="size-3.5" />App</span> }]} />
                                {preview === 'web' && <Button size="sm" variant="ghost" onClick={() => setReload((n) => n + 1)} aria-label="Reload preview"><RefreshCw /></Button>}
                            </div>
                            <div className="border-t p-3">
                                {preview === 'web' ? <WebPreview reload={reload} /> : <PhonePreview blocks={order.filter((b) => appTypes.includes(b.type) && b.payload?.channel !== 'web')} selectedId={selectedId} onSelect={setSelectedId} />}
                            </div>
                            <p className="text-muted-foreground border-t px-4 py-2.5 text-xs">{preview === 'web' ? 'The live website. Saved, visible sections only.' : 'The customer app shows the original section types; website-only sections are skipped.'}</p>
                        </Card>
                    </div>
                </div>
                {adding && <AddSection types={types} appTypes={appTypes} onClose={() => setAdding(false)} onPick={add} />}
            </Page>
        </AdminLayout>
    );
}

function WebPreview({ reload }: { reload: number }) {
    const box = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.3);
    useEffect(() => {
        const el = box.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setScale(el.clientWidth / 1280));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div ref={box} className="relative h-[560px] overflow-hidden rounded-lg border bg-white">
            <iframe key={reload} src={`/?builder=${reload}`} title="Website preview" className="pointer-events-auto origin-top-left border-0" style={{ width: 1280, height: 560 / scale, transform: `scale(${scale})` }} />
        </div>
    );
}

function Row({ b, app, active, onSelect }: { b: Block; app: boolean; active: boolean; onSelect: () => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
    const T = BLOCKS[b.type] ?? BLOCKS.richtext;
    const confirm = useConfirm();
    return (
        <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} onClick={onSelect}
            className={cn('bg-surface group flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition', active && 'border-foreground ring-foreground/10 ring-4', isDragging && 'z-10 shadow-(--shadow-pop)', !b.is_visible && 'opacity-60')}>
            <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical className="size-4" /></button>
            <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md"><T.icon className="size-4" /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{b.title || T.name}</span>
                <span className="text-muted-foreground block truncate text-xs">{T.name}{b.city_scope ? ` · ${b.city_scope}` : ''}{!app || b.payload?.channel === 'web' ? ' · website' : b.payload?.channel === 'app' ? ' · app only' : ''}</span>
            </span>
            {b.broadcast && <Badge tone="info">Pushed</Badge>}
            <button onClick={(e) => { e.stopPropagation(); router.post(`/admin/home-builder/blocks/${b.id}/duplicate`, {}, { preserveScroll: true }); }} className="text-muted-foreground hover:text-foreground hidden p-1 group-hover:block" aria-label="Duplicate"><Copy className="size-3.5" /></button>
            <button onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: 'Delete this section?', tone: 'danger', confirmLabel: 'Delete' })) router.delete(`/admin/home-builder/blocks/${b.id}`, { preserveScroll: true }); }} className="text-muted-foreground hover:text-zred hidden p-1 group-hover:block" aria-label="Delete"><Trash2 className="size-3.5" /></button>
            <button onClick={(e) => { e.stopPropagation(); router.patch(`/admin/home-builder/blocks/${b.id}`, { is_visible: !b.is_visible }, { preserveScroll: true }); }} className="text-muted-foreground hover:text-foreground p-1" aria-label={b.is_visible ? 'Hide' : 'Show'} title={b.is_visible ? 'Visible: click to hide' : 'Hidden: click to show'}>
                {b.is_visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            </button>
        </li>
    );
}

function AddSection({ types, appTypes, onClose, onPick }: { types: string[]; appTypes: string[]; onClose: () => void; onPick: (t: string) => void }) {
    const [q, setQ] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const match = (t: string) => !q || `${BLOCKS[t]?.name} ${BLOCKS[t]?.desc}`.toLowerCase().includes(q.toLowerCase());
    return (
        <Modal open onClose={onClose} size="lg" title="Add a section" description="It’s added below the selected section, hidden until you switch it on."
            footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
            <div className="grid max-h-[60vh] gap-5 overflow-y-auto pr-1">
                <div className="relative"><Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections…" className="pl-9" /></div>
                {GROUPS.map((g) => {
                    const list = types.filter((t) => BLOCKS[t]?.group === g && match(t));
                    if (!list.length) return null;
                    return (
                        <div key={g}>
                            <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">{g}</div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {list.map((t) => {
                                    const T = BLOCKS[t];
                                    return (
                                        <button key={t} type="button" disabled={!!busy} onClick={() => { setBusy(t); onPick(t); }} className="hover:border-foreground/30 hover:bg-subtle flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition disabled:opacity-60">
                                            <span className="flex w-full items-center justify-between">{busy === t ? <Loader2 className="size-4 animate-spin" /> : <T.icon className="text-muted-foreground size-4" />}{appTypes.includes(t) ? <Badge>Web + app</Badge> : <Badge tone="info">Website</Badge>}</span>
                                            <span className="text-[13px] font-semibold">{T.name}</span>
                                            <span className="text-muted-foreground text-[11px] leading-tight">{T.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
}

/** Approximates the customer app home screen (original block types). */
function PhonePreview({ blocks, selectedId, onSelect }: { blocks: Block[]; selectedId: number | null; onSelect: (id: number) => void }) {
    return (
        <div className="mx-auto w-[300px] rounded-[44px] border-[10px] border-[#222222] bg-[#222222]">
            <div className="scroll-quiet h-[540px] overflow-y-auto rounded-[34px] bg-white text-[#222222]">
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
    const p = b.payload ?? {};
    switch (b.type) {
        case 'hero':
            return (
                <div className="rounded-xl p-4 text-white" style={{ background: String(p.background ?? '#1C1C1C') }}>
                    <div className="text-[15px] leading-tight font-bold">{b.title || 'Hero title'}</div>
                    <div className="mt-1 text-[11px] opacity-85">{b.subtitle}</div>
                    {b.cta_label && <div className="mt-3 inline-block rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-[#222222]">{b.cta_label}</div>}
                </div>
            );
        case 'categories':
            return <div><div className="mb-1.5 text-[12px] font-bold">{b.title || 'Categories'}</div><div className="flex gap-2 overflow-hidden">{['🍲', '🔥', '🍔', '🍕', '🍗'].map((e) => <div key={e} className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg">{e}</div>)}</div></div>;
        case 'specials':
        case 'vendors':
            return <div><div className="mb-1.5 flex justify-between text-[12px] font-bold"><span>{b.title || BLOCKS[b.type].name}</span>{b.cta_label && <span className="text-[10px] font-medium text-neutral-500">{b.cta_label}</span>}</div><div className="flex gap-2 overflow-hidden">{tile('h-24 w-32')}{tile('h-24 w-32')}{tile('h-24 w-20')}</div></div>;
        case 'banner':
            return <div className={cn('rounded-lg px-3 py-2.5 text-[11px]', p.tone === 'gold' ? 'bg-amber-50 text-amber-900' : p.tone === 'brand' ? 'bg-green-100' : p.tone === 'red' ? 'bg-red-600 text-white' : 'bg-neutral-900 text-white')}><b>{b.title}</b> {b.subtitle}</div>;
        case 'rewards':
            return <div className="flex items-center gap-3 rounded-xl border p-3"><div className="flex size-9 items-center justify-center rounded-full bg-amber-100">🎁</div><div><div className="text-[12px] font-bold">{b.title || 'Rewards'}</div><div className="text-[10px] text-neutral-500">{b.subtitle}</div></div></div>;
        case 'spacer':
            return <div style={{ height: Number(p.height ?? 16) / 2 }} className="rounded border border-dashed border-neutral-200" />;
        default:
            return <div className="text-[11px]"><b>{b.title}</b><p className="text-neutral-600">{b.subtitle}</p></div>;
    }
}

// ── Editor ───────────────────────────────────────────────────────────────────

function Editor({ block, cities, app, pickers }: { block: Block; cities: string[]; app: boolean; pickers: Pickers }) {
    const def: BlockDef = BLOCKS[block.type] ?? BLOCKS.richtext;
    const [tab, setTab] = useState<'content' | 'style' | 'visibility'>('content');
    const { data, setData, patch, processing, isDirty, reset } = useForm({
        title: block.title ?? '', subtitle: block.subtitle ?? '', cta_label: block.cta_label ?? '', link_to: block.link_to ?? '', city_scope: block.city_scope ?? '',
        is_visible: block.is_visible, broadcast: block.broadcast, payload: { ...(def.defaults.payload ?? {}), ...(block.payload ?? {}) } as Payload,
    });
    const setP = (k: string, v: unknown) => setData('payload', { ...data.payload, [k]: v });
    const hasStyle = def.style !== 'none';
    const save = () => patch(`/admin/home-builder/blocks/${block.id}`, { preserveScroll: true });

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                <div className="flex min-w-0 items-center gap-2"><span className="bg-muted flex size-8 items-center justify-center rounded-md"><def.icon className="size-4" /></span><div className="min-w-0"><div className="truncate font-semibold">{def.name}</div><div className="text-muted-foreground text-xs">{def.desc}{app ? ' · website and app' : ' · website'}</div></div></div>
                <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'content', label: 'Content' }, ...(hasStyle ? [{ value: 'style' as const, label: 'Style' }] : []), { value: 'visibility', label: 'Visibility' }]} />
            </div>
            <div className="grid gap-4 px-5 py-5">
                {tab === 'content' && (
                    <>
                        {def.base.title !== undefined && def.base.title !== false && <Field label={def.base.title}><Input value={data.title} onChange={(e) => setData('title', e.target.value)} maxLength={120} /></Field>}
                        {def.base.subtitle !== undefined && def.base.subtitle !== false && <Field label={def.base.subtitle}><Textarea value={data.subtitle} onChange={(e) => setData('subtitle', e.target.value)} rows={block.type === 'richtext' ? 5 : 2} maxLength={1000} /></Field>}
                        {def.base.cta && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Field label="Button text" optional><Input value={data.cta_label} onChange={(e) => setData('cta_label', e.target.value)} maxLength={40} /></Field>
                                <Field label="Button opens" optional><Input value={data.link_to} placeholder="/stores, /plus or https://…" onChange={(e) => setData('link_to', e.target.value)} /></Field>
                            </div>
                        )}
                        {def.fields.map((c) => <Control key={c.k} c={c} value={data.payload[c.k]} onChange={(v) => setP(c.k, v)} pickers={pickers} />)}
                        {def.fields.length === 0 && !def.base.title && <p className="text-muted-foreground text-sm">Nothing to fill in here. See Style and Visibility.</p>}
                    </>
                )}
                {tab === 'style' && <StyleTab type={block.type} payload={data.payload} setP={setP} pickers={pickers} />}
                {tab === 'visibility' && (
                    <>
                        <Switch checked={data.is_visible} onChange={(v) => setData('is_visible', v)} label="Visible" description="Hidden sections are kept but not shown." />
                        <Field label="Show to"><Select value={data.city_scope} onChange={(e) => setData('city_scope', e.target.value)}><option value="">Everyone</option>{cities.map((c) => <option key={c} value={c}>{c} only</option>)}</Select></Field>
                        {app ? (
                            <Field label="Show on"><Segmented value={String(data.payload.channel ?? 'both')} onChange={(v) => setP('channel', v)} options={[{ value: 'both', label: 'Website + app' }, { value: 'web', label: 'Website' }, { value: 'app', label: 'App' }]} /></Field>
                        ) : (
                            <p className="bg-muted rounded-lg px-3 py-2 text-[13px]">Shown on the website. The apps show the original section types.</p>
                        )}
                        <Field label="Devices (website)"><Segmented value={String(data.payload.hide_on ?? 'none')} onChange={(v) => setP('hide_on', v)} options={[{ value: 'none', label: 'All' }, { value: 'mobile', label: 'Hide on phones' }, { value: 'desktop', label: 'Phones only' }]} /></Field>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Show from" optional hint="Harare time"><Input type="datetime-local" value={String(data.payload.starts_at ?? '')} onChange={(e) => setP('starts_at', e.target.value || null)} /></Field>
                            <Field label="Hide after" optional><Input type="datetime-local" value={String(data.payload.ends_at ?? '')} onChange={(e) => setP('ends_at', e.target.value || null)} /></Field>
                        </div>
                        {block.type === 'banner' && <Switch checked={data.broadcast} onChange={(v) => setData('broadcast', v)} label="Also send as a push notification" description="Sent once to every customer when you save." />}
                    </>
                )}
            </div>
            <div className="bg-surface sticky bottom-0 flex items-center justify-between gap-2 rounded-b-xl border-t px-5 py-3">
                <span className="text-muted-foreground text-xs">{isDirty ? 'Unsaved changes' : data.is_visible ? 'Live' : 'Hidden'}</span>
                <div className="flex gap-2">
                    {isDirty && <Button variant="ghost" onClick={() => reset()}>Undo</Button>}
                    <Button disabled={processing || !isDirty} onClick={save}>{processing ? <Loader2 className="animate-spin" /> : null} Save</Button>
                </div>
            </div>
        </div>
    );
}

function StyleTab({ type, payload, setP, pickers }: { type: string; payload: Payload; setP: (k: string, v: unknown) => void; pickers: Pickers }) {
    const sections = STYLE_CONTROLS.filter((s) => !s.when || s.when(payload));
    const names = [...new Set(sections.map((s) => s.section))];
    const bg = backgroundCss(payload);
    const ov = overlayCss(payload);
    return (
        <>
            {(payload.bg_type === 'image' || payload.bg_type === 'gradient' || payload.bg_type === 'color') && (
                <div className="relative h-28 overflow-hidden rounded-lg border" style={bg}>
                    {ov && payload.bg_type === 'image' && <div className="absolute inset-0" style={{ background: ov }} />}
                    <div className={cn('relative flex h-full items-end p-3 text-sm font-bold', payload.text_tone === 'dark' ? 'text-[#222222]' : 'text-white')} style={payload.text_tone === 'custom' ? { color: String(payload.text_color ?? '#fff') } : undefined}>Preview text</div>
                </div>
            )}
            {names.map((n) => (
                <div key={n} className="grid gap-3 rounded-lg border p-3">
                    <div className="text-sm font-semibold">{n}</div>
                    {sections.filter((s) => s.section === n).flatMap((s) => s.controls).map((c) => {
                        // The hero keeps its classic dark look as an option (and has no "none").
                        const ctl: Ctl = type === 'hero' && c.k === 'bg_type' && c.t === 'segmented' ? { ...c, options: [['default', 'Classic'], ...c.options.filter(([v]) => v !== 'none')] } : c;
                        return <Control key={c.k + n} c={ctl} value={payload[c.k]} onChange={(v) => setP(c.k, v)} pickers={pickers} />;
                    })}
                </div>
            ))}
        </>
    );
}

function Control({ c, value, onChange, pickers }: { c: Ctl; value: unknown; onChange: (v: unknown) => void; pickers: Pickers }) {
    const hint = 'hint' in c ? c.hint : undefined;
    switch (c.t) {
        case 'text':
        case 'url':
            return <Field label={c.label} hint={hint}><Input value={String(value ?? '')} placeholder={c.placeholder} onChange={(e) => onChange(e.target.value)} /></Field>;
        case 'textarea':
            return <Field label={c.label} hint={hint}><Textarea value={String(value ?? '')} placeholder={c.placeholder} onChange={(e) => onChange(e.target.value)} rows={3} /></Field>;
        case 'number':
            return <Field label={c.label} hint={hint}><Input type="number" min={c.min} max={c.max} step={c.step} suffix={c.suffix} value={value === undefined || value === null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} /></Field>;
        case 'select':
            return <Field label={c.label} hint={hint}><Select value={String(value ?? c.options[0][0])} onChange={(e) => onChange(e.target.value)}>{c.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>;
        case 'segmented':
            return <Field label={c.label} hint={hint}><div className="max-w-full overflow-x-auto"><Segmented size="sm" value={String(value ?? c.options[0][0])} onChange={onChange} options={c.options.map(([v, l]) => ({ value: v, label: l }))} /></div></Field>;
        case 'toggle':
            return <Switch checked={!!value} onChange={onChange} label={c.label} description={hint} />;
        case 'color':
            return (
                <Field label={c.label}>
                    <div className="flex items-center gap-2">
                        <input type="color" value={/^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#1c1c1c'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border" />
                        <Input value={String(value ?? '')} placeholder="#1C1C1C" onChange={(e) => onChange(e.target.value)} className="font-mono" />
                        {['#1C1C1C', '#17C74A', '#FDE500', '#DF302D', '#FFFFFF'].map((col) => <button key={col} type="button" onClick={() => onChange(col)} className="size-6 shrink-0 rounded-full border-2 border-white shadow ring-1 ring-black/10" style={{ background: col }} aria-label={col} />)}
                    </div>
                </Field>
            );
        case 'range': {
            const v = Number(value ?? c.min);
            const shown = c.format === 'pct' ? `${Math.round(v * 100)}%` : c.format === 'deg' ? `${v}°` : c.format === 'px' ? `${v}px` : String(v);
            return <Field label={<span className="flex justify-between"><span>{c.label}</span><span className="tabular text-muted-foreground">{shown}</span></span>}><input type="range" min={c.min} max={c.max} step={c.step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--color-brand)]" /></Field>;
        }
        case 'datetime':
            return <Field label={c.label} hint={hint}><Input type="datetime-local" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)} /></Field>;
        case 'image':
            return <ImageControl label={c.label} hint={hint} value={value ? String(value) : ''} onChange={onChange} />;
        case 'icon': {
            const I = ICONS[String(value ?? '')];
            return <Field label={c.label}><div className="flex items-center gap-2"><span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">{I ? <I className="size-5" /> : null}</span><Select value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}><option value="">None</option>{ICON_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div></Field>;
        }
        case 'stores':
        case 'dishes':
            return <PickerControl kind={c.t} label={c.label} value={Array.isArray(value) ? (value as number[]) : []} onChange={onChange} pickers={pickers} />;
        case 'list':
            return <ListControl c={c} value={Array.isArray(value) ? (value as Payload[]) : []} onChange={onChange} pickers={pickers} />;
    }
}

function ImageControl({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: unknown) => void }) {
    const [busy, setBusy] = useState<number | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const pick = async (f: File | undefined) => {
        if (!f) return;
        setErr(null);
        setBusy(0);
        try {
            const r = await uploadFile<{ url: string }>('/admin/home-builder/upload', f, setBusy);
            onChange(r.url);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setBusy(null);
        }
    };
    return (
        <Field label={label} hint={err ? undefined : hint} error={err ?? undefined}>
            <div className="flex items-center gap-3">
                <div className="bg-muted relative flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border">{value ? <img src={value} alt="" className="size-full object-cover" /> : <ImagePlus className="text-muted-foreground size-5" />}</div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                    <label className="hover:bg-muted inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-medium">
                        {busy !== null ? <><Loader2 className="size-4 animate-spin" /> {busy}%</> : <><ImagePlus className="size-4" /> {value ? 'Replace' : 'Upload'}</>}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {value && <Button size="sm" variant="ghost" onClick={() => onChange('')}><X /> Remove</Button>}
                </div>
            </div>
        </Field>
    );
}

function PickerControl({ kind, label, value, onChange, pickers }: { kind: 'stores' | 'dishes'; label: string; value: number[]; onChange: (v: unknown) => void; pickers: Pickers }) {
    const [q, setQ] = useState('');
    const all = useMemo(() => (kind === 'stores' ? pickers.vendors.map((v) => ({ id: v.id, name: v.name, sub: `${v.city}${v.status !== 'active' ? ' · pending' : ''}` })) : pickers.items.map((i) => ({ id: i.id, name: i.name, sub: i.vendor?.name ?? '' }))), [kind, pickers]);
    const byId = new Map(all.map((x) => [x.id, x]));
    const results = q.length > 0 ? all.filter((x) => !value.includes(x.id) && `${x.name} ${x.sub}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
    const move = (i: number, d: number) => {
        const next = [...value];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        onChange(next);
    };
    return (
        <Field label={label} hint={value.length ? `${value.length} chosen` : 'Search and add.'}>
            <div className="grid gap-2">
                {value.map((id, i) => (
                    <div key={id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
                        <span className="min-w-0 flex-1 truncate">{byId.get(id)?.name ?? `#${id} (not available)`}<span className="text-muted-foreground text-xs"> · {byId.get(id)?.sub}</span></span>
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                        <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                        <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="text-muted-foreground hover:text-zred" aria-label="Remove"><X className="size-3.5" /></button>
                    </div>
                ))}
                <div className="relative">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'stores' ? 'Search stores…' : 'Search dishes…'} />
                    {results.length > 0 && (
                        <ul className="bg-surface absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-(--shadow-pop)">
                            {results.map((r) => <li key={r.id}><button type="button" onClick={() => { onChange([...value, r.id]); setQ(''); }} className="hover:bg-muted flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left text-sm"><span className="font-medium">{r.name}</span><span className="text-muted-foreground text-xs">{r.sub}</span></button></li>)}
                        </ul>
                    )}
                </div>
            </div>
        </Field>
    );
}

function ListControl({ c, value, onChange, pickers }: { c: Extract<Ctl, { t: 'list' }>; value: Payload[]; onChange: (v: unknown) => void; pickers: Pickers }) {
    const [open, setOpen] = useState<number | null>(value.length ? 0 : null);
    const set = (i: number, k: string, v: unknown) => onChange(value.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
    const move = (i: number, d: number) => {
        const next = [...value];
        [next[i], next[i + d]] = [next[i + d], next[i]];
        onChange(next);
        setOpen(i + d);
    };
    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">{c.label}</span><span className="text-muted-foreground text-xs">{value.length}{c.max ? ` / ${c.max}` : ''}</span></div>
            {value.map((x, i) => (
                <div key={i} className="rounded-lg border">
                    <div className="flex items-center gap-2 px-3 py-2">
                        <button type="button" onClick={() => setOpen(open === i ? null : i)} className="min-w-0 flex-1 truncate text-left text-sm font-medium">{i + 1}. {String(x[c.summary] || 'Untitled')}</button>
                        <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move up"><ArrowUp className="size-3.5" /></button>
                        <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground disabled:opacity-30" aria-label="Move down"><ArrowDown className="size-3.5" /></button>
                        <button type="button" onClick={() => onChange([...value.slice(0, i + 1), { ...x }, ...value.slice(i + 1)])} disabled={!!c.max && value.length >= c.max} className="text-muted-foreground disabled:opacity-30" aria-label="Duplicate"><Copy className="size-3.5" /></button>
                        <button type="button" onClick={() => { onChange(value.filter((_, j) => j !== i)); setOpen(null); }} className="text-muted-foreground hover:text-zred" aria-label="Remove"><Trash2 className="size-3.5" /></button>
                    </div>
                    {open === i && <div className="grid gap-3 border-t p-3">{c.item.map((ic) => <Control key={ic.k} c={ic} value={x[ic.k]} onChange={(v) => set(i, ic.k, v)} pickers={pickers} />)}</div>}
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={!!c.max && value.length >= c.max} onClick={() => { onChange([...value, {}]); setOpen(value.length); }}><Plus /> {c.add}</Button>
        </div>
    );
}

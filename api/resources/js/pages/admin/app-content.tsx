import { Button } from '@/components/ui/button';
import { Badge, Card, Field, Input, Page, PageHeader, Segmented, Select, Switch, TabBar, Textarea, useConfirm } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { cn } from '@/lib/utils';
import { router, useForm } from '@inertiajs/react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Rocket, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Overlay = { type: 'none' | 'solid' | 'gradient'; from: string; to: string; opacity: number; direction: 'to_top' | 'to_bottom' | 'diagonal' };
interface Slide { id: number; app: string; image_path: string | null; heading: string | null; body: string | null; button_label: string | null; text_color: string; text_position: 'top' | 'middle' | 'bottom'; overlay: Overlay | null }
interface Launch { background?: string; gradient_to?: string | null; tagline?: string | null; text_color?: string; show_logo?: boolean; duration_ms?: number; image?: string | null }
interface Props {
    app: 'customer' | 'driver' | 'merchant';
    slides: Slide[];
    onboarding: { version: number; published_at: string | null; is_enabled: boolean; published: unknown[] };
    launch: { version: number; published_at: string | null; is_enabled: boolean; payload: Launch | null };
}

const DEFAULT_OVERLAY: Overlay = { type: 'gradient', from: '#000000', to: '#000000', opacity: 0.6, direction: 'to_top' };
const hexA = (hex: string, a: number) => `${hex}${Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')}`;

/** CSS for the overlay, matching how the apps draw it (expo-linear-gradient). */
export function overlayCss(o: Overlay | null): string {
    const v = o ?? DEFAULT_OVERLAY;
    if (v.type === 'none') return 'transparent';
    if (v.type === 'solid') return hexA(v.from, v.opacity);
    const dir = { to_top: 'to top', to_bottom: 'to bottom', diagonal: '135deg' }[v.direction];
    return `linear-gradient(${dir}, ${hexA(v.from, v.opacity)} 0%, ${hexA(v.to, v.opacity * 0.15)} 70%, ${hexA(v.to, 0)} 100%)`;
}

/** Admin → App onboarding: slides + launch screen per app, with a live phone preview. */
export default function AppContent(p: Props) {
    const [tab, setTab] = useState<'onboarding' | 'launch'>('onboarding');
    const [selected, setSelected] = useState<number | null>(p.slides[0]?.id ?? null);
    const [adding, setAdding] = useState(false);
    const confirm = useConfirm();
    const current = p.slides.find((s) => s.id === selected) ?? p.slides[0] ?? null;
    // Switching app (customer/driver/merchant) loads a different slide list: select its first slide.
    useEffect(() => {
        if (!p.slides.some((s) => s.id === selected)) setSelected(p.slides[0]?.id ?? null);
    }, [p.app, p.slides, selected]);

    /** Creates a slide straight away (so it shows in the list) and opens it in the editor. */
    const addSlide = () => {
        setAdding(true);
        router.post('/admin/app-content/slides', { app: p.app, heading: 'New slide', body: 'Tell people what makes this app great.', button_label: p.slides.length >= 2 ? 'Get started' : 'Next', text_color: '#FFFFFF', text_position: 'bottom', overlay: DEFAULT_OVERLAY }, {
            preserveScroll: true,
            onSuccess: (page) => {
                const slides = (page.props as unknown as Props).slides;
                setSelected(slides.reduce((m, s) => Math.max(m, s.id), 0) || null);
            },
            onFinish: () => setAdding(false),
        });
    };
    const draftChanged = useMemo(() => p.onboarding.version === 0 || p.slides.length !== p.onboarding.published.length, [p]);

    const move = (id: number, d: -1 | 1) => {
        const ids = p.slides.map((s) => s.id);
        const i = ids.indexOf(id);
        if (i + d < 0 || i + d >= ids.length) return;
        [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
        router.post('/admin/app-content/reorder', { ids }, { preserveScroll: true, preserveState: true });
    };

    return (
        <AdminLayout title="App onboarding">
            <Page wide>
                <PageHeader title="App onboarding & launch screen" description="Design what people see when they open the app. Publish and it updates in the apps on next launch, with no store update."
                    actions={tab === 'onboarding' && (
                        <Button onClick={async () => (await confirm({ title: `Publish onboarding to the ${p.app} app?`, description: 'Everyone sees the new version on their next launch, including people who saw the previous one.', confirmLabel: 'Publish' })) && router.post('/admin/app-content/publish', { app: p.app, is_enabled: true }, { preserveScroll: true })}>
                            <Rocket /> Publish{p.onboarding.version ? ` v${p.onboarding.version + 1}` : ''}
                        </Button>
                    )} />
                <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={p.app} onChange={(v) => router.get('/admin/app-content', { app: v })} options={[{ value: 'customer', label: 'Customer app' }, { value: 'driver', label: 'Driver app' }, { value: 'merchant', label: 'Merchant app' }]} />
                    <TabBar value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: 'onboarding', label: 'Onboarding', count: p.slides.length }, { value: 'launch', label: 'Launch screen' }]} />
                    {tab === 'onboarding' && (p.onboarding.version ? <Badge tone="success">Live: v{p.onboarding.version} · {new Date(p.onboarding.published_at!).toLocaleString('en-ZW')}</Badge> : <Badge tone="warning">Not published yet</Badge>)}
                    {tab === 'onboarding' && p.onboarding.version > 0 && draftChanged && <Badge tone="warning">Unpublished changes</Badge>}
                </div>

                {tab === 'onboarding' ? (
                    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
                        <Card padded className="grid min-w-0 content-start gap-2 self-start">
                            {p.slides.length === 0 && <p className="text-muted-foreground px-1 py-2 text-sm">No slides yet for the {p.app} app.</p>}
                            {p.slides.map((s, i) => (
                                <div key={s.id} className={cn('flex min-w-0 items-center gap-2 rounded-lg border p-2', current?.id === s.id ? 'border-brand bg-brand-50 dark:bg-brand/10' : 'hover:bg-subtle')}>
                                    <button onClick={() => setSelected(s.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                        <span className="bg-muted size-10 shrink-0 overflow-hidden rounded-md">{s.image_path && <img src={s.image_path} alt="" className="size-full object-cover" />}</span>
                                        <span className="min-w-0"><span className="block truncate text-sm font-medium">{s.heading || `Slide ${i + 1}`}</span><span className="text-muted-foreground block truncate text-xs">{s.body}</span></span>
                                    </button>
                                    <div className="flex flex-col">
                                        <button aria-label="Move up" onClick={() => move(s.id, -1)} className="text-muted-foreground hover:text-foreground"><ArrowUp className="size-3.5" /></button>
                                        <button aria-label="Move down" onClick={() => move(s.id, 1)} className="text-muted-foreground hover:text-foreground"><ArrowDown className="size-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                            <Button variant="outline" disabled={adding} onClick={addSlide}><Plus /> {adding ? 'Adding…' : 'Add slide'}</Button>
                            <p className="text-muted-foreground text-xs">Tip: 3 slides works best. Use tall photos (at least 1080×1920).</p>
                        </Card>
                        {current ? (
                            <SlideEditor key={current.id} app={p.app} slide={current}
                                onDelete={async (s) => (await confirm({ title: 'Delete this slide?', tone: 'danger', confirmLabel: 'Delete' })) && router.delete(`/admin/app-content/slides/${s.id}`, { preserveScroll: true, onSuccess: () => setSelected(p.slides.find((x) => x.id !== s.id)?.id ?? null) })} />
                        ) : (
                            <Card padded className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                                <p className="font-semibold">Add the first onboarding slide</p>
                                <p className="text-muted-foreground max-w-sm text-sm">People see these full-screen slides the first time they open the {p.app} app.</p>
                                <Button disabled={adding} onClick={addSlide}><Plus /> Add slide</Button>
                            </Card>
                        )}
                    </div>
                ) : (
                    <LaunchEditor app={p.app} launch={p.launch} />
                )}
            </Page>
        </AdminLayout>
    );
}

function SlideEditor({ app, slide, onDelete }: { app: string; slide: Slide | null; onDelete: (s: Slide) => void }) {
    const { data, setData, post, processing, errors } = useForm({
        app,
        heading: slide?.heading ?? 'Hungry? We’ve got you.',
        body: slide?.body ?? 'Order from the best restaurants near you, delivered fast.',
        button_label: slide?.button_label ?? 'Next',
        text_color: slide?.text_color ?? '#FFFFFF',
        text_position: slide?.text_position ?? 'bottom',
        overlay: (slide?.overlay ?? DEFAULT_OVERLAY) as Overlay,
        image: null as File | null,
    });
    const [preview, setPreview] = useState<string | null>(slide?.image_path ?? null);
    useEffect(() => {
        if (!data.image) return;
        const u = URL.createObjectURL(data.image);
        setPreview(u);
        return () => URL.revokeObjectURL(u);
    }, [data.image]);
    const o = data.overlay;
    const setO = (k: keyof Overlay, v: string | number) => setData('overlay', { ...o, [k]: v });
    const err = (k: string) => (errors as Record<string, string>)[k];

    return (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card padded className="grid min-w-0 content-start gap-4">
                <div className="flex items-center justify-between"><h3 className="font-semibold">{slide ? 'Edit slide' : 'New slide'}</h3>{slide && <Button variant="ghost" size="sm" className="text-zred" onClick={() => onDelete(slide)}><Trash2 /> Delete</Button>}</div>
                <Field label="Full-screen photo" error={err('image')}>
                    <label className="hover:bg-subtle flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
                        <ImagePlus className="size-5" />{data.image ? data.image.name : preview ? 'Replace photo' : 'Upload photo (JPG/PNG, up to 8 MB)'}
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => setData('image', e.target.files?.[0] ?? null)} />
                    </label>
                </Field>
                <Field label="Heading" error={err('heading')}><Input value={data.heading} onChange={(e) => setData('heading', e.target.value)} maxLength={80} /></Field>
                <Field label="Text" error={err('body')}><Textarea value={data.body} onChange={(e) => setData('body', e.target.value)} maxLength={240} rows={3} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Button label"><Input value={data.button_label} onChange={(e) => setData('button_label', e.target.value)} maxLength={30} placeholder="Next / Get started" /></Field>
                    <Field label="Text colour"><Input type="color" value={data.text_color} onChange={(e) => setData('text_color', e.target.value.toUpperCase())} className="h-10 p-1" /></Field>
                </div>
                <Field label="Text position"><Segmented value={data.text_position} onChange={(v) => setData('text_position', v as Slide['text_position'])} options={[{ value: 'top', label: 'Top' }, { value: 'middle', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }]} /></Field>
                <div className="grid gap-3 rounded-lg border p-3">
                    <div className="text-sm font-semibold">Overlay (keeps text readable)</div>
                    <Segmented value={o.type} onChange={(v) => setO('type', v)} options={[{ value: 'gradient', label: 'Gradient' }, { value: 'solid', label: 'Solid' }, { value: 'none', label: 'None' }]} />
                    {o.type !== 'none' && (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={o.type === 'gradient' ? 'Colour 1' : 'Colour'}><Input type="color" value={o.from} onChange={(e) => setO('from', e.target.value)} className="h-10 p-1" /></Field>
                                {o.type === 'gradient' && <Field label="Colour 2"><Input type="color" value={o.to} onChange={(e) => setO('to', e.target.value)} className="h-10 p-1" /></Field>}
                            </div>
                            <Field label={`Opacity ${Math.round(o.opacity * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={o.opacity} onChange={(e) => setO('opacity', Number(e.target.value))} className="accent-[var(--color-brand)] w-full" /></Field>
                            {o.type === 'gradient' && <Field label="Direction"><Select value={o.direction} onChange={(e) => setO('direction', e.target.value)}><option value="to_top">Bottom to top</option><option value="to_bottom">Top to bottom</option><option value="diagonal">Diagonal</option></Select></Field>}
                        </>
                    )}
                </div>
                <Button disabled={processing} onClick={() => post(slide ? `/admin/app-content/slides/${slide.id}` : '/admin/app-content/slides', { forceFormData: true, preserveScroll: true })}>Save slide</Button>
            </Card>
            <PhonePreview>
                {preview && <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />}
                {!preview && <div className="bg-muted absolute inset-0 flex items-center justify-center text-xs text-neutral-400">No photo yet</div>}
                <div className="absolute inset-0" style={{ background: overlayCss(o) }} />
                <div className={cn('absolute inset-x-0 flex flex-col gap-2 px-5', data.text_position === 'top' ? 'top-14' : data.text_position === 'middle' ? 'top-1/2 -translate-y-1/2' : 'bottom-20')} style={{ color: data.text_color }}>
                    <div className="text-[22px] leading-tight font-extrabold tracking-tight">{data.heading}</div>
                    <div className="text-[13px] leading-snug opacity-90">{data.body}</div>
                </div>
                <div className="absolute inset-x-5 bottom-6 flex items-center justify-between">
                    <div className="flex gap-1"><span className="bg-brand h-1.5 w-5 rounded-full" /><span className="size-1.5 rounded-full bg-white/60" /><span className="size-1.5 rounded-full bg-white/60" /></div>
                    <span className="bg-brand text-on-brand rounded-full px-4 py-2 text-xs font-bold">{data.button_label || 'Next'}</span>
                </div>
            </PhonePreview>
        </div>
    );
}

function LaunchEditor({ app, launch }: { app: string; launch: Props['launch'] }) {
    const l = launch.payload ?? {};
    const { data, setData, post, processing } = useForm({
        app, is_enabled: launch.version ? launch.is_enabled : true, background: l.background ?? '#FFFFFF', gradient_to: l.gradient_to ?? '', tagline: l.tagline ?? 'Zimbabwe’s favourite food, delivered.',
        text_color: l.text_color ?? '#222222', show_logo: l.show_logo ?? true, duration_ms: l.duration_ms ?? 1500, image: null as File | null, remove_image: false as boolean,
    });
    const [img, setImg] = useState<string | null>(l.image ?? null);
    useEffect(() => {
        if (!data.image) return;
        const u = URL.createObjectURL(data.image);
        setImg(u);
        return () => URL.revokeObjectURL(u);
    }, [data.image]);
    const bg = data.gradient_to ? `linear-gradient(180deg, ${data.background}, ${data.gradient_to})` : data.background;

    return (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <Card padded className="grid min-w-0 content-start gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Launch screen <span className="text-muted-foreground text-sm font-normal">· shown for a moment straight after the built-in splash</span></h3>
                    {launch.version ? <Badge tone="success">Live v{launch.version}</Badge> : <Badge>Off</Badge>}
                </div>
                <Switch checked={data.is_enabled} onChange={(v) => setData('is_enabled', v)} label="Show the launch screen" />
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Background"><Input type="color" value={data.background} onChange={(e) => setData('background', e.target.value.toUpperCase())} className="h-10 p-1" /></Field>
                    <Field label="Gradient to" optional hint="Leave empty for a solid colour"><div className="flex gap-2"><Input type="color" value={data.gradient_to || data.background} onChange={(e) => setData('gradient_to', e.target.value.toUpperCase())} className="h-10 p-1" />{data.gradient_to && <Button variant="ghost" size="sm" onClick={() => setData('gradient_to', '')}>Clear</Button>}</div></Field>
                    <Field label="Text colour"><Input type="color" value={data.text_color} onChange={(e) => setData('text_color', e.target.value.toUpperCase())} className="h-10 p-1" /></Field>
                    <Field label="Show for"><Input type="number" suffix="ms" min={600} max={4000} step={100} value={data.duration_ms} onChange={(e) => setData('duration_ms', Number(e.target.value))} /></Field>
                </div>
                <Field label="Tagline" optional><Input value={data.tagline} onChange={(e) => setData('tagline', e.target.value)} maxLength={80} /></Field>
                <Field label="Background photo" optional hint="Replaces the colour. The logo and tagline sit on top.">
                    <div className="flex items-center gap-2">
                        <label className="hover:bg-subtle flex flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-sm"><ImagePlus className="size-5" />{data.image ? data.image.name : img ? 'Replace photo' : 'Upload photo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => { setData('image', e.target.files?.[0] ?? null); setData('remove_image', false); }} /></label>
                        {img && <Button variant="ghost" size="sm" onClick={() => { setImg(null); setData({ ...data, image: null, remove_image: true }); }}>Remove</Button>}
                    </div>
                </Field>
                <Switch checked={data.show_logo} onChange={(v) => setData('show_logo', v)} label="Show the Zvino logo" />
                <Button disabled={processing} onClick={() => post('/admin/app-content/launch', { forceFormData: true, preserveScroll: true })}><Rocket /> Save & publish</Button>
            </Card>
            <PhonePreview>
                <div className="absolute inset-0" style={{ background: bg }} />
                {img && <img src={img} alt="" className="absolute inset-0 size-full object-cover" />}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center" style={{ color: data.text_color }}>
                    {data.show_logo && <img src="/brand/logo-square.png" alt="" className="w-36" />}
                    {data.tagline && <div className="text-sm font-semibold">{data.tagline}</div>}
                </div>
            </PhonePreview>
        </div>
    );
}

function PhonePreview({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex justify-center">
            <div className="h-[560px] w-[280px] rounded-[44px] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl xl:sticky xl:top-24 xl:h-[600px] xl:w-[300px]">
                <div className="relative size-full overflow-hidden rounded-[34px] bg-white">
                    {children}
                    <div className="absolute top-2 left-1/2 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />
                </div>
                <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1 text-xs"><Smartphone className="size-3.5" /> Live preview</p>
            </div>
        </div>
    );
}

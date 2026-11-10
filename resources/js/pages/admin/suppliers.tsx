import { Button } from '@/components/ui/button';
import { Badge, Card, Checkbox, EmptyState, Field, Input, Modal, Page, PageHeader, SearchInput, Segmented, Select, Switch, Thumb } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { cn } from '@/lib/utils';
import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2, MapPin, Percent, RefreshCw, Store, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Tab = 'overview' | 'categories' | 'products' | 'stores';
type MarkupType = 'percent' | 'fixed';
interface SyncStatus { state: 'running' | 'done' | 'failed'; step?: string; done?: number; total?: number | null; products?: number; started_at?: string; finished_at?: string; error?: string; trigger?: string; stores_created?: number; retired?: number; stores_updated?: number }
interface Source { id: number; name: string; enabled: boolean; store_name_pattern: string; markup_type: MarkupType; markup_value: number; group_by: 'category' | 'department'; hide_out_of_stock: boolean; weekly_sync: boolean; shopping_minutes: number; request_pause_ms: number; last_synced_at: string | null; sync_status: SyncStatus | null }
interface Aisle { id: number; slug: string; name: string; selected: boolean; synced: number; markup_type: MarkupType | null; markup_value: number | null }
interface Department extends Aisle { count: number; aisles: Aisle[] }
interface ProductRow { id: number; sku: string; name: string; category: string; department: string; image: string | null; active: boolean; cost_usd: number; sale_cost_usd: number | null; sell_usd: number; sale_sell_usd: number | null; sell_zig: number; markup: { type: MarkupType; value: number; from: string }; branches_in_stock: number }
interface StoreRow { id: number; branch: string; city: string | null; region: string | null; address: string | null; phone: string | null; hours: string | null; active: boolean; has_pin: boolean; vendor: { id: number; name: string; status: string; items: number; live_items: number } | null }
interface Paginated<T> { data: T[]; current_page: number; last_page: number; total: number; links: { url: string | null; label: string; active: boolean }[] }
interface Props {
    tab: Tab; source: Source; categories: Department[]; products: Paginated<ProductRow> | null; stores: StoreRow[];
    stats: { categories_selected: number; products: number; photos_pending: number; stores: number; published: number; rate: number };
    filters: { q?: string; category?: string; show?: string };
}

const URL = '/admin/suppliers/tmpnp';
const markupLabel = (t: MarkupType | null | undefined, v: number | null | undefined) => (!t ? 'Default' : t === 'percent' ? `+${v}%` : `+$${Number(v).toFixed(2)}`);
const ago = (iso: string | null | undefined) => {
    if (!iso) return 'never';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-ZW', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function Suppliers(p: Props) {
    const go = (tab: Tab) => router.get(URL, { tab }, { preserveScroll: true });
    return (
        <AdminLayout title="Suppliers">
            <Page wide>
                <PageHeader
                    eyebrow={<span className="inline-flex items-center gap-1"><Truck className="size-3.5" /> Supplier integration</span>}
                    title="TM Pick n Pay"
                    description="Products, prices and branches come straight from TM Pick n Pay’s live catalogue. Zvino shoppers buy at the nearest branch and deliver."
                    actions={<Segmented value={p.tab} onChange={go} options={[
                        { value: 'overview', label: 'Overview' },
                        { value: 'categories', label: 'Categories', count: p.stats.categories_selected },
                        { value: 'products', label: 'Products', count: p.stats.products },
                        { value: 'stores', label: 'Stores', count: p.stats.stores },
                    ]} />}
                />
                {p.tab === 'overview' && <Overview {...p} />}
                {p.tab === 'categories' && <Categories departments={p.categories} />}
                {p.tab === 'products' && <Products {...p} />}
                {p.tab === 'stores' && <Stores stores={p.stores} />}
            </Page>
        </AdminLayout>
    );
}

// ── Overview: sync status + settings ────────────────────────────────

function SyncCard({ source, stats, hasCategories }: { source: Source; stats: Props['stats']; hasCategories: boolean }) {
    const [s, setS] = useState(source.sync_status);
    useEffect(() => setS(source.sync_status), [source.sync_status]);
    const running = s?.state === 'running';
    useEffect(() => {
        if (!running) return;
        const t = setInterval(() => fetch(`${URL}/status`, { headers: { Accept: 'application/json' } }).then((r) => r.json()).then((d) => {
            setS(d.sync_status);
            if (d.sync_status?.state !== 'running') router.reload();
        }).catch(() => {}), 5000);
        return () => clearInterval(t);
    }, [running]);
    const pct = running && s?.total ? Math.round(((s.done ?? 0) / s.total) * 100) : null;

    return (
        <Card padded className="grid h-fit content-start gap-4 self-start">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-lg font-bold">
                        {running ? <Loader2 className="text-brand size-5 animate-spin" /> : s?.state === 'failed' ? <AlertTriangle className="text-zred size-5" /> : <CheckCircle2 className="text-brand size-5" />}
                        {running ? 'Syncing…' : s?.state === 'failed' ? 'Last sync failed' : 'Up to date'}
                    </div>
                    <div className="text-muted-foreground text-sm">Last full sync {ago(source.last_synced_at)} · {source.weekly_sync ? 'next: Monday 23:00' : 'weekly sync is off'}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => router.post(`${URL}/refresh`, {}, { preserveScroll: true })}><RefreshCw /> Reload categories & branches</Button>
                    <Button disabled={running || !hasCategories} onClick={() => router.post(`${URL}/sync`, {}, { preserveScroll: true })}><RefreshCw className={cn(running && 'animate-spin')} /> Sync products now</Button>
                </div>
            </div>
            {running && (
                <div>
                    <div className="mb-1 flex justify-between text-sm"><span>{s?.step}</span><span className="tabular">{s?.done ?? 0}/{s?.total ?? '…'} categories · {(s?.products ?? 0).toLocaleString()} products</span></div>
                    <div className="bg-muted h-2 overflow-hidden rounded-full"><div className="bg-brand h-full transition-all" style={{ width: `${pct ?? 5}%` }} /></div>
                    <div className="text-muted-foreground mt-1 text-xs">Runs gently in the background (one request at a time) — you can leave this page.</div>
                </div>
            )}
            {s?.state === 'failed' && <div className="bg-zred/10 text-zred rounded-lg px-3 py-2 text-sm">{s.error}</div>}
            {s?.state === 'done' && <div className="text-muted-foreground text-sm">Last run ({s.trigger}): {(s.products ?? 0).toLocaleString()} products checked{s.retired ? `, ${s.retired} no longer sold` : ''}{s.stores_created ? `, ${s.stores_created} new draft stores` : ''}, {s.stores_updated ?? 0} published stores updated.</div>}
            {!hasCategories && <div className="bg-gold/10 rounded-lg px-3 py-2 text-sm">Start here: <b>Reload categories & branches</b>, then tick the categories you want to sell on the <b>Categories</b> tab.</div>}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[['Categories selected', stats.categories_selected], ['Products', stats.products.toLocaleString()], ['Stores published', `${stats.published} / ${stats.stores}`], ['Photos still copying', stats.photos_pending.toLocaleString()]].map(([l, v]) => (
                    <div key={l as string} className="bg-muted/50 rounded-xl p-3"><div className="text-muted-foreground text-xs">{l}</div><div className="tabular text-xl font-bold">{v}</div></div>
                ))}
            </div>
        </Card>
    );
}

function Overview({ source, stats, categories }: Props) {
    const { data, setData, post, processing, errors } = useForm({
        enabled: source.enabled, store_name_pattern: source.store_name_pattern, markup_type: source.markup_type, markup_value: String(source.markup_value),
        group_by: source.group_by, hide_out_of_stock: source.hide_out_of_stock, weekly_sync: source.weekly_sync,
        shopping_minutes: String(source.shopping_minutes), request_pause_ms: String(source.request_pause_ms),
    });
    const example = 100;
    const sell = data.markup_type === 'percent' ? example * (1 + Number(data.markup_value || 0) / 100) : example + Number(data.markup_value || 0);

    return (
        <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
            <SyncCard source={source} stats={stats} hasCategories={categories.some((c) => c.selected || c.aisles.some((a) => a.selected))} />
            <Card padded className="grid h-fit content-start gap-4">
                <div className="font-bold">Settings</div>
                <Field label="Default markup" hint={`Used unless a category or product has its own. e.g. $${example} on the shelf → $${sell.toFixed(2)} on Zvino.`} error={errors.markup_value}>
                    <div className="flex gap-2">
                        <Select className="w-40" value={data.markup_type} onChange={(e) => setData('markup_type', e.target.value as MarkupType)}><option value="percent">Percent (%)</option><option value="fixed">Fixed ($ per item)</option></Select>
                        <Input type="number" step="0.01" value={data.markup_value} onChange={(e) => setData('markup_value', e.target.value)} />
                    </div>
                </Field>
                <Field label="Store name" hint="Each branch becomes a Zvino store. {branch} = e.g. Borrowdale." error={errors.store_name_pattern}>
                    <Input value={data.store_name_pattern} onChange={(e) => setData('store_name_pattern', e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Menu sections"><Select value={data.group_by} onChange={(e) => setData('group_by', e.target.value as 'category' | 'department')}><option value="category">By aisle</option><option value="department">By department</option></Select></Field>
                    <Field label="Shopping time" hint="Minutes to pick an order."><Input type="number" value={data.shopping_minutes} onChange={(e) => setData('shopping_minutes', e.target.value)} suffix="min" /></Field>
                </div>
                <Switch checked={data.hide_out_of_stock} onChange={(v) => setData('hide_out_of_stock', v)} label="Hide products out of stock at that branch" />
                <Switch checked={data.weekly_sync} onChange={(v) => setData('weekly_sync', v)} label="Update prices & stock every Monday at 23:00" />
                <Field label="Pause between requests to TM Pick n Pay" hint="Higher = gentler on their servers, slower sync. 1000 ms is a good default." error={errors.request_pause_ms}>
                    <Input type="number" min={300} max={10000} step={100} value={data.request_pause_ms} onChange={(e) => setData('request_pause_ms', e.target.value)} suffix="ms" />
                </Field>
                <div className="flex justify-end"><Button disabled={processing} onClick={() => post(`${URL}/settings`, { preserveScroll: true })}>Save settings</Button></div>
            </Card>
        </div>
    );
}

// ── Markup editor (category or products) ─────────────────────────────

function MarkupModal({ open, onClose, title, initial, onSave }: { open: boolean; onClose: () => void; title: string; initial?: { type: MarkupType | null; value: number | null }; onSave: (type: MarkupType | null, value: number) => void }) {
    const [type, setType] = useState<MarkupType | ''>(initial?.type ?? '');
    const [value, setValue] = useState(String(initial?.value ?? ''));
    useEffect(() => { if (open) { setType(initial?.type ?? ''); setValue(String(initial?.value ?? '')); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <Modal open={open} onClose={onClose} title={title} size="sm"
            footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(type || null, Number(value || 0))}>Save markup</Button></>}>
            <div className="grid gap-3">
                <Select value={type} onChange={(e) => setType(e.target.value as MarkupType | '')}>
                    <option value="">Use the default (inherit)</option>
                    <option value="percent">Percent on top of shelf price</option>
                    <option value="fixed">Fixed dollar amount per item</option>
                </Select>
                {type && <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} prefix={type === 'fixed' ? '$' : undefined} suffix={type === 'percent' ? '%' : undefined} autoFocus />}
                <p className="text-muted-foreground text-xs">Order of priority: product → aisle → department → default. Prices on published stores update automatically.</p>
            </div>
        </Modal>
    );
}

// ── Categories ───────────────────────────────────────────────────────

function Categories({ departments }: { departments: Department[] }) {
    const initial = useMemo(() => new Set(departments.flatMap((d) => [...(d.selected ? [d.slug] : []), ...d.aisles.filter((a) => a.selected).map((a) => a.slug)])), [departments]);
    const [sel, setSel] = useState<Set<string>>(initial);
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [editing, setEditing] = useState<Aisle | null>(null);
    useEffect(() => setSel(initial), [initial]);
    const toggle = (slug: string) => setSel((s) => { const n = new Set(s); if (n.has(slug)) n.delete(slug); else n.add(slug); return n; });
    const dirty = sel.size !== initial.size || [...sel].some((x) => !initial.has(x));

    if (!departments.length) return <Card><EmptyState icon={Store} title="No categories yet" description="Go to Overview and click “Reload categories & branches”." /></Card>;

    return (
        <div className="grid gap-3">
            <Card padded className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">Tick a <b>department</b> to sell everything in it, or open it and tick just some <b>aisles</b>. Then sync products.</div>
                <Button disabled={!dirty} onClick={() => router.post(`${URL}/categories`, { selected: [...sel] }, { preserveScroll: true })}>Save selection ({sel.size})</Button>
            </Card>
            <Card className="divide-y">
                {departments.map((d) => {
                    const isOpen = open.has(d.slug);
                    const some = d.aisles.some((a) => sel.has(a.slug));
                    return (
                        <div key={d.slug}>
                            <div className="flex items-center gap-3 px-4 py-3">
                                <button onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(d.slug)) n.delete(d.slug); else n.add(d.slug); return n; })} className="text-muted-foreground hover:text-foreground" aria-label="Show aisles">{isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</button>
                                <Checkbox checked={sel.has(d.slug)} indeterminate={!sel.has(d.slug) && some} onChange={() => toggle(d.slug)} />
                                <div className="min-w-0 flex-1"><div className="font-semibold">{d.name}</div><div className="text-muted-foreground text-xs">~{d.count.toLocaleString()} products at TM · {d.aisles.length} aisles{d.synced ? ` · ${d.synced.toLocaleString()} on Zvino` : ''}</div></div>
                                <Button variant="ghost" size="sm" onClick={() => setEditing(d)}><Percent /> {markupLabel(d.markup_type, d.markup_value)}</Button>
                            </div>
                            {isOpen && (
                                <div className="bg-muted/30 grid gap-0.5 px-4 py-2 pl-14">
                                    {d.aisles.map((a) => (
                                        <div key={a.slug} className="flex items-center gap-3 py-1">
                                            <Checkbox checked={sel.has(d.slug) || sel.has(a.slug)} onChange={() => !sel.has(d.slug) && toggle(a.slug)} />
                                            <span className={cn('flex-1 text-sm', sel.has(d.slug) && 'text-muted-foreground')}>{a.name}{a.synced ? <span className="text-muted-foreground"> · {a.synced}</span> : null}</span>
                                            <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>{markupLabel(a.markup_type, a.markup_value)}</Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </Card>
            <MarkupModal open={!!editing} onClose={() => setEditing(null)} title={`Markup: ${editing?.name ?? ''}`} initial={editing ? { type: editing.markup_type, value: editing.markup_value } : undefined}
                onSave={(type, value) => editing && router.post(`${URL}/categories/${editing.id}/markup`, { type, value }, { preserveScroll: true, onSuccess: () => setEditing(null) })} />
        </div>
    );
}

// ── Products ─────────────────────────────────────────────────────────

function Products({ products, categories, filters, stats }: Props) {
    const [q, setQ] = useState(filters.q ?? '');
    const [picked, setPicked] = useState<Set<number>>(new Set());
    const [modal, setModal] = useState(false);
    const filter = (x: Record<string, string | undefined>) => router.get(URL, { tab: 'products', ...filters, ...x }, { preserveState: true, replace: true });
    const rows = products?.data ?? [];
    const all = rows.length > 0 && rows.every((r) => picked.has(r.id));

    return (
        <div className="grid gap-3">
            <Card padded className="flex flex-wrap items-center gap-2">
                <SearchInput value={q} onChange={setQ} onSubmit={() => filter({ q })} placeholder="Search name or code…" className="w-64" />
                <Select className="w-56" value={filters.category ?? ''} onChange={(e) => filter({ category: e.target.value || undefined })}>
                    <option value="">All categories</option>
                    {categories.map((d) => <optgroup key={d.slug} label={d.name}><option value={d.slug}>All {d.name}</option>{d.aisles.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</optgroup>)}
                </Select>
                <Select className="w-48" value={filters.show ?? ''} onChange={(e) => filter({ show: e.target.value || undefined })}>
                    <option value="">On sale at Zvino</option><option value="custom">With their own markup</option><option value="inactive">No longer sold</option><option value="all">Everything</option>
                </Select>
                <div className="text-muted-foreground ml-auto text-sm">1 USD = {stats.rate} ZiG</div>
            </Card>
            {picked.size > 0 && (
                <Card padded className="border-brand bg-brand/5 flex items-center gap-3">
                    <span className="font-semibold">{picked.size} selected</span>
                    <Button size="sm" onClick={() => setModal(true)}><Percent /> Set markup</Button>
                    <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
                </Card>
            )}
            <Card>
                {!rows.length ? <EmptyState icon={Store} title="No products" description="Tick categories and run a sync to bring products in." /> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-muted-foreground border-b text-left text-xs"><tr>
                                <th className="w-10 px-4 py-2"><Checkbox checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                                <th className="py-2">Product</th><th className="px-3 py-2 text-right">Shelf (TM)</th><th className="px-3 py-2">Markup</th><th className="px-3 py-2 text-right">Zvino price</th><th className="px-3 py-2 text-right">Branches in stock</th>
                            </tr></thead>
                            <tbody className="divide-y">
                                {rows.map((r) => (
                                    <tr key={r.id} className={cn(!r.active && 'opacity-50')}>
                                        <td className="px-4 py-2"><Checkbox checked={picked.has(r.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} /></td>
                                        <td className="py-2"><div className="flex items-center gap-3"><Thumb src={r.image} size={40} /><div className="min-w-0"><div className="max-w-[340px] truncate font-medium">{r.name}</div><div className="text-muted-foreground text-xs">{r.sku} · {r.category}</div></div></div></td>
                                        <td className="tabular px-3 py-2 text-right">${r.cost_usd.toFixed(2)}{r.sale_cost_usd && <div className="text-brand text-xs">promo ${r.sale_cost_usd.toFixed(2)}</div>}</td>
                                        <td className="px-3 py-2"><Badge tone={r.markup.from === 'product' ? 'brand' : r.markup.from === 'default' ? 'neutral' : 'info'}>{markupLabel(r.markup.type, r.markup.value)} · {r.markup.from}</Badge></td>
                                        <td className="tabular px-3 py-2 text-right font-semibold">${r.sell_usd.toFixed(2)}<div className="text-muted-foreground text-xs font-normal">{zig(r.sell_zig)}</div></td>
                                        <td className="tabular px-3 py-2 text-right">{r.branches_in_stock}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {products && products.last_page > 1 && (
                    <div className="flex flex-wrap items-center justify-center gap-1 border-t p-3">
                        {products.links.map((l, i) => <Button key={i} size="sm" variant={l.active ? 'default' : 'ghost'} disabled={!l.url} onClick={() => l.url && router.get(l.url, {}, { preserveScroll: true })}><span dangerouslySetInnerHTML={{ __html: l.label }} /></Button>)}
                    </div>
                )}
            </Card>
            <MarkupModal open={modal} onClose={() => setModal(false)} title={`Markup for ${picked.size} product${picked.size === 1 ? '' : 's'}`}
                onSave={(type, value) => router.post(`${URL}/products/markup`, { ids: [...picked], type, value }, { preserveScroll: true, onSuccess: () => { setModal(false); setPicked(new Set()); } })} />
        </div>
    );
}

// ── Stores (branches) ────────────────────────────────────────────────

function Stores({ stores }: { stores: StoreRow[] }) {
    const [picked, setPicked] = useState<Set<number>>(new Set());
    const [city, setCity] = useState('');
    const cities = [...new Set(stores.map((s) => s.city).filter(Boolean))] as string[];
    const shown = stores.filter((s) => !city || s.city === city);
    const all = shown.length > 0 && shown.every((s) => picked.has(s.id));
    const act = (status: 'active' | 'pending', ids = [...picked]) => router.post(`${URL}/stores`, { ids, status }, { preserveScroll: true, onSuccess: () => setPicked(new Set()) });

    if (!stores.length) return <Card><EmptyState icon={MapPin} title="No branches yet" description="Go to Overview and click “Reload categories & branches”. Each branch becomes a draft Zvino store." /></Card>;

    return (
        <div className="grid gap-3">
            <Card padded className="flex flex-wrap items-center gap-2">
                <Select className="w-48" value={city} onChange={(e) => setCity(e.target.value)}><option value="">All cities ({stores.length})</option>{cities.map((c) => <option key={c} value={c}>{c} ({stores.filter((s) => s.city === c).length})</option>)}</Select>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" disabled={!picked.size} onClick={() => act('pending')}>Move to draft</Button>
                    <Button disabled={!picked.size} onClick={() => act('active')}>Publish {picked.size || ''}</Button>
                </div>
            </Card>
            <Card padded className="text-muted-foreground flex items-start gap-2 text-sm"><MapPin className="mt-0.5 size-4 shrink-0" /> TM’s map positions are only accurate to about 1 km. Before publishing, open each store and drag its pin to the exact building, so delivery distances and fees are right.</Card>
            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-muted-foreground border-b text-left text-xs"><tr>
                            <th className="w-10 px-4 py-2"><Checkbox checked={all} onChange={() => setPicked(all ? new Set() : new Set(shown.map((s) => s.id)))} /></th>
                            <th className="py-2">Zvino store</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Hours</th><th className="px-3 py-2 text-right">Products</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
                        </tr></thead>
                        <tbody className="divide-y">
                            {shown.map((s) => (
                                <tr key={s.id}>
                                    <td className="px-4 py-2"><Checkbox checked={picked.has(s.id)} onChange={() => setPicked((x) => { const n = new Set(x); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} /></td>
                                    <td className="py-2"><div className="font-medium">{s.vendor?.name ?? '—'}</div><div className="text-muted-foreground text-xs">{s.city}{s.address && ` · ${s.address}`}</div></td>
                                    <td className="px-3 py-2">{s.branch}{!s.active && <Badge tone="danger" className="ml-1">Closed by TM</Badge>}</td>
                                    <td className="text-muted-foreground px-3 py-2"><span className="inline-flex items-center gap-1"><Clock className="size-3" />{s.hours ?? '—'}</span></td>
                                    <td className="tabular px-3 py-2 text-right">{s.vendor ? `${s.vendor.live_items.toLocaleString()} / ${s.vendor.items.toLocaleString()}` : '—'}</td>
                                    <td className="px-3 py-2">{s.vendor?.status === 'active' ? <Badge tone="success">Published</Badge> : s.vendor?.status === 'suspended' ? <Badge tone="danger">Paused</Badge> : <Badge>Draft</Badge>}</td>
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                        {s.vendor && <Button size="sm" variant="ghost" asChild><Link href={`/admin/vendors/${s.vendor.id}`}><MapPin /> Edit / pin</Link></Button>}
                                        {s.vendor?.status === 'active' ? <Button size="sm" variant="ghost" onClick={() => act('pending', [s.id])}>Draft</Button> : <Button size="sm" variant="ghost" className="text-brand-700" onClick={() => act('active', [s.id])}>Publish</Button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}

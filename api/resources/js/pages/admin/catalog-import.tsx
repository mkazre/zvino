import { Button } from '@/components/ui/button';
import { Badge, Card, Checkbox, Field, Input, Page, PageHeader, Select, Switch, Thumb } from '@/components/z';
import AdminLayout from '@/layouts/admin-layout';
import { zig } from '@/lib/money';
import { Link, router, useForm } from '@inertiajs/react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, ShieldCheck, Upload } from 'lucide-react';
import { useState } from 'react';

interface StorePreview { id: number; name: string; new: number; updated: number; unchanged: number; switched_off: number; new_categories: string[]; price_changes: { name: string; from: number; to: number }[] }
interface Preview {
    token: string; file: string; rows: number; errors: string[]; error_count: number; vendor_ids: number[];
    options: { markup_pct: number; group_by: 'category' | 'department'; hide_out_of_stock: boolean; overwrite_details: boolean; deactivate_missing: boolean };
    stores: StorePreview[]; rate: number; out_of_stock: number; with_images: number;
    sample: { sku: string; name: string; category: string; image: string; cost_usd: number | null; price_zig: number; sale_zig: number | null; in_stock: boolean }[];
}
interface Props { vendors: { id: number; name: string }[]; selected: number | null; preview: Preview | null }

/** Admin → Catalog → Import products: upload a CSV, check the preview, then import. */
export default function CatalogImport({ vendors, selected, preview }: Props) {
    return (
        <AdminLayout title="Import products">
            <Page>
                <PageHeader
                    eyebrow={<Link href="/admin/catalog" className="hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Menu</Link>}
                    title="Import products"
                    description="Add or update many products at once from a CSV file (e.g. the TM Pick n Pay export). You’ll see exactly what changes before anything is saved."
                    actions={<Button variant="outline" asChild><a href="/admin/catalog/import/template"><Download /> Template CSV</a></Button>}
                />
                {preview ? <PreviewView p={preview} /> : <UploadForm vendors={vendors} selected={selected} />}
            </Page>
        </AdminLayout>
    );
}

function UploadForm({ vendors, selected }: { vendors: Props['vendors']; selected: number | null }) {
    const { data, setData, post, processing, errors } = useForm<{ file: File | null; vendor_ids: number[]; markup_pct: string; group_by: string; hide_out_of_stock: boolean; overwrite_details: boolean; deactivate_missing: boolean }>({
        file: null, vendor_ids: selected ? [selected] : vendors.length === 1 ? [vendors[0].id] : [], markup_pct: '0', group_by: 'category',
        hide_out_of_stock: true, overwrite_details: false, deactivate_missing: false,
    });
    const toggle = (id: number) => setData('vendor_ids', data.vendor_ids.includes(id) ? data.vendor_ids.filter((x) => x !== id) : [...data.vendor_ids, id]);
    const err = errors as Record<string, string | undefined>;

    return (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            <Card padded className="grid gap-5">
                <Field label="1. CSV file" error={err.file} hint="Up to 10 MB / 20,000 products. Columns: sku, name, price_usd (or price_zig) and optional category, image_url, size…">
                    <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-5 transition">
                        <FileSpreadsheet className="text-muted-foreground size-9 shrink-0" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{data.file ? data.file.name : 'Choose a .csv file'}</div>
                            <div className="text-muted-foreground text-sm">{data.file ? `${(data.file.size / 1024).toFixed(0)} KB` : 'From the TM Pick n Pay exporter, Excel (Save as CSV) or another system'}</div>
                        </div>
                        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setData('file', e.target.files?.[0] ?? null)} />
                    </label>
                </Field>

                <Field label="2. Add to these stores" error={err.vendor_ids} hint="Pick every branch that sells these products (e.g. each TM Pick n Pay branch you deliver from).">
                    <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
                        {vendors.map((v) => <div key={v.id} className="hover:bg-muted/50 rounded-lg px-2 py-1.5"><Checkbox checked={data.vendor_ids.includes(v.id)} onChange={() => toggle(v.id)} label={v.name} /></div>)}
                    </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="3. Price markup" hint="Added on top of the shelf price. 0 = same price as in the shop.">
                        <Input type="number" min={0} max={200} step="0.5" value={data.markup_pct} onChange={(e) => setData('markup_pct', e.target.value)} suffix="%" />
                    </Field>
                    <Field label="Menu sections" hint="How products are grouped in the store.">
                        <Select value={data.group_by} onChange={(e) => setData('group_by', e.target.value)}>
                            <option value="category">By aisle (Eggs, Milk, Bread…)</option>
                            <option value="department">By department (Perishables, Beverages…)</option>
                        </Select>
                    </Field>
                </div>

                <div className="grid gap-3">
                    <Switch checked={data.hide_out_of_stock} onChange={(v) => setData('hide_out_of_stock', v)} label="Hide products that are out of stock at every branch" description="They’re still imported, just switched off until the next import shows stock." />
                    <Switch checked={data.overwrite_details} onChange={(v) => setData('overwrite_details', v)} label="Also update names, descriptions, photos and sections of existing products" description="Off = only prices and stock change, so your own edits are kept." />
                    <Switch checked={data.deactivate_missing} onChange={(v) => setData('deactivate_missing', v)} label="Switch off imported products that aren’t in this file" description="Use when the file is the full, current list (e.g. a whole-store export)." />
                </div>

                <div className="flex justify-end">
                    <Button disabled={processing || !data.file || !data.vendor_ids.length} onClick={() => post('/admin/catalog/import/preview', { forceFormData: true })}><Upload /> {processing ? 'Checking…' : 'Check file'}</Button>
                </div>
            </Card>

            <Card padded className="h-fit text-sm">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="text-brand size-5" /> How it works</div>
                <ol className="text-muted-foreground mt-3 grid list-decimal gap-2 pl-5">
                    <li>Upload the file. Nothing is saved yet.</li>
                    <li>Check the preview: new products, price changes, problems.</li>
                    <li>Import. Products are matched by their code, so importing a newer file <b>updates prices</b> instead of making duplicates.</li>
                    <li>Photos are copied to Zvino in the background (only from approved sites).</li>
                </ol>
                <p className="text-muted-foreground mt-3">Prices in USD are converted to ZiG at today’s rate. Re-import regularly to keep prices current.</p>
            </Card>
        </div>
    );
}

function PreviewView({ p }: { p: Preview }) {
    const [busy, setBusy] = useState(false);
    const totalNew = p.stores.reduce((s, x) => s + x.new, 0);
    const totalUpd = p.stores.reduce((s, x) => s + x.updated, 0);
    const run = () => { setBusy(true); router.post('/admin/catalog/import/run', { token: p.token }, { onFinish: () => setBusy(false) }); };

    return (
        <div className="grid gap-5">
            <Card padded className="flex flex-wrap items-center gap-4">
                <FileSpreadsheet className="text-brand size-10" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-bold">{p.file}</div>
                    <div className="text-muted-foreground text-sm">{p.rows.toLocaleString()} products read · {p.with_images.toLocaleString()} with photos · {p.out_of_stock.toLocaleString()} out of stock everywhere · markup {p.options.markup_pct}% · 1 USD = {p.rate} ZiG</div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild><Link href="/admin/catalog/import">Start again</Link></Button>
                    <Button disabled={busy || (totalNew === 0 && totalUpd === 0 && !p.stores.some((s) => s.switched_off))} onClick={run}><CheckCircle2 /> {busy ? 'Importing…' : `Import ${totalNew.toLocaleString()} new · ${totalUpd.toLocaleString()} updates`}</Button>
                </div>
            </Card>

            {p.error_count > 0 && (
                <Card padded className="border-gold/50 bg-gold/5">
                    <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="text-gold size-5" /> {p.error_count} line{p.error_count > 1 ? 's' : ''} skipped</div>
                    <ul className="text-muted-foreground mt-2 grid max-h-48 gap-0.5 overflow-y-auto text-sm">{p.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                    {p.error_count > p.errors.length && <div className="text-muted-foreground mt-1 text-xs">…and {p.error_count - p.errors.length} more.</div>}
                </Card>
            )}

            <div className="grid gap-3 md:grid-cols-2">
                {p.stores.map((s) => (
                    <Card key={s.id} padded>
                        <div className="font-bold">{s.name}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Badge tone="success">{s.new.toLocaleString()} new</Badge>
                            <Badge tone="info">{s.updated.toLocaleString()} price/stock updates</Badge>
                            <Badge>{s.unchanged.toLocaleString()} unchanged</Badge>
                            {s.switched_off > 0 && <Badge tone="warning">{s.switched_off} switched off</Badge>}
                        </div>
                        {s.new_categories.length > 0 && <div className="text-muted-foreground mt-3 text-sm">New sections: {s.new_categories.slice(0, 12).join(', ')}{s.new_categories.length > 12 && ` +${s.new_categories.length - 12} more`}</div>}
                        {s.price_changes.length > 0 && (
                            <div className="mt-3 grid gap-1 text-sm">
                                {s.price_changes.map((c, i) => <div key={i} className="flex justify-between gap-3"><span className="truncate">{c.name}</span><span className="tabular shrink-0">{zig(c.from)} → <b>{zig(c.to)}</b></span></div>)}
                            </div>
                        )}
                    </Card>
                ))}
            </div>

            <Card>
                <div className="border-b px-4 py-3 text-sm font-semibold">First products in the file</div>
                <div className="divide-y">
                    {p.sample.map((r) => (
                        <div key={r.sku} className="flex items-center gap-3 px-4 py-2.5">
                            <Thumb src={r.image} size={44} />
                            <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{r.name}</div>
                                <div className="text-muted-foreground truncate text-xs">{r.sku} · {r.category}{r.cost_usd ? ` · shelf $${r.cost_usd.toFixed(2)}` : ''}</div>
                            </div>
                            {!r.in_stock && <Badge tone="warning">Out of stock</Badge>}
                            <div className="tabular text-right text-sm font-semibold">{r.sale_zig ? <><s className="text-muted-foreground mr-1 font-normal">{zig(r.price_zig)}</s>{zig(r.sale_zig)}</> : zig(r.price_zig)}</div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
}

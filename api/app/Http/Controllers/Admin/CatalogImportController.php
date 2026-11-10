<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Services\ProductImporter;
use App\Support\ProductCsv;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;

/**
 * Admin → Catalog → Import products. Two steps: upload a CSV and see exactly what will change
 * (nothing saved yet), then confirm. The checked rows wait in private storage for an hour.
 */
class CatalogImportController extends AdminController
{
    private const DIR = 'imports';

    public function show(Request $request, ProductImporter $importer)
    {
        $pending = $request->query('token') ? $this->pending($request, (string) $request->query('token')) : null;

        return Inertia::render('admin/catalog-import', [
            'vendors' => $this->vendorOptions($request),
            'selected' => $request->integer('vendor_id') ?: null,
            'preview' => $pending ? [
                'token' => $pending['token'],
                'file' => $pending['file'],
                'rows' => count($pending['rows']),
                'errors' => array_slice($pending['errors'], 0, 50),
                'error_count' => count($pending['errors']),
                'options' => $importer->options($pending['options']),
                'vendor_ids' => $pending['vendor_ids'],
            ] + $importer->preview($pending['rows'], $pending['vendor_ids'], $pending['options']) : null,
        ]);
    }

    public function template()
    {
        return response(ProductCsv::template(), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="zvino-products-template.csv"',
        ]);
    }

    public function preview(Request $request)
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:10240'],
            'vendor_ids' => ['required', 'array', 'min:1'],
            'vendor_ids.*' => ['integer', 'exists:vendors,id'],
            'markup_pct' => ['nullable', 'numeric', 'between:0,200'],
            'group_by' => ['nullable', 'in:category,department'],
            'hide_out_of_stock' => ['boolean'],
            'overwrite_details' => ['boolean'],
            'deactivate_missing' => ['boolean'],
        ], ['file.max' => 'The file must be 10 MB or smaller.', 'file.mimes' => 'Upload a .csv file.', 'vendor_ids.required' => 'Choose at least one store.']);
        $vendorIds = array_values(array_unique(array_map('intval', $data['vendor_ids'])));
        foreach ($vendorIds as $id) {
            $this->authorizeVendor($request, $id);
        }

        $csv = ProductCsv::read($request->file('file')->getRealPath());
        if (! $csv['rows']) {
            return back()->withErrors(['file' => $csv['errors'][0] ?? 'No products found in the file.']);
        }

        $token = Str::random(40);
        Storage::disk('local')->put(self::DIR."/$token.json", json_encode([
            'user_id' => $request->user()->id,
            'created' => now()->timestamp,
            'file' => mb_substr($request->file('file')->getClientOriginalName(), 0, 120),
            'rows' => $csv['rows'],
            'errors' => $csv['errors'],
            'vendor_ids' => $vendorIds,
            'options' => collect($data)->only('markup_pct', 'group_by', 'hide_out_of_stock', 'overwrite_details', 'deactivate_missing')->all(),
        ]));
        $this->cleanup();

        return redirect("/admin/catalog/import?token=$token");
    }

    public function run(Request $request, ProductImporter $importer)
    {
        $pending = $this->pending($request, (string) $request->validate(['token' => ['required', 'string', 'size:40']])['token']);
        abort_unless($pending, 410, 'This preview has expired. Upload the file again.');
        foreach ($pending['vendor_ids'] as $id) {
            $this->authorizeVendor($request, $id);
        }

        $result = $importer->import($pending['rows'], $pending['vendor_ids'], $pending['options']);
        Storage::disk('local')->delete(self::DIR."/{$pending['token']}.json");
        AuditLog::record('catalog.imported', null, ['file' => $pending['file'], 'products' => count($pending['rows']), 'stores' => $result]);

        $new = array_sum(array_column($result, 'new'));
        $updated = array_sum(array_column($result, 'updated'));

        return redirect('/admin/catalog?vendor_id='.$pending['vendor_ids'][0])
            ->with('success', "Import done: $new new and $updated updated products across ".count($result).' store'.(count($result) > 1 ? 's' : '').'. Photos are being copied in the background.');
    }

    /** A preview this user made in the last hour. */
    private function pending(Request $request, string $token): ?array
    {
        if (! preg_match('/^[A-Za-z0-9]{40}$/', $token) || ! Storage::disk('local')->exists(self::DIR."/$token.json")) {
            return null;
        }
        $p = json_decode(Storage::disk('local')->get(self::DIR."/$token.json"), true);
        if (! $p || $p['user_id'] !== $request->user()->id || $p['created'] < now()->subHour()->timestamp) {
            return null;
        }

        return $p + ['token' => $token];
    }

    private function cleanup(): void
    {
        foreach (Storage::disk('local')->files(self::DIR) as $f) {
            if (Storage::disk('local')->lastModified($f) < now()->subHours(2)->timestamp) {
                Storage::disk('local')->delete($f);
            }
        }
    }
}

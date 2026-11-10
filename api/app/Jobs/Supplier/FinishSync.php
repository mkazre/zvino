<?php

namespace App\Jobs\Supplier;

use App\Models\SupplierProduct;
use App\Services\SupplierSync;

/** Step 3: retire products no longer sold, copy new photos, then refresh every published store. */
class FinishSync extends SupplierJob
{
    public function handle(SupplierSync $sync): void
    {
        $source = $this->source();
        $this->status(['step' => 'Updating store menus']);
        $retired = $sync->finishProducts($source, $this->runId);

        SupplierProduct::where('supplier_source_id', $source->id)->where('active', true)->whereNull('image_path')->whereNotNull('image_url')
            ->pluck('id')->chunk(60)->each(fn ($ids) => CopyPhotos::dispatch($ids->values()->all()));

        $stores = $sync->publishedLocations($source);
        foreach ($stores as $loc) {
            ApplyToStore::dispatch($source->id, $this->runId, $loc->id);
        }
        $source->update(['last_synced_at' => now()]);
        $this->status(['state' => 'done', 'step' => 'Finished', 'retired' => $retired, 'stores_updated' => $stores->count(), 'finished_at' => now()->toIso8601String()]);
    }
}

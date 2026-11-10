<?php

namespace App\Jobs\Supplier;

use App\Services\SupplierSync;

/** Step 1: departments/aisles and branches (new branches become draft Zvino stores). */
class SyncCatalogue extends SupplierJob
{
    public function handle(SupplierSync $sync): void
    {
        $source = $this->source();
        $this->status(['step' => 'Reading categories and branches']);
        $sync->categories($source);
        $stores = $sync->locations($source);
        // One job per ticked department/aisle, run one after another before FinishSync.
        $targets = $sync->targets($source);
        foreach (array_reverse($targets) as $t) {
            $this->prependToChain(new SyncProducts($source->id, $this->runId, $t));
        }
        $this->status(['stores_created' => $stores['created'], 'branches' => $stores['total'], 'total' => count($targets)]);
    }
}

<?php

namespace App\Jobs\Supplier;

use App\Services\SupplierSync;

/** Step 2 (one job per department/aisle): products, prices, photos links, branch stock. */
class SyncProducts extends SupplierJob
{
    public function __construct(int $sourceId, string $runId, public array $target)
    {
        parent::__construct($sourceId, $runId);
    }

    public function handle(SupplierSync $sync): void
    {
        $source = $this->source();
        $this->status(['step' => 'Products: '.$this->target['category']]);
        $n = $sync->products($source, $this->target, $this->runId);
        $s = $source->fresh()->sync_status ?? [];
        $this->status(['done' => ($s['done'] ?? 0) + 1, 'products' => ($s['products'] ?? 0) + $n]);
    }
}

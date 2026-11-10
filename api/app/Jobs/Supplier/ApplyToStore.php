<?php

namespace App\Jobs\Supplier;

use App\Models\SupplierLocation;
use App\Services\SupplierSync;

/** One Zvino store's menu: prices with markup, branch stock, sections. */
class ApplyToStore extends SupplierJob
{
    public function __construct(int $sourceId, string $runId, public int $locationId)
    {
        parent::__construct($sourceId, $runId);
    }

    public function handle(SupplierSync $sync): void
    {
        $loc = SupplierLocation::with('vendor')->find($this->locationId);
        if ($loc?->vendor) {
            $sync->applyToStore($this->source(), $loc);
        }
    }
}

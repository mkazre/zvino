<?php

namespace App\Jobs\Supplier;

use App\Jobs\ImportItemImages;
use App\Models\Item;
use App\Models\SupplierProduct;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/** Copy supplier photos onto Zvino (same safety checks as imports) and point the store menus at them. */
class CopyPhotos implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 2;
    public int $timeout = 600;

    public function __construct(public array $productIds)
    {
        $this->onQueue('supplier');
    }

    public function handle(): void
    {
        foreach (SupplierProduct::whereIn('id', $this->productIds)->whereNull('image_path')->whereNotNull('image_url')->get() as $p) {
            if ($path = ImportItemImages::fetch($p->image_url)) {
                $p->update(['image_path' => $path]);
                Item::where('supplier_product_id', $p->id)->update(['image_path' => $path]);
            }
            usleep(300_000); // a short pause between photos
        }
    }
}

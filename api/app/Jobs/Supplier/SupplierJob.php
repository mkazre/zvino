<?php

namespace App\Jobs\Supplier;

use App\Models\SupplierSource;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/** Shared bits for the supplier sync steps (small jobs, so shared hosting never times out). */
abstract class SupplierJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 900;
    public int $backoff = 60;

    public function __construct(public int $sourceId, public string $runId)
    {
        $this->onQueue('supplier'); // its own lane: never holds up order emails and alerts
    }

    protected function source(): SupplierSource
    {
        return SupplierSource::findOrFail($this->sourceId);
    }

    /** Merge progress into the source's sync status (shown on the admin page). */
    protected function status(array $changes): void
    {
        $s = $this->source();
        if (($s->sync_status['run_id'] ?? null) !== $this->runId) {
            return; // a newer run has started
        }
        $s->update(['sync_status' => array_merge($s->sync_status ?? [], $changes)]);
    }
}

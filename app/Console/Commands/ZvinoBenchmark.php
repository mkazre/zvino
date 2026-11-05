<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Http\Client\Pool;
use Illuminate\Support\Facades\Http;

/**
 * Quick load test from any machine with PHP: `php artisan zvino:benchmark --url=https://zvino.online -c 25 -r 500`.
 * Hits the busiest read endpoints (home, store list, menus, search) concurrently and reports latency.
 * For sustained / checkout tests use loadtest/k6.js.
 */
class ZvinoBenchmark extends Command
{
    protected $signature = 'zvino:benchmark {--url= : Base URL (defaults to APP_URL)} {--c|concurrency=20} {--r|requests=200}';
    protected $description = 'Concurrent latency test of the main customer endpoints';

    public function handle(): int
    {
        $base = rtrim($this->option('url') ?: config('app.url'), '/');
        $conc = max(1, (int) $this->option('concurrency'));
        $total = max($conc, (int) $this->option('requests'));

        $vendors = Http::acceptJson()->timeout(15)->get("$base/api/vendors")->json('data') ?? [];
        $ids = array_column($vendors, 'id') ?: [1];
        $paths = ['/api/config', '/api/home-layout', '/api/vendors', '/api/search?q=sadza', '/', '/stores'];
        foreach (array_slice($ids, 0, 5) as $id) {
            $paths[] = "/api/vendors/$id/menu";
        }

        $this->info("Load test: $total requests, $conc at a time → $base");
        $times = [];
        $errors = [];
        $started = microtime(true);
        for ($sent = 0; $sent < $total; $sent += $conc) {
            $batch = array_map(fn ($i) => $paths[($sent + $i) % count($paths)], range(0, min($conc, $total - $sent) - 1));
            $t0 = microtime(true);
            $responses = Http::pool(fn (Pool $pool) => array_map(fn ($p) => $pool->as($p.'#'.uniqid())->acceptJson()->timeout(30)->get($base.$p), $batch));
            foreach ($responses as $key => $res) {
                $path = explode('#', $key)[0];
                if ($res instanceof \Throwable || ! $res->successful()) {
                    $errors[$path] = ($errors[$path] ?? 0) + 1;

                    continue;
                }
                $times[$path][] = ($res->handlerStats()['total_time'] ?? (microtime(true) - $t0)) * 1000;
            }
        }
        $elapsed = microtime(true) - $started;

        $rows = [];
        $all = [];
        foreach ($times as $path => $t) {
            sort($t);
            $all = array_merge($all, $t);
            $rows[] = [$path, count($t), round($t[(int) floor(count($t) * 0.5)]), round($t[(int) min(count($t) - 1, floor(count($t) * 0.95))]), round(max($t)), $errors[$path] ?? 0];
        }
        $this->table(['Endpoint', 'OK', 'p50 ms', 'p95 ms', 'max ms', 'errors'], $rows);
        sort($all);
        $ok = count($all);
        $p95 = $ok ? round($all[(int) min($ok - 1, floor($ok * 0.95))]) : 0;
        $this->line(sprintf('Throughput: %.1f req/s · overall p95 %d ms · errors %d', $ok / max(0.001, $elapsed), $p95, array_sum($errors)));

        if (array_sum($errors) > 0 || $p95 > 1500) {
            $this->warn('Needs attention: errors or p95 above 1.5 s. Check DB indexes, enable OPcache and `php artisan optimize`.');

            return self::FAILURE;
        }
        $this->info('Healthy ✓');

        return self::SUCCESS;
    }
}

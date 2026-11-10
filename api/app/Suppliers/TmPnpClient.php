<?php

namespace App\Suppliers;

use Illuminate\Support\Facades\Http;

/**
 * TM Pick n Pay's public catalogue API (the one tmpnponline.co.zw itself uses). Read-only, one
 * request at a time with a short pause, so Zvino is a polite visitor.
 */
class TmPnpClient
{
    public const API = 'https://api.tmpnponline.co.zw/api/v1';
    public const CDN = 'https://cdn-s7m8bx8sebjz.vultrcdn.com/product_images/';
    public const SITE = 'https://tmpnponline.co.zw';

    /** $pauseMs null = the admin setting (Suppliers → Pause between requests), at least 300 ms. */
    public function __construct(private ?int $pauseMs = null) {}

    private function pause(): int
    {
        if (app()->environment('testing')) {
            return 0;
        }

        return $this->pauseMs ?? max(300, (int) (\App\Models\SupplierSource::where('key', 'tmpnp')->value('request_pause_ms') ?? 1000));
    }

    private function get(string $path): array
    {
        $res = Http::timeout(40)->retry(3, 3000, throw: false)
            ->withHeaders(['User-Agent' => 'ZvinoSupplierSync/1.0 (+https://zvino.online)', 'Accept' => 'application/json'])
            ->get(self::API.$path);
        if (! $res->successful() || ! is_array($res->json())) {
            throw new \RuntimeException("TM Pick n Pay didn't answer ($path: HTTP {$res->status()}).");
        }
        if ($pause = $this->pause()) {
            usleep($pause * 1000); // one request at a time, gently
        }

        return $res->json();
    }

    /** Departments with their aisles: [{slug, name, count, children:[{slug, name}]}]. */
    public function categories(): array
    {
        return collect($this->get('/subcategories'))->map(fn ($c) => [
            'slug' => $c['slug'],
            'name' => trim($c['name']),
            'count' => (int) ($c['products_count'] ?? 0),
            'children' => collect($c['subcategories'] ?? [])->pluck('child_category')->filter()
                ->map(fn ($k) => ['slug' => $k['slug'], 'name' => trim($k['name'])])->values()->all(),
        ])->all();
    }

    /** Physical branches: [{id, name, city, address, phone, lat, lng, opens, closes, region, active}]. */
    public function locations(): array
    {
        $out = [];
        foreach ($this->get('/location-groups') as $group) {
            foreach ($group['locations'] ?? [] as $l) {
                $out[] = [
                    'id' => (string) $l['id'],
                    'name' => trim($l['name']),
                    'region' => trim(ucwords(strtolower(str_replace(['REGION', 'ZIMBABWE'], '', $group['name'] ?? '')))) ?: null,
                    'city' => $l['city'] ? ucwords(strtolower(trim($l['city']))) : null,
                    'address' => trim((string) $l['street']) ?: null,
                    'phone' => $l['phone'] ? '+'.ltrim(preg_replace('/\D/', '', $l['phone']), '+') : null,
                    'lat' => is_numeric($l['latitude'] ?? null) ? (float) $l['latitude'] : null,
                    'lng' => is_numeric($l['longitude'] ?? null) ? (float) $l['longitude'] : null,
                    'opens' => $l['opening_hour'] ?? null,
                    'closes' => $l['closing_hour'] ?? null,
                    'active' => ($l['status'] ?? 'active') === 'active' && ! ($l['deleted_at'] ?? null),
                ];
            }
        }

        return $out;
    }

    /** Every product listed under a department or aisle (all pages). */
    public function products(string $slug): \Generator
    {
        $page = 1;
        do {
            $d = $this->get('/product/search-product/'.rawurlencode($slug).'/1000000/0?page='.$page);
            foreach ($d['data'] ?? [] as $p) {
                yield $p;
            }
            $last = (int) ($d['last_page'] ?? 1);
            $page++;
        } while ($page <= $last && $page <= 500);
    }

    /** "TM PICK n PAY COWDRAY PARK" → "Cowdray Park". */
    public static function branchName(string $name): string
    {
        $n = trim(preg_replace('/^(TM\s+)?PICK\s*N\s*PAY\s*/i', '', $name));

        return ucwords(strtolower($n ?: $name));
    }

    /** "KOHINOOR EVERYDAY BASMATI RICE 5KGX" → "Kohinoor Everyday Basmati Rice 5kg". */
    public static function tidyName(string $name): string
    {
        $n = preg_replace('/\s+/', ' ', trim($name));
        $n = preg_replace('/(\d)(KG|G|ML|L|LT|LTR)X\b/i', '$1$2', $n);
        $upper = preg_match_all('/[A-Z]/', $n);
        if ($upper > mb_strlen($n) * 0.6) {
            $n = implode(' ', array_map(fn ($w) => preg_match('/\d/', $w) ? $w : ucfirst($w), explode(' ', strtolower($n))));
        }
        $n = preg_replace_callback('/(\d+(?:[.,]\d+)?)\s*(KG|G|GR|ML|L|LT|LTR)\b/i', fn ($m) => $m[1].str_replace(['ltr', 'lt', 'gr'], ['l', 'l', 'g'], strtolower($m[2])), $n);

        return mb_substr(preg_replace("/(\d+)'S\b/i", "$1's", $n), 0, 120);
    }

    public static function text(?string $s): ?string
    {
        $s = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags((string) $s), ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return in_array(strtolower($s), ['', 'null', 'none', 'n/a', '-'], true) ? null : mb_substr($s, 0, 500);
    }
}

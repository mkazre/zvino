<?php

namespace App\Support;

/**
 * Zvino product CSV (version 1): reads and checks a file before anything is saved.
 * Required columns: sku, name and a price (price_usd or price_zig). Everything else is optional;
 * unknown columns are ignored. The TM Pick n Pay scraper (tools/tmpnp-scraper) writes this format.
 */
class ProductCsv
{
    public const COLUMNS = [
        'sku', 'name', 'description', 'department', 'category', 'price_usd', 'sale_price_usd', 'price_zig',
        'image_url', 'weight_kg', 'volume_ml', 'width_cm', 'height_cm', 'sold_by', 'in_stock',
        'branches_in_stock', 'stock_by_branch', 'source', 'source_url',
    ];

    public const MAX_ROWS = 20000;

    /**
     * @return array{rows: array<int, array>, errors: array<int, string>, columns: string[]}
     */
    public static function read(string $path): array
    {
        $fh = fopen($path, 'r');
        if (! $fh) {
            return ['rows' => [], 'errors' => ['The file could not be opened.'], 'columns' => []];
        }
        $first = fgets($fh);
        rewind($fh);
        // Excel in some regions saves with semicolons.
        $sep = substr_count((string) $first, ';') > substr_count((string) $first, ',') ? ';' : ',';

        $head = fgetcsv($fh, 0, $sep, '"', '');
        if (! $head) {
            return ['rows' => [], 'errors' => ['The file is empty.'], 'columns' => []];
        }
        $head = array_map(fn ($h) => strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $head);
        $missing = array_diff(['sku', 'name'], $head);
        if ($missing || (! in_array('price_usd', $head, true) && ! in_array('price_zig', $head, true))) {
            fclose($fh);

            return ['rows' => [], 'errors' => ['Missing columns: '.implode(', ', [...$missing, ...(in_array('price_usd', $head, true) || in_array('price_zig', $head, true) ? [] : ['price_usd'])]).'. Download the template to see the format.'], 'columns' => $head];
        }

        $rows = [];
        $errors = [];
        $seen = [];
        $line = 1;
        while (($cells = fgetcsv($fh, 0, $sep, '"', '')) !== false) {
            $line++;
            if ($cells === [null] || ! array_filter($cells, fn ($c) => trim((string) $c) !== '')) {
                continue; // blank line
            }
            if (count($rows) >= self::MAX_ROWS) {
                $errors[] = 'Only the first '.number_format(self::MAX_ROWS).' products were read. Split the file into smaller ones.';
                break;
            }
            $r = [];
            foreach ($head as $i => $col) {
                if (in_array($col, self::COLUMNS, true)) {
                    $r[$col] = self::text($cells[$i] ?? '');
                }
            }
            [$row, $error] = self::normalise($r);
            if ($error) {
                $errors[] = "Line $line: $error";

                continue;
            }
            if (isset($seen[$row['sku']])) {
                $errors[] = "Line $line: duplicate code {$row['sku']} (kept the first one).";

                continue;
            }
            $seen[$row['sku']] = true;
            $row['line'] = $line;
            $rows[] = $row;
        }
        fclose($fh);

        return ['rows' => $rows, 'errors' => $errors, 'columns' => $head];
    }

    /** Plain text only: no tags, no control characters, sensible length. */
    private static function text(?string $v): string
    {
        $v = (string) $v;
        if (! mb_check_encoding($v, 'UTF-8')) {
            $v = mb_convert_encoding($v, 'UTF-8', 'Windows-1252');
        }
        $v = strip_tags(html_entity_decode($v, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);

        return trim(preg_replace('/[ \t]+/', ' ', $v));
    }

    private static function money(?string $v): ?float
    {
        $v = str_replace([' ', '$', 'US', 'ZiG', 'ZWG'], '', (string) $v);
        if ($v === '') {
            return null;
        }
        $v = str_replace(',', '.', $v);

        return is_numeric($v) && (float) $v >= 0 ? round((float) $v, 2) : -1.0;
    }

    private static function measure(?string $v): ?float
    {
        $v = str_replace(',', '.', trim((string) $v));

        return is_numeric($v) && (float) $v > 0 ? round((float) $v, 3) : null;
    }

    /** @return array{0: ?array, 1: ?string} [row, error] */
    private static function normalise(array $r): array
    {
        $sku = mb_substr(preg_replace('/[^A-Za-z0-9._\-\/]/', '', $r['sku'] ?? ''), 0, 64);
        $name = mb_substr($r['name'] ?? '', 0, 120);
        if ($sku === '') {
            return [null, 'no product code (sku).'];
        }
        if ($name === '') {
            return [null, "no name for $sku."];
        }
        $usd = self::money($r['price_usd'] ?? null);
        $zig = self::money($r['price_zig'] ?? null);
        $sale = self::money($r['sale_price_usd'] ?? null);
        if ($usd === -1.0 || $zig === -1.0 || $sale === -1.0) {
            return [null, "a price for $sku isn't a number."];
        }
        if (! $usd && ! $zig) {
            return [null, "no price for $sku."];
        }
        $image = $r['image_url'] ?? '';
        if ($image !== '' && (! filter_var($image, FILTER_VALIDATE_URL) || ! str_starts_with(strtolower($image), 'https://'))) {
            $image = ''; // only https links are used
        }
        $soldBy = strtolower($r['sold_by'] ?? '') === 'kg' ? 'kg' : 'unit';
        $stock = strtolower($r['in_stock'] ?? '');

        return [[
            'sku' => $sku,
            'name' => $name,
            'description' => mb_substr($r['description'] ?? '', 0, 500),
            'department' => mb_substr($r['department'] ?? '', 0, 80),
            'category' => mb_substr($r['category'] ?? '', 0, 80),
            'price_usd' => $usd,
            'price_zig' => $zig,
            'sale_price_usd' => $sale && $usd && $sale < $usd ? $sale : null,
            'image_url' => mb_substr($image, 0, 500),
            'sold_by' => $soldBy,
            'in_stock' => ! in_array($stock, ['no', 'false', '0', 'n'], true),
            'attributes' => array_filter([
                'weight_kg' => self::measure($r['weight_kg'] ?? null),
                'volume_ml' => self::measure($r['volume_ml'] ?? null),
                'width_cm' => self::measure($r['width_cm'] ?? null),
                'height_cm' => self::measure($r['height_cm'] ?? null),
                'branches_in_stock' => isset($r['branches_in_stock']) && is_numeric($r['branches_in_stock']) ? (int) $r['branches_in_stock'] : null,
                'stock_by_branch' => mb_substr($r['stock_by_branch'] ?? '', 0, 2000) ?: null,
                'source' => mb_substr($r['source'] ?? '', 0, 80) ?: null,
                'source_url' => filter_var($r['source_url'] ?? '', FILTER_VALIDATE_URL) ? mb_substr($r['source_url'], 0, 300) : null,
            ], fn ($v) => $v !== null),
        ], null];
    }

    /** A sample file showing the format. */
    public static function template(): string
    {
        $out = fopen('php://temp', 'r+');
        fputcsv($out, self::COLUMNS, ',', '"', '');
        fputcsv($out, ['TMPNP-133128', "Fresh Farm Eggs Standard 6's", 'Six standard eggs', 'Perishables', 'Eggs', '1.50', '', '', 'https://example.com/eggs.png', '0.4', '', '', '', 'unit', 'yes', '14', 'Borrowdale:10|Avondale:46', 'TM Pick n Pay', 'https://tmpnponline.co.zw/products/eggs'], ',', '"', '');
        rewind($out);

        return "\xEF\xBB\xBF".stream_get_contents($out);
    }
}

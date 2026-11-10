<?php

namespace App\Jobs;

use App\Models\Item;
use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

/**
 * Copies imported product photos onto Zvino's own storage, so the menu doesn't depend on another
 * website (and photos get Zvino's resizing for the app). Safe by design: only https, only from the
 * allowed image hosts, never to private network addresses, no redirects, images only, 5 MB max.
 * The same photo used by several stores is downloaded once.
 */
class ImportItemImages implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $timeout = 300;

    private const MAX_BYTES = 5 * 1024 * 1024;
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

    public function __construct(public array $itemIds) {}

    public function handle(): void
    {
        $urls = Item::whereIn('id', $this->itemIds)->whereNotNull('source_image_url')->where('image_path', 'like', 'http%')->distinct()->pluck('source_image_url');
        foreach ($urls as $url) {
            $path = self::fetch($url);
            if ($path) {
                Item::where('source_image_url', $url)->where('image_path', 'like', 'http%')->update(['image_path' => $path]);
            }
        }
    }

    /** Download one photo; returns its /storage path, or null when it isn't allowed or isn't an image. */
    public static function fetch(string $url): ?string
    {
        if (! self::allowed($url)) {
            return null;
        }
        $name = 'items/import/'.sha1($url);
        foreach (self::TYPES as $ext) {
            if (Storage::disk('public')->exists("$name.$ext")) {
                return "/storage/$name.$ext"; // already copied (another store, earlier import)
            }
        }
        try {
            $res = Http::timeout(25)->withOptions(['allow_redirects' => false])->withHeaders(['User-Agent' => 'ZvinoCatalogImport/1.0'])->get($url);
        } catch (\Throwable) {
            return null;
        }
        $body = $res->body();
        if (! $res->successful() || strlen($body) === 0 || strlen($body) > self::MAX_BYTES) {
            return null;
        }
        $info = @getimagesizefromstring($body);
        $ext = $info ? (self::TYPES[$info['mime']] ?? null) : null;
        if (! $ext) {
            return null;
        }
        Storage::disk('public')->put("$name.$ext", $body);

        return "/storage/$name.$ext";
    }

    /** https, an allowed host, and a public internet address (no internal network requests). */
    public static function allowed(string $url): bool
    {
        $u = parse_url($url);
        if (($u['scheme'] ?? '') !== 'https' || empty($u['host']) || isset($u['user']) || (isset($u['port']) && (int) $u['port'] !== 443)) {
            return false;
        }
        $host = strtolower($u['host']);
        $hosts = array_filter(array_map('trim', explode(',', strtolower((string) Setting::get('integrations.import_image_hosts')))));
        $ok = false;
        foreach ($hosts as $h) {
            if ($host === $h || str_ends_with($host, '.'.$h)) {
                $ok = true;
            }
        }
        if (! $ok) {
            return false;
        }
        $ips = @gethostbynamel($host) ?: [];
        if (! $ips && app()->environment('testing')) {
            return true;
        }

        return $ips && collect($ips)->every(fn ($ip) => filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE));
    }
}

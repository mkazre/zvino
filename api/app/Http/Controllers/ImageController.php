<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;

/**
 * Data-light images (#1): /img/{width}/{path under /storage} returns a resized JPEG. The first request
 * creates the file under storage/thumbs and redirects to it, so later requests are plain static files
 * (works on shared hosting with GD, no image service needed).
 */
class ImageController extends Controller
{
    public const WIDTHS = [160, 320, 480, 640, 960, 1280, 1600];

    public function show(int $width, string $path)
    {
        abort_unless(in_array($width, self::WIDTHS, true) && ! str_contains($path, '..') && ! str_starts_with($path, 'thumbs/'), 404);
        $disk = Storage::disk('public');
        // v2: sharper (higher quality) than the first thumbnails, so they're made again once.
        $thumb = "thumbs/v2/{$width}/".preg_replace('/\.\w+$/', '', $path).'.jpg';

        if (! $disk->exists($thumb)) {
            abort_unless($disk->exists($path) && function_exists('imagecreatefromstring'), 404);
            $src = @imagecreatefromstring($disk->get($path));
            abort_unless($src, 404);
            [$w, $h] = [imagesx($src), imagesy($src)];
            $nw = min($width, $w);
            $nh = (int) round($h * $nw / max(1, $w));
            $dst = imagecreatetruecolor($nw, $nh);
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); // flatten PNG transparency
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            ob_start();
            imagejpeg($dst, null, $width <= 320 ? 72 : 85);
            $disk->put($thumb, ob_get_clean());
            imagedestroy($src);
            imagedestroy($dst);
        }

        return redirect('/storage/'.$thumb, 301)->header('Cache-Control', 'public, max-age=31536000');
    }
}

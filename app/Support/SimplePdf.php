<?php

namespace App\Support;

/**
 * A tiny PDF writer (A4, Helvetica, text / lines / boxes) with no PHP extensions required.
 * Used for receipts when dompdf can't run on the server, so the download always works.
 * Coordinates are in points from the top-left corner.
 */
class SimplePdf
{
    public const W = 595.28;
    public const H = 841.89;

    /** @var string[] */
    private array $pages = [];
    private string $cur = '';

    // Helvetica widths (per 1000) for the characters receipts use; others fall back to 556.
    private const WIDTHS = [' ' => 278, '.' => 278, ',' => 278, ':' => 278, '-' => 333, '(' => 333, ')' => 333, '#' => 556, '$' => 556, '%' => 889, '/' => 278, 'i' => 222, 'l' => 222, 'j' => 222, 't' => 278, 'f' => 278, 'r' => 333, 'm' => 833, 'w' => 722, 'I' => 278, 'M' => 833, 'W' => 944, 'G' => 778, 'O' => 778, 'Q' => 778, 'Z' => 611, 'x' => 500, 'k' => 500, 's' => 500, 'c' => 500, 'y' => 500, 'v' => 500, 'z' => 500, '@' => 1015, "'" => 191];

    public function __construct()
    {
        $this->addPage();
    }

    public function addPage(): void
    {
        if ($this->cur !== '') {
            $this->pages[] = $this->cur;
        }
        $this->cur = ' ';
    }

    /** Windows-1252 text for the built-in fonts (no mbstring needed). */
    public static function latin(string $s): string
    {
        $s = strtr($s, ['’' => "'", '‘' => "'", '“' => '"', '”' => '"', '–' => '-', '—' => '-', '…' => '...', '×' => 'x', '≈' => '~', '•' => '-', '·' => '-', '★' => '*', ' ' => ' ']);
        $out = '';
        foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $ch) {
            $code = self::ord($ch);
            $out .= $code < 256 ? chr($code) : '?';
        }

        return $out;
    }

    private static function ord(string $ch): int
    {
        $b = array_values(unpack('C*', $ch));

        return match (count($b)) {
            1 => $b[0],
            2 => (($b[0] & 0x1F) << 6) | ($b[1] & 0x3F),
            3 => (($b[0] & 0x0F) << 12) | (($b[1] & 0x3F) << 6) | ($b[2] & 0x3F),
            default => 63,
        };
    }

    public static function width(string $latin, float $size, bool $bold = false): float
    {
        $w = 0;
        foreach (str_split($latin) as $c) {
            $w += self::WIDTHS[$c] ?? (($c >= 'A' && $c <= 'Z') ? 667 : 556);
        }

        return $w * $size / 1000 * ($bold ? 1.05 : 1);
    }

    /** @param float[] $rgb 0–1 */
    public function text(float $x, float $y, string $s, float $size = 10, bool $bold = false, array $rgb = [0.13, 0.13, 0.13], string $align = 'left', ?float $maxWidth = null): void
    {
        $t = self::latin($s);
        if ($maxWidth) {
            while (strlen($t) > 3 && self::width($t, $size, $bold) > $maxWidth) {
                $t = substr($t, 0, -4).'...';
            }
        }
        if ($align === 'right') {
            $x -= self::width($t, $size, $bold);
        } elseif ($align === 'center') {
            $x -= self::width($t, $size, $bold) / 2;
        }
        $t = str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $t);
        $this->cur .= sprintf("BT %.3F %.3F %.3F rg /%s %.1F Tf %.2F %.2F Td (%s) Tj ET\n", $rgb[0], $rgb[1], $rgb[2], $bold ? 'F2' : 'F1', $size, $x, self::H - $y, $t);
    }

    /** @param float[] $rgb */
    public function rect(float $x, float $y, float $w, float $h, array $rgb): void
    {
        $this->cur .= sprintf("%.3F %.3F %.3F rg %.2F %.2F %.2F %.2F re f\n", $rgb[0], $rgb[1], $rgb[2], $x, self::H - $y - $h, $w, $h);
    }

    /** @param float[] $rgb */
    public function line(float $x1, float $y1, float $x2, float $y2, array $rgb = [0.9, 0.9, 0.89], float $width = 0.7): void
    {
        $this->cur .= sprintf("%.3F %.3F %.3F RG %.2F w %.2F %.2F m %.2F %.2F l S\n", $rgb[0], $rgb[1], $rgb[2], $width, $x1, self::H - $y1, $x2, self::H - $y2);
    }

    public function output(): string
    {
        $pages = [...$this->pages, $this->cur];
        $objects = [];
        $objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        $kids = [];
        $n = 5;
        foreach ($pages as $content) {
            $kids[] = "{$n} 0 R";
            $objects[$n] = sprintf('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2F %.2F] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents %d 0 R >>', self::W, self::H, $n + 1);
            $objects[$n + 1] = '<< /Length '.strlen($content)." >>\nstream\n{$content}\nendstream";
            $n += 2;
        }
        $objects[2] = '<< /Type /Pages /Kids ['.implode(' ', $kids).'] /Count '.count($kids).' >>';
        $objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        $objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        ksort($objects);

        $pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
        $offsets = [];
        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $max = max(array_keys($objects));
        $pdf .= 'xref'."\n0 ".($max + 1)."\n0000000000 65535 f \n";
        for ($i = 1; $i <= $max; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i] ?? 0);
        }

        return $pdf."trailer\n<< /Size ".($max + 1)." /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF";
    }
}

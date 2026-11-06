<?php

namespace App\Support;

use App\Models\Order;
use App\Models\Setting;
use Illuminate\Support\Carbon;

/** The receipt drawn with SimplePdf (works on any server; same content as the dompdf version). */
class ReceiptPdf
{
    private const INK = [0.13, 0.13, 0.13];
    private const MUTED = [0.42, 0.42, 0.42];
    private const GREEN = [0.09, 0.78, 0.29];
    private const LINE = [0.9, 0.9, 0.89];

    public static function make(Order $order): string
    {
        $o = OrderView::forCustomer($order);
        $primary = Money::defaultCurrency();
        $fmt = fn ($m) => $primary === 'USD' ? '$'.number_format($m['usd'], 2) : 'ZiG '.number_format($m['zig'], 2);
        $alt = fn ($m) => $primary === 'USD' ? 'ZiG '.number_format($m['zig'], 2) : '$'.number_format($m['usd'], 2);
        $date = fn (?string $iso) => $iso ? Carbon::parse($iso)->timezone('Africa/Harare')->format('j M Y, H:i') : '-';
        $brand = Setting::get('general.business_name') ?: 'Zvino';
        $L = 40;
        $R = SimplePdf::W - 40;

        $pdf = new SimplePdf;
        // Header
        $pdf->text($L, 58, strtoupper($brand), 24, true, self::INK);
        $pdf->rect($L, 66, 8, 8, self::GREEN);
        $pdf->rect($L + 11, 66, 8, 8, [0.99, 0.9, 0]);
        $pdf->rect($L + 22, 66, 8, 8, [0.87, 0.19, 0.18]);
        $pdf->text($L, 92, trim((Setting::get('general.address') ?: '').(Setting::get('general.vat_number') ? ' - VAT/BP '.Setting::get('general.vat_number') : '')), 8.5, false, self::MUTED);
        $pdf->text($R, 50, 'Tax invoice / receipt', 16, true, self::INK, 'right');
        $pdf->text($R, 68, 'Order #'.$o['reference'], 10, true, self::INK, 'right');
        $pdf->text($R, 82, $date($o['placed_at']), 9, false, self::MUTED, 'right');
        $pdf->text($R, 97, strtoupper($o['details']['payment']['status']), 9, true, $o['details']['payment']['status'] === 'Paid' ? [0.06, 0.55, 0.2] : [0.54, 0.4, 0.03], 'right');

        // From / to
        $y = 120;
        $pdf->line($L, $y, $R, $y, self::LINE);
        $pdf->text($L, $y + 18, 'FROM', 7.5, true, self::MUTED);
        $pdf->text($L, $y + 32, $o['store']['name'], 10.5, true, self::INK, 'left', 250);
        $pdf->text($L, $y + 46, (string) $o['store']['address'], 9, false, self::MUTED, 'left', 250);
        $mid = $L + 270;
        $pdf->text($mid, $y + 18, $o['fulfilment'] === 'pickup' ? 'COLLECTED BY' : 'DELIVERED TO', 7.5, true, self::MUTED);
        $pdf->text($mid, $y + 32, trim(($o['details']['account']['name'] ?: 'Customer').' - '.$o['details']['account']['phone'], ' -'), 10.5, true, self::INK, 'left', 245);
        $a = $o['details']['address'];
        $pdf->text($mid, $y + 46, $a ? implode(', ', array_filter([$a['line1'] ?? null, $a['suburb'] ?? null, $a['city'] ?? null])) : '', 9, false, self::MUTED, 'left', 245);
        $y += 64;
        $pdf->line($L, $y, $R, $y, self::LINE);

        // Lines
        $y += 20;
        $pdf->text($L, $y, 'QTY', 7.5, true, self::MUTED);
        $pdf->text($L + 36, $y, 'ITEM', 7.5, true, self::MUTED);
        $pdf->text($R - 90, $y, 'UNIT', 7.5, true, self::MUTED, 'right');
        $pdf->text($R, $y, 'AMOUNT', 7.5, true, self::MUTED, 'right');
        $y += 8;
        $pdf->line($L, $y, $R, $y, self::LINE);
        foreach ($o['receipt']['lines'] as $l) {
            if ($y > 740) {
                $pdf->addPage();
                $y = 60;
            }
            $y += 18;
            $pdf->text($L, $y, $l['quantity'].'x', 10, false, self::INK);
            $pdf->text($L + 36, $y, $l['name'], 10, true, self::INK, 'left', 300);
            $pdf->text($R - 90, $y, $fmt($l['unit']), 9.5, false, self::INK, 'right');
            $pdf->text($R, $y, $fmt($l['total']), 10, false, self::INK, 'right');
            $extra = trim(implode(' - ', $l['options']).($l['notes'] ? ' "'.$l['notes'].'"' : ''));
            if ($extra !== '') {
                $y += 13;
                $pdf->text($L + 36, $y, $extra, 8.5, false, self::MUTED, 'left', 300);
            }
            $y += 8;
            $pdf->line($L, $y, $R, $y, [0.95, 0.95, 0.94]);
        }

        // Totals
        $y += 10;
        $tx = $L + 290;
        foreach ($o['receipt']['totals'] as $t) {
            $y += 16;
            $pdf->text($tx, $y, $t['label'], 10, false, self::INK);
            $pdf->text($R, $y, $fmt($t['amount']), 10, false, self::INK, 'right');
        }
        $y += 10;
        $pdf->line($tx, $y, $R, $y, self::INK, 1.4);
        $y += 20;
        $pdf->text($tx, $y, 'Total', 13, true, self::INK);
        $pdf->text($R, $y, $fmt($o['receipt']['total']), 13, true, self::INK, 'right');
        $y += 15;
        $pdf->text($tx, $y, '~ '.$alt($o['receipt']['total']).' at '.number_format((float) ($order->zig_per_usd ?: 1), 2).' ZiG/USD', 8, false, self::MUTED);
        $pdf->text($R, $y, 'VAT incl. '.$fmt($o['receipt']['vat']), 8, false, self::MUTED, 'right');

        // Payment + time
        $y += 30;
        $pdf->line($L, $y, $R, $y, self::LINE);
        $pdf->text($L, $y + 18, 'PAYMENT METHOD', 7.5, true, self::MUTED);
        $pdf->text($L, $y + 32, $o['details']['payment']['method'], 10, false, self::INK);
        $pdf->text($mid, $y + 18, strtoupper($o['time']['label']), 7.5, true, self::MUTED);
        $pdf->text($mid, $y + 32, $date($o['time']['at']), 10, false, self::INK);
        $pdf->text(SimplePdf::W / 2, 800, "Thank you for ordering with {$brand}. Questions? ".trim(Setting::get('general.support_phone').' - '.Setting::get('general.support_email'), ' -').' - quote #'.$o['reference'], 8, false, self::MUTED, 'center');

        return $pdf->output();
    }
}

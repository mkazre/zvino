<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Mail\ZvinoMail;
use App\Models\ExchangeRate;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Money;
use App\Support\OrderView;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

/**
 * PDF receipts. Opened through a signed link (from the website or the app), so it also works in the
 * phone's browser without signing in again. Customers can also email themselves a copy.
 */
class ReceiptController extends Controller
{
    public function pdf(Request $request, Order $order)
    {
        $name = "Zvino-receipt-{$order->reference}.pdf";
        try {
            $output = $this->render($order)->output();
        } catch (\Throwable $e) {
            // Never a blank error page: log the cause and show the same receipt as a printable page.
            report($e);
            $staff = $request->user()?->isStaff() || config('app.debug');

            return response()->view('pdf.receipt', $this->data($order) + ['printable' => true, 'pdf_error' => $staff ? class_basename($e).': '.$e->getMessage().' ('.basename($e->getFile()).':'.$e->getLine().')' : null]);
        }

        return response($output, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => ($request->boolean('inline') ? 'inline' : 'attachment').'; filename="'.$name.'"',
        ]);
    }

    public function email(Request $request, Order $order)
    {
        $user = $request->user();
        abort_unless($order->user_id === $user->id, 404);
        $email = $request->validate(['email' => ['nullable', 'email', 'max:160']])['email'] ?? $user->email;
        if (! $email) {
            return $request->expectsJson() ? response()->json(['message' => 'Add an email address first.'], 422) : back()->withErrors(['email' => 'Add an email address first.']);
        }
        if (! $user->email && ! \App\Models\User::where('email', $email)->exists()) {
            $user->update(['email' => $email]); // remember it for next time
        }
        if (config('mail.default') === 'log') {
            return $request->expectsJson()
                ? response()->json(['message' => 'Email isn’t set up on Zvino yet. Please download the receipt instead.'], 503)
                : back()->with('error', 'Email isn’t set up on Zvino yet. Please download the receipt instead.');
        }
        // The PDF is attached when it can be made; otherwise the email links to the receipt page.
        $link = \Illuminate\Support\Facades\URL::temporarySignedRoute('site.order.receipt', now()->addDays(30), ['order' => $order->id]);
        try {
            $pdf = $this->render($order)->output();
        } catch (\Throwable $e) {
            report($e);
            $pdf = null;
        }
        try {
            $mail = new ZvinoMail("Your Zvino receipt #{$order->reference}", 'Here’s your receipt',
                ["Thanks for ordering from {$order->vendor->name}. ".($pdf ? "Your receipt for order #{$order->reference} is attached." : "View or print your receipt for order #{$order->reference} with the button below.")],
                [], 'View receipt', $link);
            if ($pdf) {
                $mail->attachData($pdf, "Zvino-receipt-{$order->reference}.pdf", ['mime' => 'application/pdf']);
            }
            Mail::to($email)->send($mail);
        } catch (\Throwable $e) {
            report($e);

            return $request->expectsJson() ? response()->json(['message' => 'We couldn’t send the email right now. Please download the receipt instead.'], 500) : back()->with('error', 'We couldn’t send the email right now. Please download the receipt instead.');
        }

        return $request->expectsJson() ? response()->json(['message' => "Receipt sent to $email."]) : back()->with('success', "Receipt sent to $email.");
    }

    private function data(Order $order, bool $forPdf = false): array
    {
        $logo = public_path('brand/logo.png');
        // dompdf needs the GD extension to draw PNGs; without it, print the name instead of the logo.
        $canDrawLogo = ! $forPdf || extension_loaded('gd');

        return [
            'o' => OrderView::forCustomer($order),
            'brand' => Setting::get('general.business_name') ?: 'Zvino',
            'logo' => $canDrawLogo && is_file($logo) ? ($forPdf ? 'data:image/png;base64,'.base64_encode(file_get_contents($logo)) : '/brand/logo.png') : null,
            'business' => ['address' => Setting::get('general.address'), 'vat' => Setting::get('general.vat_number')],
            'support' => trim(Setting::get('general.support_phone').' · '.Setting::get('general.support_email'), ' ·'),
            'primary' => Money::defaultCurrency(),
            'rate' => (float) ($order->zig_per_usd ?: ExchangeRate::current()),
            'printable' => false,
        ];
    }

    private function render(Order $order)
    {
        // Shared hosting: keep dompdf's font cache and temp files inside storage/ (always writable).
        $dir = storage_path('app/dompdf');
        if (! is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        return Pdf::loadView('pdf.receipt', $this->data($order, true))
            ->setPaper('a4')
            ->setOption([
                'isFontSubsettingEnabled' => true,
                'defaultFont' => 'DejaVu Sans',
                'fontDir' => $dir,
                'fontCache' => $dir,
                'tempDir' => $dir,
                'isRemoteEnabled' => false,
            ]);
    }
}

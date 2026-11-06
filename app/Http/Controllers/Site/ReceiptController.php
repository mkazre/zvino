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
        $pdf = $this->render($order);
        $name = "Zvino-receipt-{$order->reference}.pdf";

        return $request->boolean('inline') ? $pdf->stream($name) : $pdf->download($name);
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
        try {
            $mail = new ZvinoMail("Your Zvino receipt #{$order->reference}", 'Here’s your receipt', ["Thanks for ordering from {$order->vendor->name}. Your receipt for order #{$order->reference} is attached."]);
            $mail->attachData($this->render($order)->output(), "Zvino-receipt-{$order->reference}.pdf", ['mime' => 'application/pdf']);
            Mail::to($email)->send($mail);
        } catch (\Throwable $e) {
            report($e);

            return $request->expectsJson() ? response()->json(['message' => 'We couldn’t send the email. Please download the PDF instead.'], 500) : back()->with('error', 'We couldn’t send the email. Please download the PDF instead.');
        }

        return $request->expectsJson() ? response()->json(['message' => "Receipt sent to $email."]) : back()->with('success', "Receipt sent to $email.");
    }

    private function render(Order $order)
    {
        $view = OrderView::forCustomer($order);
        $logo = public_path('brand/logo.png');

        return Pdf::loadView('pdf.receipt', [
            'o' => $view,
            'brand' => Setting::get('general.business_name') ?: 'Zvino',
            'logo' => is_file($logo) ? 'data:image/png;base64,'.base64_encode(file_get_contents($logo)) : null,
            'business' => ['address' => Setting::get('general.address'), 'vat' => Setting::get('general.vat_number')],
            'support' => trim(Setting::get('general.support_phone').' · '.Setting::get('general.support_email'), ' ·'),
            'primary' => Money::defaultCurrency(),
            'rate' => (float) ($order->zig_per_usd ?: ExchangeRate::current()),
        ])->setPaper('a4')->setOption(['isFontSubsettingEnabled' => true, 'defaultFont' => 'DejaVu Sans']);
    }
}

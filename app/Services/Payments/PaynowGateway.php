<?php

namespace App\Services\Payments;

use App\Models\Payment;
use Illuminate\Support\Facades\Http;

/**
 * Paynow (paynow.co.zw) integration for EcoCash, OneMoney, InnBucks and cards.
 * Mobile methods use "remote transaction" (USSD push); cards use the hosted redirect.
 * With PAYNOW_FAKE=true (default) payments are simulated so the full flow works locally.
 */
class PaynowGateway
{
    private const INIT_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
    private const MOBILE_URL = 'https://www.paynow.co.zw/interface/remotetransaction';

    public function fake(): bool
    {
        return config('zvino.paynow.fake') || ! config('zvino.paynow.integration_id');
    }

    public function initiate(Payment $payment): Payment
    {
        if ($this->fake()) {
            $payment->update(['status' => 'pending', 'provider_reference' => 'FAKE-'.$payment->id]);

            return $payment;
        }

        $ref = $payment->reference();
        $fields = [
            'id' => config('zvino.paynow.integration_id'),
            'reference' => $ref,
            'amount' => number_format($payment->amount_zig, 2, '.', ''),
            'additionalinfo' => 'Zvino '.$ref,
            'returnurl' => config('zvino.paynow.return_url') ?: url('/'),
            'resulturl' => config('zvino.paynow.result_url') ?: url('/api/payments/webhook/paynow'),
            'authemail' => $payment->order?->user?->email ?: config('zvino.paynow.merchant_email'),
            'status' => 'Message',
        ];

        $mobile = in_array($payment->method, ['ecocash', 'onemoney', 'innbucks'], true);
        if ($mobile) {
            $fields['phone'] = $payment->phone;
            $fields['method'] = $payment->method;
        }
        $fields['hash'] = $this->hash($fields);

        $res = $this->parse(Http::asForm()->timeout(20)->post($mobile ? self::MOBILE_URL : self::INIT_URL, $fields)->body());

        $ok = strtolower($res['status'] ?? '') === 'ok';
        $payment->update([
            'status' => $ok ? 'pending' : 'failed',
            'poll_url' => $res['pollurl'] ?? null,
            'redirect_url' => $res['browserurl'] ?? null,
            'provider_reference' => $res['paynowreference'] ?? null,
            'raw' => $res,
        ]);

        return $payment;
    }

    /** Validates a webhook / poll payload; returns normalised status or null if the hash is bad. */
    public function verify(array $payload): ?string
    {
        if ($this->fake()) {
            return 'paid';
        }

        if (! isset($payload['hash']) || ! hash_equals($this->hash($payload), strtoupper($payload['hash']))) {
            return null;
        }

        return match (strtolower($payload['status'] ?? '')) {
            'paid', 'awaiting delivery', 'delivered' => 'paid',
            'cancelled' => 'cancelled',
            'failed', 'disputed' => 'failed',
            default => 'pending',
        };
    }

    public function poll(Payment $payment): ?string
    {
        if ($this->fake() || ! $payment->poll_url) {
            return $this->fake() ? 'paid' : null;
        }

        return $this->verify($this->parse(Http::timeout(15)->post($payment->poll_url)->body()));
    }

    private function hash(array $fields): string
    {
        $concat = '';
        foreach ($fields as $key => $value) {
            if (strtolower($key) !== 'hash') {
                $concat .= $value;
            }
        }

        return strtoupper(hash('sha512', $concat.config('zvino.paynow.integration_key')));
    }

    private function parse(string $body): array
    {
        parse_str($body, $out);

        return array_change_key_case($out, CASE_LOWER);
    }
}

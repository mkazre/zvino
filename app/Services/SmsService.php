<?php

namespace App\Services;

use App\Models\NotificationTemplate;
use App\Models\Setting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Sends SMS through the provider chosen in Settings → Notifications.
 * Credentials live in .env (SMS_* keys) so they never appear in the admin UI.
 */
class SmsService
{
    public function send(string $to, string $message): bool
    {
        if (! Setting::get('notifications.sms_enabled')) {
            return false;
        }
        $provider = Setting::get('notifications.sms_provider');
        $from = Setting::get('notifications.sms_sender_id');

        try {
            return match ($provider) {
                'africastalking' => Http::asForm()->withHeaders(['apiKey' => config('services.africastalking.key'), 'Accept' => 'application/json'])
                    ->post('https://api.africastalking.com/version1/messaging', ['username' => config('services.africastalking.username'), 'to' => $to, 'message' => $message, 'from' => $from])
                    ->successful(),
                'twilio' => Http::asForm()->withBasicAuth(config('services.twilio.sid'), config('services.twilio.token'))
                    ->post('https://api.twilio.com/2010-04-01/Accounts/'.config('services.twilio.sid').'/Messages.json', ['To' => $to, 'From' => config('services.twilio.from') ?: $from, 'Body' => $message])
                    ->successful(),
                'bulksmsweb' => Http::get('https://portal.bulksmsweb.com/index.php?app=ws', ['u' => config('services.bulksmsweb.user'), 'h' => config('services.bulksmsweb.token'), 'op' => 'pv', 'to' => $to, 'msg' => $message])
                    ->successful(),
                default => $this->log($to, $message),
            };
        } catch (\Throwable $e) {
            Log::warning("SMS to $to failed via $provider: ".$e->getMessage());

            return false;
        }
    }

    /** Send using an admin-editable template, e.g. sendTemplate('order.picked_up', $phone, ['driver' => 'Farai']). */
    public function sendTemplate(string $event, string $to, array $vars, ?string $fallback = null): bool
    {
        $template = NotificationTemplate::where('event', $event)->where('channel', 'sms')->where('is_active', true)->first();
        $body = $template ? NotificationTemplate::render($template->body, $vars) : ($fallback ? NotificationTemplate::render($fallback, $vars) : null);

        return $body ? $this->send($to, $body) : false;
    }

    private function log(string $to, string $message): bool
    {
        Log::info("SMS → $to: $message");

        return true;
    }
}

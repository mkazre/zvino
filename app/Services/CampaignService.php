<?php

namespace App\Services;

use App\Models\Campaign;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/** Marketing push/SMS to a filtered audience. Respects opt-out and quiet hours. */
class CampaignService
{
    public function __construct(private PushService $push, private SmsService $sms) {}

    /**
     * Audience filters: city, tier, inactive_days, min_orders, has_zvino_plus, locale.
     */
    public function audience(array $filters): Builder
    {
        // Audience: everyone, or customers / drivers / store staff. Marketing respects opt-out; service notices reach everyone.
        $roles = match ($filters['roles'] ?? 'customers') {
            'all' => null,
            'drivers' => ['driver'],
            'staff' => \App\Models\User::STORE_ROLES,
            default => ['customer'],
        };
        $service = ($filters['kind'] ?? 'marketing') === 'service';

        return User::query()->whereNull('banned_at')
            ->when($roles, fn ($q) => $q->whereIn('role', $roles))
            ->unless($service, fn ($q) => $q->where('marketing_opt_in', true))
            ->when($filters['city'] ?? null, fn ($q, $city) => $q->whereHas('addresses', fn ($a) => $a->where('city', $city)))
            ->when($filters['tier'] ?? null, fn ($q, $tier) => $q->whereHas('loyalty', fn ($l) => $l->where('tier', $tier)))
            ->when($filters['locale'] ?? null, fn ($q, $l) => $q->where('locale', $l))
            ->when($filters['min_orders'] ?? null, fn ($q, $n) => $q->has('orders', '>=', $n))
            ->when($filters['inactive_days'] ?? null, fn ($q, $d) => $q->whereDoesntHave('orders', fn ($o) => $o->where('created_at', '>=', now()->subDays($d))))
            ->when($filters['has_zvino_plus'] ?? null, fn ($q) => $q->whereHas('subscriptions', fn ($s) => $s->where('current_period_end', '>', now())));
    }

    public function inQuietHours(): bool
    {
        $now = now()->format('H:i');
        $start = Setting::get('notifications.quiet_hours_start');
        $end = Setting::get('notifications.quiet_hours_end');

        return $start > $end ? ($now >= $start || $now < $end) : ($now >= $start && $now < $end);
    }

    public function send(Campaign $campaign): int
    {
        // Quiet hours apply to marketing; service notices (outages, holiday hours) go straight out.
        if ($campaign->kind !== 'service' && $this->inQuietHours()) {
            return 0; // retried by the scheduler once quiet hours end
        }
        $campaign->update(['status' => 'sending']);
        $sent = 0;

        $this->audience(($campaign->audience ?? []) + ['kind' => $campaign->kind])->chunkById(200, function ($users) use ($campaign, &$sent) {
            foreach ($users as $user) {
                $vars = ['name' => explode(' ', $user->name ?: 'there')[0]];
                $title = \App\Models\NotificationTemplate::render($campaign->title ?? '', $vars);
                $body = \App\Models\NotificationTemplate::render($campaign->body, $vars);

                if ($campaign->channel === 'sms' && $user->phone) {
                    $this->sms->send($user->phone, $body."\nReply STOP to opt out.");
                } else {
                    $this->push->toUser($user, $campaign->kind === 'service' ? 'announcement' : 'campaign', $title, $body, array_filter([
                        'link_to' => $campaign->link_to, 'campaign_id' => $campaign->id,
                        'image' => $campaign->image_path ? url($campaign->image_path) : null,
                    ]));
                }
                $sent++;
            }
        });

        $campaign->update(['status' => 'sent', 'sent_count' => $sent]);

        return $sent;
    }

    public function sendDue(): void
    {
        Campaign::where('status', 'scheduled')->where('scheduled_at', '<=', now())->get()->each(fn ($c) => $this->send($c));
    }
}

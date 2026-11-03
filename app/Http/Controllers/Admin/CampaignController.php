<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\Campaign;
use App\Models\Setting;
use App\Services\CampaignService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CampaignController extends AdminController
{
    /** Seasonal presets (Zvino original #47). */
    private const PRESETS = [
        ['name' => 'Month-end treat', 'title' => 'Payday treat, {{name}}? 🎉', 'body' => 'Month-end is here. Enjoy 15% off your favourites tonight with code PAYDAY15.'],
        ['name' => 'Independence Day', 'title' => 'Happy Independence Day 🇿🇼', 'body' => 'Celebrate 18 April with your family. Free delivery all day on orders over ZiG 100.'],
        ['name' => 'Heroes weekend', 'title' => 'Heroes weekend feast', 'body' => 'Long weekend sorted. Braai platters and family meals delivered to your door.'],
        ['name' => 'Rainy season', 'title' => 'Staying in tonight? ☔', 'body' => 'Rain outside, hot food inside. Order now. Our drivers have you covered.'],
        ['name' => 'Win back', 'title' => 'We miss you, {{name}}', 'body' => 'It’s been a while! Here’s ZiG 25 off your next order with code COMEBACK.'],
        ['name' => 'Festive season', 'title' => 'Festive feasts are here 🎄', 'body' => 'Order Christmas platters early and schedule delivery for the big day.'],
    ];

    public function index()
    {
        return Inertia::render('admin/campaigns', [
            'campaigns' => Campaign::latest()->get(),
            'presets' => self::PRESETS,
            'cities' => Setting::get('general.cities'),
            'tiers' => array_keys(Setting::get('loyalty.tiers')),
            'quiet' => ['start' => Setting::get('notifications.quiet_hours_start'), 'end' => Setting::get('notifications.quiet_hours_end')],
        ]);
    }

    public function audience(Request $request, CampaignService $campaigns)
    {
        return response()->json(['count' => $campaigns->audience($request->input('audience', []))->count()]);
    }

    public function save(Request $request, ?Campaign $campaign = null)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'channel' => ['required', 'in:push,sms'],
            'title' => ['nullable', 'string', 'max:120'],
            'body' => ['required', 'string', 'max:500'],
            'audience' => ['array'],
            'link_to' => ['nullable', 'string', 'max:120'],
            'scheduled_at' => ['nullable', 'date', 'after:now'],
        ]);
        $data['status'] = ! empty($data['scheduled_at']) ? 'scheduled' : 'draft';
        $data['audience'] ??= [];

        $campaign?->exists ? $campaign->update($data) : $campaign = Campaign::create($data + ['created_by' => $request->user()->id]);

        return back()->with('success', $data['status'] === 'scheduled' ? 'Campaign scheduled.' : 'Draft saved.');
    }

    public function send(Campaign $campaign, CampaignService $campaigns)
    {
        abort_if($campaign->status === 'sent', 422, 'Already sent.');
        if ($campaigns->inQuietHours()) {
            $campaign->update(['status' => 'scheduled', 'scheduled_at' => now()]);

            return back()->with('success', 'Quiet hours are on, so the campaign will go out as soon as they end.');
        }
        $sent = $campaigns->send($campaign);
        AuditLog::record('campaign.sent', $campaign, ['sent' => $sent]);

        return back()->with('success', "Sent to {$sent} customers.");
    }
}

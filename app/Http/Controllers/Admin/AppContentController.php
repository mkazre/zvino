<?php

namespace App\Http\Controllers\Admin;

use App\Models\AppContent;
use App\Models\AuditLog;
use App\Models\OnboardingSlide;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/** Admin → App onboarding: build onboarding slides and the launch screen for each app, then publish. */
class AppContentController extends AdminController
{
    public function index(Request $request)
    {
        $app = in_array($request->query('app'), OnboardingSlide::APPS, true) ? $request->query('app') : 'customer';
        $onboarding = AppContent::for($app, 'onboarding');
        $launch = AppContent::for($app, 'launch');

        return Inertia::render('admin/app-content', [
            'app' => $app,
            'slides' => OnboardingSlide::where('app', $app)->orderBy('sort_order')->orderBy('id')->get(),
            'onboarding' => ['version' => $onboarding->version, 'published_at' => $onboarding->published_at, 'is_enabled' => $onboarding->exists ? $onboarding->is_enabled : true, 'published' => $onboarding->payload['slides'] ?? []],
            'launch' => ['version' => $launch->version, 'published_at' => $launch->published_at, 'is_enabled' => $launch->exists ? $launch->is_enabled : false, 'payload' => $launch->payload],
        ]);
    }

    public function saveSlide(Request $request, ?OnboardingSlide $slide = null)
    {
        $data = $request->validate([
            'app' => [$slide ? 'sometimes' : 'required', Rule::in(OnboardingSlide::APPS)],
            'heading' => ['nullable', 'string', 'max:80'],
            'body' => ['nullable', 'string', 'max:240'],
            'button_label' => ['nullable', 'string', 'max:30'],
            'text_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'text_position' => ['nullable', 'in:top,middle,bottom'],
            'overlay' => ['nullable', 'array'],
            'overlay.type' => ['nullable', 'in:none,solid,gradient'],
            'overlay.from' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'overlay.to' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'overlay.opacity' => ['nullable', 'numeric', 'between:0,1'],
            'overlay.direction' => ['nullable', 'in:to_top,to_bottom,diagonal'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ], ['image.max' => 'Photo must be 8 MB or smaller.']);
        if ($request->hasFile('image')) {
            $data['image_path'] = '/storage/'.$request->file('image')->store('onboarding', 'public');
        }
        unset($data['image']);
        if (isset($data['overlay']['opacity'])) {
            $data['overlay']['opacity'] = (float) $data['overlay']['opacity'];
        }
        if ($slide) {
            $slide->update($data);
        } else {
            $data['sort_order'] = (int) OnboardingSlide::where('app', $data['app'])->max('sort_order') + 1;
            OnboardingSlide::create($data);
        }

        return back()->with('success', 'Slide saved. Publish to send it to the app.');
    }

    public function deleteSlide(OnboardingSlide $slide)
    {
        $slide->delete();

        return back()->with('success', 'Slide removed. Publish to update the app.');
    }

    public function reorder(Request $request)
    {
        foreach ($request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer']])['ids'] as $i => $id) {
            OnboardingSlide::whereKey($id)->update(['sort_order' => $i]);
        }

        return back();
    }

    /** Snapshot the draft slides; apps show them on next launch (and again to people who saw an older version). */
    public function publish(Request $request)
    {
        $data = $request->validate(['app' => ['required', Rule::in(OnboardingSlide::APPS)], 'is_enabled' => ['sometimes', 'boolean']]);
        $slides = OnboardingSlide::where('app', $data['app'])->orderBy('sort_order')->orderBy('id')->get();
        $content = AppContent::for($data['app'], 'onboarding');
        $content->is_enabled = $data['is_enabled'] ?? true;
        $content->publish(['slides' => $slides->map->toPublished()->values()->all()], $request->user());
        AuditLog::record('app_content.published', $content, ['app' => $data['app'], 'slides' => $slides->count(), 'version' => $content->version]);

        return back()->with('success', "Onboarding v{$content->version} published to the {$data['app']} app.");
    }

    /** Launch screen shown straight after the built-in splash. Saving publishes it. */
    public function saveLaunch(Request $request)
    {
        $data = $request->validate([
            'app' => ['required', Rule::in(OnboardingSlide::APPS)],
            'is_enabled' => ['boolean'],
            'background' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'gradient_to' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'tagline' => ['nullable', 'string', 'max:80'],
            'text_color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'show_logo' => ['boolean'],
            'duration_ms' => ['nullable', 'integer', 'between:600,4000'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'remove_image' => ['nullable', 'boolean'],
        ]);
        $content = AppContent::for($data['app'], 'launch');
        $payload = $content->payload ?? [];
        if ($request->hasFile('image')) {
            $payload['image'] = url('/storage/'.$request->file('image')->store('launch', 'public'));
        } elseif (! empty($data['remove_image'])) {
            $payload['image'] = null;
        }
        $payload = array_merge($payload, collect($data)->only('background', 'gradient_to', 'tagline', 'text_color', 'show_logo', 'duration_ms')->all());
        $content->is_enabled = $data['is_enabled'] ?? true;
        $content->publish($payload, $request->user());

        return back()->with('success', "Launch screen v{$content->version} published.");
    }

    /** Public: what an app downloads at launch. */
    public static function forApp(Request $request)
    {
        $app = in_array($request->query('app'), OnboardingSlide::APPS, true) ? $request->query('app') : 'customer';
        $rows = AppContent::where('app', $app)->get()->keyBy('key');
        $out = fn (string $k) => ($c = $rows->get($k)) && $c->is_enabled && $c->version > 0 ? ['version' => $c->version] + ($c->payload ?? []) : null;

        return response()->json(['app' => $app, 'onboarding' => $out('onboarding'), 'launch' => $out('launch')])
            ->header('Cache-Control', 'public, max-age=300');
    }
}

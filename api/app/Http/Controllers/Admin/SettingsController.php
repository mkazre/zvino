<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\ExchangeRate;
use App\Models\NotificationTemplate;
use App\Models\Page;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/** Settings screens are generated from config/zvino_settings.php. */
class SettingsController extends AdminController
{
    public function index(Request $request, ?string $group = null)
    {
        $groups = config('zvino_settings');
        $special = ['pages', 'templates'];
        $group ??= 'general';
        abort_unless(isset($groups[$group]) || in_array($group, $special, true), 404);

        return Inertia::render('admin/settings', [
            'group' => $group,
            'groups' => collect($groups)->map(fn ($g, $key) => ['key' => $key, 'label' => $g['label'], 'icon' => $g['icon']])->values()
                ->push(['key' => 'templates', 'label' => 'Message templates', 'icon' => 'message'])
                ->push(['key' => 'pages', 'label' => 'Legal & content pages', 'icon' => 'file']),
            'fields' => isset($groups[$group]) ? collect($groups[$group]['fields'])->map(fn ($f, $key) => $f + [
                'key' => $key,
                'value' => ! empty($f['secret']) && Setting::get("$group.$key") ? '••••••••' : Setting::get("$group.$key"),
            ])->values() : [],
            'pages' => $group === 'pages' ? Page::orderBy('title')->get() : [],
            'templates' => $group === 'templates' ? NotificationTemplate::orderBy('event')->orderBy('channel')->get() : [],
            'rateHistory' => $group === 'currency' ? ExchangeRate::latest('effective_at')->limit(10)->get() : [],
            'vendors' => $group === 'general' ? \App\Models\Vendor::active()->orderBy('name')->get(['id', 'name']) : [],
        ]);
    }

    public function update(Request $request, string $group)
    {
        $defs = config("zvino_settings.$group.fields");
        abort_unless($defs, 404);

        $rules = [];
        foreach ($defs as $key => $f) {
            $rules["values.$key"] = match ($f['type']) {
                'bool' => ['nullable', 'boolean'],
                'int' => ['nullable', 'integer'],
                'decimal', 'money', 'percent' => ['nullable', 'numeric', 'min:0'],
                'select' => ['nullable', Rule::in($f['options'])],
                'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
                'image' => ['nullable'],
                'list', 'json' => ['nullable'],
                default => ['nullable', 'string', 'max:5000'],
            };
        }
        $data = $request->validate($rules)['values'] ?? [];

        $changes = [];
        foreach ($defs as $key => $f) {
            $full = "$group.$key";
            if ($f['type'] === 'image') {
                if ($request->hasFile("files.$key")) {
                    $request->validate(["files.$key" => ['image', 'max:4096']]);
                    $data[$key] = '/storage/'.$request->file("files.$key")->store('branding', 'public');
                } elseif (! array_key_exists($key, $data)) {
                    continue;
                }
            }
            if (! array_key_exists($key, $data) || (! empty($f['secret']) && $data[$key] === '••••••••')) {
                continue;
            }
            $new = Setting::cast($full, $data[$key]);
            if ($new !== Setting::get($full)) {
                $changes[$key] = ['from' => ! empty($f['secret']) ? '•••' : Setting::get($full), 'to' => ! empty($f['secret']) ? '•••' : $new];
                Setting::put($full, $new);
            }
        }

        if ($group === 'currency' && isset($changes['primary'])) {
            // The admin who changed the default sees it straight away (drops their own switcher choice).
            \Illuminate\Support\Facades\Cookie::queue(\Illuminate\Support\Facades\Cookie::forget(\App\Support\Money::COOKIE));
        }
        if ($group === 'currency' && isset($changes['zig_per_usd'])) {
            ExchangeRate::create(['zig_per_usd' => Setting::get('currency.zig_per_usd'), 'effective_at' => now()]);
        }
        if ($changes) {
            AuditLog::record("settings.$group.updated", null, $changes);
        }

        return back()->with('success', $changes ? count($changes).' setting'.(count($changes) > 1 ? 's' : '').' saved.' : 'No changes.');
    }

    public function platformMode(Request $request)
    {
        $data = $request->validate([
            'mode' => ['required', 'in:single,marketplace'],
            'single_vendor_id' => ['required_if:mode,single', 'nullable', Rule::exists('vendors', 'id')->where('status', 'active')],
        ]);
        Setting::put('general.platform_mode', $data['mode']);
        Setting::put('general.single_vendor_id', $data['mode'] === 'single' ? (int) $data['single_vendor_id'] : null);
        AuditLog::record('settings.platform_mode', null, $data);

        return back()->with('success', $data['mode'] === 'single' ? 'Switched to single-restaurant mode.' : 'Switched to marketplace mode.');
    }

    public function exchangeRate(Request $request)
    {
        $data = $request->validate(['zig_per_usd' => ['required', 'numeric', 'min:0.0001']]);
        ExchangeRate::create($data + ['effective_at' => now()]);
        Setting::put('currency.zig_per_usd', (float) $data['zig_per_usd']);
        AuditLog::record('settings.exchange_rate', null, $data);

        return back()->with('success', 'Exchange rate updated to '.$data['zig_per_usd'].' ZiG/USD.');
    }

    public function savePage(Request $request, Page $page)
    {
        $page->update($request->validate(['title' => ['required', 'string', 'max:120'], 'body' => ['required', 'string'], 'is_published' => ['boolean']]));
        AuditLog::record('page.updated', $page);

        return back()->with('success', "“{$page->title}” saved.");
    }

    public function saveTemplate(Request $request, NotificationTemplate $template)
    {
        $template->update($request->validate(['title' => ['nullable', 'string', 'max:120'], 'body' => ['required', 'string', 'max:1000'], 'is_active' => ['boolean']]));

        return back()->with('success', 'Template saved.');
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Models\ExchangeRate;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingsController extends AdminController
{
    public function platformMode(Request $request)
    {
        $data = $request->validate([
            'mode' => ['required', 'in:single,marketplace'],
            'single_vendor_id' => ['required_if:mode,single', 'nullable', Rule::exists('vendors', 'id')->where('status', 'active')],
        ]);

        Setting::put('platform_mode', $data['mode']);
        Setting::put('single_vendor_id', $data['mode'] === 'single' ? (int) $data['single_vendor_id'] : null);

        return back()->with('success', 'Platform mode set to '.$data['mode'].'.');
    }

    public function exchangeRate(Request $request)
    {
        $data = $request->validate(['zig_per_usd' => ['required', 'numeric', 'min:0.0001']]);
        ExchangeRate::create($data + ['effective_at' => now()]);

        return back()->with('success', 'Exchange rate updated.');
    }
}

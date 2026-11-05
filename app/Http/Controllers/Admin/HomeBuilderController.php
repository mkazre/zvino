<?php

namespace App\Http\Controllers\Admin;

use App\Models\AuditLog;
use App\Models\HomeBlock;
use App\Models\Item;
use App\Models\Vendor;
use App\Services\PushService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class HomeBuilderController extends AdminController
{
    public function index()
    {
        return Inertia::render('admin/home-builder', [
            'blocks' => HomeBlock::orderBy('sort_order')->get(),
            'types' => HomeBlock::TYPES,
            'appTypes' => HomeBlock::APP_TYPES,
            'cities' => config('zvino.cities'),
            // For the hand-picked stores / dishes pickers.
            'vendors' => Vendor::whereIn('status', ['active', 'pending'])->orderBy('name')->get(['id', 'name', 'city', 'status', 'logo_path']),
            'items' => Item::with('vendor:id,name')->where('is_available', true)->orderBy('name')->limit(600)->get(['id', 'name', 'vendor_id', 'image_path', 'price_zig']),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(HomeBlock::TYPES)],
            'title' => ['nullable', 'string', 'max:120'],
            'subtitle' => ['nullable', 'string', 'max:1000'],
            'cta_label' => ['nullable', 'string', 'max:40'],
            'link_to' => ['nullable', 'string', 'max:255'],
            'payload' => ['nullable', 'array'],
            'after_id' => ['nullable', 'integer'],
        ]);
        // Insert right after the selected block (or at the end).
        $after = isset($data['after_id']) ? HomeBlock::find($data['after_id']) : null;
        $sort = $after ? $after->sort_order + 1 : (HomeBlock::max('sort_order') ?? -1) + 1;
        if ($after) {
            HomeBlock::where('sort_order', '>=', $sort)->increment('sort_order');
        }
        $block = HomeBlock::create([
            'type' => $data['type'],
            'title' => $data['title'] ?? null,
            'subtitle' => $data['subtitle'] ?? null,
            'cta_label' => $data['cta_label'] ?? null,
            'link_to' => $data['link_to'] ?? null,
            'payload' => $data['payload'] ?? null,
            'sort_order' => $sort,
            'is_visible' => false, // new blocks start hidden until edited
            'published_at' => now(),
            'created_by' => $request->user()->id,
        ]);
        AuditLog::record('home_block.created', $block, ['type' => $block->type]);

        return back()->with('success', 'Section added. It is hidden until you switch it on.');
    }

    public function update(Request $request, HomeBlock $block, PushService $push)
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:120'],
            'subtitle' => ['nullable', 'string', 'max:1000'],
            'cta_label' => ['nullable', 'string', 'max:40'],
            'link_to' => ['nullable', 'string', 'max:255'],
            'city_scope' => ['nullable', Rule::in(config('zvino.cities'))],
            'is_visible' => ['boolean'],
            'broadcast' => ['boolean'],
            'payload' => ['nullable', 'array'],
            'published_at' => ['nullable', 'date'],
        ]);
        if (array_key_exists('payload', $data)) {
            $data['payload'] = $this->cleanPayload($block, $data['payload'] ?? []);
        }

        $wasBroadcast = $block->broadcast;
        $block->update($data);

        // Announcement banners can optionally push to all devices, once.
        if ($block->type === 'banner' && $block->broadcast && ! $wasBroadcast && $block->is_visible) {
            $push->broadcast('announcement', $block->title ?? 'Zvino', $block->subtitle ?? '', ['link_to' => $block->link_to]);
        }

        return back()->with('success', 'Section saved.');
    }

    public function duplicate(HomeBlock $block)
    {
        HomeBlock::where('sort_order', '>', $block->sort_order)->increment('sort_order');
        $copy = $block->replicate(['broadcast']);
        $copy->fill(['sort_order' => $block->sort_order + 1, 'is_visible' => false, 'title' => $block->title ? $block->title.' (copy)' : null])->save();

        return back()->with('success', 'Section duplicated (hidden until you switch it on).');
    }

    /** Images for sections (hero backgrounds, slides, tiles…). Returns the public URL. */
    public function upload(Request $request)
    {
        $request->validate(['file' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192']], ['file.max' => 'Images must be 8 MB or smaller.']);

        return response()->json(['url' => '/storage/'.$request->file('file')->store('home', 'public')]);
    }

    public function reorder(Request $request)
    {
        $ids = $request->validate(['ids' => ['required', 'array'], 'ids.*' => ['integer', 'exists:home_blocks,id']])['ids'];

        DB::transaction(function () use ($ids) {
            foreach ($ids as $i => $id) {
                HomeBlock::whereKey($id)->update(['sort_order' => $i]);
            }
        });

        return back();
    }

    public function destroy(HomeBlock $block)
    {
        $block->delete();

        return back()->with('success', 'Section deleted.');
    }

    /** Keep payload values short, and keep the app's hero colour (payload.background) in sync. */
    private function cleanPayload(HomeBlock $block, array $payload): array
    {
        $clean = function ($v) use (&$clean) {
            if (is_array($v)) {
                return array_map($clean, $v);
            }

            return is_string($v) ? mb_substr($v, 0, 2000) : $v;
        };
        $payload = array_map($clean, $payload);
        if ($block->type === 'hero') {
            $payload['background'] = match ($payload['bg_type'] ?? 'default') {
                'color' => $payload['bg_color'] ?? '#1C1C1C',
                'gradient' => $payload['bg_from'] ?? '#1C1C1C',
                'image' => $payload['bg_color'] ?? ($payload['background'] ?? '#1C1C1C'),
                default => $payload['background'] ?? '#1C1C1C',
            };
        }

        return $payload;
    }
}

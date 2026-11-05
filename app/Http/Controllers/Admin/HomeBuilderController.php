<?php

namespace App\Http\Controllers\Admin;

use App\Models\HomeBlock;
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
            'cities' => config('zvino.cities'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['type' => ['required', Rule::in(HomeBlock::TYPES)]]);
        HomeBlock::create($data + [
            'title' => ucfirst($data['type']).' block',
            'sort_order' => (HomeBlock::max('sort_order') ?? -1) + 1,
            'is_visible' => false, // new blocks start hidden until edited
            'published_at' => now(),
            'created_by' => $request->user()->id,
        ]);

        return back()->with('success', 'Block added (hidden until you make it visible).');
    }

    public function update(Request $request, HomeBlock $block, PushService $push)
    {
        $data = $request->validate([
            'title' => ['nullable', 'string', 'max:120'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'cta_label' => ['nullable', 'string', 'max:40'],
            'link_to' => ['nullable', 'string', 'max:120'],
            'city_scope' => ['nullable', Rule::in(config('zvino.cities'))],
            'is_visible' => ['boolean'],
            'broadcast' => ['boolean'],
            'payload' => ['nullable', 'array'],
            'published_at' => ['nullable', 'date'],
        ]);

        $wasBroadcast = $block->broadcast;
        $block->update($data);

        // Announcement banners can optionally push to all devices, once.
        if ($block->type === 'banner' && $block->broadcast && ! $wasBroadcast && $block->is_visible) {
            $push->broadcast('announcement', $block->title ?? 'Zvino', $block->subtitle ?? '', ['link_to' => $block->link_to]);
        }

        return back()->with('success', 'Block saved.');
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

        return back()->with('success', 'Block deleted.');
    }
}

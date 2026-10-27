<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\Item;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class CatalogController extends AdminController
{
    public function index(Request $request)
    {
        $vendor = $this->currentVendor($request);

        $items = Item::with('category')
            ->where('vendor_id', $vendor?->id)
            ->when($request->query('category'), fn ($q, $c) => $q->where('category_id', $c))
            ->when($request->query('q'), fn ($q, $s) => $q->where('name', 'like', "%$s%"))
            ->orderBy('category_id')->orderBy('sort_order')->get();

        return Inertia::render('admin/catalog', [
            'vendor' => $vendor?->only('id', 'name'),
            'vendors' => $this->vendorOptions($request),
            'categories' => Category::where('vendor_id', $vendor?->id)->orderBy('sort_order')->withCount('items')->get(),
            'items' => ItemResource::collection($items),
            'filters' => $request->only('category', 'q'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->authorizeVendor($request, $data['vendor_id']);
        Item::create($data);

        return back()->with('success', 'Item added.');
    }

    public function update(Request $request, Item $item)
    {
        $this->authorizeVendor($request, $item->vendor_id);
        $item->update($this->validated($request, $item));

        return back()->with('success', 'Item saved.');
    }

    /** Availability toggle (one-tap from the table). */
    public function toggle(Request $request, Item $item)
    {
        $this->authorizeVendor($request, $item->vendor_id);
        $item->update(['is_available' => ! $item->is_available]);

        return back();
    }

    public function destroy(Request $request, Item $item)
    {
        $this->authorizeVendor($request, $item->vendor_id);
        $item->delete();

        return back()->with('success', 'Item deleted.');
    }

    public function storeCategory(Request $request)
    {
        $data = $request->validate(['vendor_id' => ['required', 'exists:vendors,id'], 'name' => ['required', 'string', 'max:80']]);
        $this->authorizeVendor($request, (int) $data['vendor_id']);
        Category::create($data + ['sort_order' => Category::where('vendor_id', $data['vendor_id'])->max('sort_order') + 1]);

        return back()->with('success', 'Category added.');
    }

    private function validated(Request $request, ?Item $item = null): array
    {
        $data = $request->validate([
            'vendor_id' => [$item ? 'prohibited' : 'required', 'exists:vendors,id'],
            'category_id' => ['nullable', Rule::exists('categories', 'id')],
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'price_zig' => ['required', 'numeric', 'min:0'],
            'special_price_zig' => ['nullable', 'numeric', 'min:0', 'lt:price_zig'],
            'is_available' => ['boolean'],
            'is_special' => ['boolean'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'variants' => ['nullable', 'array'],
            'variants.*.name' => ['required', 'string'],
            'variants.*.price_delta_zig' => ['required', 'numeric'],
            'modifiers' => ['nullable', 'array'],
        ], [
            'image.max' => 'Photo must be 8 MB or smaller.',
            'image.uploaded' => 'Photo could not be uploaded. It may be larger than the server allows (8 MB).',
        ]);

        if ($request->hasFile('image')) {
            $data['image_path'] = '/storage/'.$request->file('image')->store('items', 'public');
        }
        unset($data['image']);

        if (isset($data['vendor_id'])) {
            $data['vendor_id'] = (int) $data['vendor_id'];
        }

        return $data;
    }
}

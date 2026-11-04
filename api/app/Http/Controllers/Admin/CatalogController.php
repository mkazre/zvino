<?php

namespace App\Http\Controllers\Admin;

use App\Http\Resources\ItemResource;
use App\Models\Category;
use App\Models\Item;
use App\Models\ModifierGroup;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class CatalogController extends AdminController
{
    public function index(Request $request)
    {
        $vendor = $this->currentVendor($request);

        $items = Item::with('category', 'modifierGroups.options', 'vendor')
            ->where('vendor_id', $vendor?->id)
            ->when($request->query('category'), fn ($q, $c) => $q->where('category_id', $c))
            ->when($request->query('q'), fn ($q, $s) => $q->where('name', 'like', "%$s%"))
            ->when($request->query('stock') === 'off', fn ($q) => $q->where(fn ($w) => $w->where('is_available', false)->orWhere('unavailable_until', '>', now())))
            ->orderBy('category_id')->orderBy('sort_order')->get();

        return Inertia::render('admin/catalog', [
            'vendor' => $vendor?->only('id', 'name', 'power_out'),
            'vendors' => $this->vendorOptions($request),
            'categories' => Category::where('vendor_id', $vendor?->id)->orderBy('sort_order')->withCount('items')->get(),
            'items' => ItemResource::collection($items),
            'groups' => ModifierGroup::where('vendor_id', $vendor?->id)->with('options')->withCount('items')->orderBy('name')->get(),
            'filters' => $request->only('category', 'q', 'stock'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->authorizeVendor($request, $data['vendor_id']);
        $groups = $data['modifier_group_ids'] ?? [];
        unset($data['modifier_group_ids']);
        $item = Item::create($data);
        $item->modifierGroups()->sync($groups);

        return back()->with('success', "“{$item->name}” added to the menu.");
    }

    public function update(Request $request, Item $item)
    {
        $this->authorizeVendor($request, $item->vendor_id);
        $data = $this->validated($request, $item);
        if (array_key_exists('modifier_group_ids', $data)) {
            $item->modifierGroups()->sync($data['modifier_group_ids'] ?? []);
            unset($data['modifier_group_ids']);
        }
        $item->update($data);

        return back()->with('success', 'Item saved.');
    }

    /** Availability toggle (one-tap from the table). */
    public function toggle(Request $request, Item $item)
    {
        $this->authorizeVendor($request, $item->vendor_id);
        $on = ! $item->isOrderable();
        $item->update(['is_available' => $on, 'unavailable_until' => null]);

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
        Category::create($data + ['sort_order' => (Category::where('vendor_id', $data['vendor_id'])->max('sort_order') ?? -1) + 1]);

        return back()->with('success', 'Category added.');
    }

    public function updateCategory(Request $request, Category $category)
    {
        $this->authorizeVendor($request, $category->vendor_id);
        $data = $request->validate(['name' => ['sometimes', 'string', 'max:80'], 'station' => ['sometimes', 'nullable', 'string', 'max:30'], 'order' => ['sometimes', 'array'], 'order.*' => ['integer']]);
        $category->update(collect($data)->only('name', 'station')->map(fn ($v, $k) => $k === 'station' && $v ? strtolower(trim($v)) : $v)->all());
        // Optional: reorder items within this category.
        foreach ($data['order'] ?? [] as $i => $itemId) {
            Item::where('id', $itemId)->where('category_id', $category->id)->update(['sort_order' => $i]);
        }

        return back();
    }

    public function destroyCategory(Request $request, Category $category)
    {
        $this->authorizeVendor($request, $category->vendor_id);
        abort_if($category->items()->exists(), 422, 'Move or delete the items in this category first.');
        $category->delete();

        return back()->with('success', 'Category removed.');
    }

    /** Add-on groups: "Choose a side (required, pick 1)", "Extras (up to 3)". */
    public function saveGroup(Request $request, ?ModifierGroup $group = null)
    {
        $data = $request->validate([
            'vendor_id' => [$group?->exists ? 'prohibited' : 'required', 'exists:vendors,id'],
            'name' => ['required', 'string', 'max:80'],
            'min_select' => ['required', 'integer', 'between:0,20'],
            'max_select' => ['required', 'integer', 'between:1,20', 'gte:min_select'],
            'options' => ['required', 'array', 'min:1'],
            'options.*.id' => ['nullable', 'integer'],
            'options.*.name' => ['required', 'string', 'max:80'],
            'options.*.price_delta_zig' => ['required', 'numeric', 'min:0'],
            'options.*.is_available' => ['boolean'],
        ]);
        $this->authorizeVendor($request, (int) ($group?->vendor_id ?? $data['vendor_id']));

        DB::transaction(function () use (&$group, $data) {
            $attrs = collect($data)->only('name', 'min_select', 'max_select')->all();
            $group?->exists ? $group->update($attrs) : $group = ModifierGroup::create($attrs + ['vendor_id' => $data['vendor_id']]);

            $keep = [];
            foreach ($data['options'] as $i => $o) {
                $opt = $group->options()->updateOrCreate(['id' => $o['id'] ?? null], ['name' => $o['name'], 'price_delta_zig' => $o['price_delta_zig'], 'is_available' => $o['is_available'] ?? true, 'sort_order' => $i]);
                $keep[] = $opt->id;
            }
            $group->options()->whereNotIn('id', $keep)->delete();
        });

        return back()->with('success', "Add-on group “{$data['name']}” saved.");
    }

    public function destroyGroup(Request $request, ModifierGroup $group)
    {
        $this->authorizeVendor($request, $group->vendor_id);
        $group->delete();

        return back()->with('success', 'Add-on group deleted.');
    }

    private function validated(Request $request, ?Item $item = null): array
    {
        $data = $request->validate([
            'vendor_id' => [$item ? 'prohibited' : 'required', 'exists:vendors,id'],
            'category_id' => ['nullable', Rule::exists('categories', 'id')],
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:500'],
            'price_zig' => ['required', 'numeric', 'min:0'],
            'sold_by' => ['nullable', 'in:unit,kg'],
            'step_kg' => ['nullable', 'numeric', 'between:0.05,50'],
            'special_price_zig' => ['nullable', 'numeric', 'min:0', 'lt:price_zig'],
            'is_available' => ['boolean'],
            'is_special' => ['boolean'],
            'is_popular' => ['boolean'],
            'needs_power' => ['boolean'],
            'requires_prescription' => ['boolean'],
            'dietary' => ['nullable', 'array'],
            'dietary.*' => ['in:vegetarian,vegan,halal,no_pork,spicy,nut_free,gluten_free,dairy_free'],
            'calories' => ['nullable', 'integer', 'min:0'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'variants' => ['nullable', 'array'],
            'variants.*.name' => ['required', 'string'],
            'variants.*.price_delta_zig' => ['required', 'numeric'],
            'modifier_group_ids' => ['nullable', 'array'],
            'modifier_group_ids.*' => ['integer', 'exists:modifier_groups,id'],
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

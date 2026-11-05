<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\RecurringOrder;
use App\Models\Setting;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Recurring orders: weekday lunch plans (school / office) and the month-end shop. */
class PlanController extends Controller
{
    public function index(Request $request)
    {
        return response()->json($request->user()->hasMany(RecurringOrder::class)->with('vendor:id,name,slug,logo_path', 'address:id,label,line1')->latest()->get()
            ->map(fn (RecurringOrder $p) => $this->present($p)));
    }

    public function store(Request $request)
    {
        abort_unless(Setting::get('orders.recurring_orders'), 403, 'Recurring orders are not available right now.');
        $plan = new RecurringOrder(['user_id' => $request->user()->id] + $this->validated($request));
        $plan->next_run_at = $plan->computeNext();
        $plan->save();

        return response()->json($this->present($plan->fresh(['vendor', 'address'])), 201);
    }

    public function update(Request $request, RecurringOrder $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        $plan->fill($this->validated($request, $plan));
        $plan->next_run_at = $plan->is_active ? $plan->computeNext() : null;
        $plan->save();

        return response()->json($this->present($plan->fresh(['vendor', 'address'])));
    }

    public function destroy(Request $request, RecurringOrder $plan)
    {
        abort_unless($plan->user_id === $request->user()->id, 404);
        $plan->delete();

        return response()->noContent();
    }

    /** Skip the next run (e.g. school holiday, or not this month). */
    public function skip(Request $request, RecurringOrder $plan)
    {
        abort_unless($plan->user_id === $request->user()->id && $plan->next_run_at, 404);
        $plan->update(['next_run_at' => $plan->computeNext($plan->next_run_at), 'reminded_for' => null]);

        return response()->json($this->present($plan->fresh(['vendor', 'address'])));
    }

    private function validated(Request $request, ?RecurringOrder $plan = null): array
    {
        $user = $request->user();
        $vendorId = $request->input('vendor_id', $plan?->vendor_id);
        $data = $request->validate([
            'name' => [$plan ? 'sometimes' : 'required', 'string', 'max:60'],
            'vendor_id' => [$plan ? 'sometimes' : 'required', Rule::exists('vendors', 'id')->where('status', 'active')],
            'kind' => [$plan ? 'sometimes' : 'required', 'in:weekly,monthly'],
            'weekdays' => ['required_if:kind,weekly', 'nullable', 'array', 'min:1'],
            'weekdays.*' => ['integer', 'between:1,7'],
            'day_of_month' => ['required_if:kind,monthly', 'nullable', 'integer', 'between:1,28'],
            'time' => [$plan ? 'sometimes' : 'required', 'date_format:H:i'],
            'fulfilment' => ['sometimes', 'in:delivery,pickup'],
            'address_id' => ['nullable', Rule::exists('addresses', 'id')->where('user_id', $user->id)],
            'payment_method' => ['sometimes', 'in:wallet,ecocash,onemoney,innbucks,cash'],
            'phone' => ['nullable', 'string', 'max:20'],
            'notes' => ['nullable', 'string', 'max:300'],
            'is_active' => ['sometimes', 'boolean'],
            'lines' => [$plan ? 'sometimes' : 'required', 'array', 'min:1', 'max:40'],
            'lines.*.item_id' => ['required', 'integer', Rule::exists('items', 'id')->where('vendor_id', $vendorId)],
            'lines.*.quantity' => ['required', 'integer', 'between:1,50'],
            'lines.*.variant' => ['nullable', 'string'],
            'lines.*.modifiers' => ['nullable', 'array'],
            'lines.*.notes' => ['nullable', 'string', 'max:200'],
        ]);
        if (($data['fulfilment'] ?? $plan?->fulfilment ?? 'delivery') === 'delivery' && ! ($data['address_id'] ?? $plan?->address_id)) {
            abort(422, 'Choose a delivery address for this plan.');
        }

        return $data;
    }

    private function present(RecurringOrder $p): array
    {
        $items = Item::whereIn('id', collect($p->lines)->pluck('item_id'))->get()->keyBy('id');
        $total = collect($p->lines)->sum(fn ($l) => ($items[$l['item_id']] ?? null)?->priceFor($l['variant'] ?? null, $l['modifiers'] ?? []) * $l['quantity']);

        return $p->only('id', 'name', 'kind', 'weekdays', 'day_of_month', 'time', 'fulfilment', 'payment_method', 'phone', 'notes', 'is_active', 'next_run_at', 'last_error', 'last_order_id', 'vendor_id', 'address_id') + [
            'vendor' => $p->vendor?->only('id', 'name', 'slug', 'logo_path'),
            'address' => $p->address?->only('id', 'label', 'line1'),
            'lines' => collect($p->lines)->map(fn ($l) => $l + ['name' => $items[$l['item_id']]->name ?? 'Unavailable item'])->values(),
            'estimate' => Money::both(round((float) $total, 2)),
        ];
    }
}

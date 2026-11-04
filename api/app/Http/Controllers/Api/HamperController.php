<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Hamper;
use App\Models\Item;
use App\Models\RecurringOrder;
use App\Models\Setting;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Diaspora grocery hampers (#8): send a curated basket to family in Zimbabwe once or every month.
 * Paid from the sender's Zvino wallet (top it up by card from abroad), delivered as a recurring order.
 */
class HamperController extends Controller
{
    public function index()
    {
        abort_unless(Setting::get('orders.hampers'), 404);

        return response()->json(Hamper::with('vendor:id,name,city')->where('is_active', true)->orderBy('sort_order')->get()->map(fn (Hamper $h) => self::present($h)));
    }

    public static function present(Hamper $h): array
    {
        $items = Item::whereIn('id', collect($h->lines)->pluck('item_id'))->get()->keyBy('id');

        return $h->only('id', 'name', 'description', 'image_path') + [
            'vendor' => $h->vendor?->only('id', 'name', 'city'),
            'price' => Money::both($h->priceZig()),
            'contents' => collect($h->lines)->map(fn ($l) => ['name' => $items[$l['item_id']]->name ?? 'Item', 'quantity' => $l['quantity']])->values(),
        ];
    }

    public function send(Request $request, Hamper $hamper)
    {
        abort_unless(Setting::get('orders.hampers') && $hamper->is_active, 404);
        $user = $request->user();
        $data = $request->validate([
            'recipient_name' => ['required', 'string', 'max:80'],
            'recipient_phone' => ['required', 'string', 'max:20'],
            'line1' => ['required', 'string', 'max:160'],
            'suburb' => ['nullable', 'string', 'max:80'],
            'city' => ['required', 'string', 'max:60'],
            'landmark' => ['nullable', 'string', 'max:160'],
            'lat' => ['nullable', 'numeric'], 'lng' => ['nullable', 'numeric'],
            'frequency' => ['required', 'in:once,monthly'],
            'deliver_on' => ['required_if:frequency,once', 'nullable', 'date', 'after:now'],
            'day_of_month' => ['required_if:frequency,monthly', 'nullable', 'integer', 'between:1,28'],
            'gift_message' => ['nullable', 'string', 'max:200'],
        ]);
        $price = $hamper->priceZig();
        abort_if($user->walletBalance() < $price, 422, 'Top up your Zvino wallet by card first. You need ZiG '.number_format($price, 2).' for the first hamper.');

        $address = $user->addresses()->create([
            'label' => 'For '.$data['recipient_name'], 'line1' => $data['line1'], 'suburb' => $data['suburb'] ?? null, 'city' => $data['city'],
            'landmark' => $data['landmark'] ?? null, 'lat' => $data['lat'] ?? null, 'lng' => $data['lng'] ?? null,
            'instructions' => "Recipient: {$data['recipient_name']} {$data['recipient_phone']}",
        ]);
        $deliverAt = $data['frequency'] === 'once' ? Carbon::parse($data['deliver_on'])->setTime(11, 0) : null;

        $plan = new RecurringOrder([
            'user_id' => $user->id, 'vendor_id' => $hamper->vendor_id, 'hamper_id' => $hamper->id, 'address_id' => $address->id,
            'name' => $hamper->name, 'kind' => $data['frequency'], 'day_of_month' => $data['day_of_month'] ?? null, 'time' => '11:00',
            'lines' => $hamper->lines, 'fulfilment' => 'delivery', 'payment_method' => 'wallet',
            'recipient_name' => $data['recipient_name'], 'recipient_phone' => $data['recipient_phone'], 'gift_message' => $data['gift_message'] ?? null,
            'next_run_at' => $deliverAt,
        ]);
        $plan->next_run_at = $deliverAt ?? $plan->computeNext();
        $plan->save();

        return response()->json(['plan_id' => $plan->id, 'next_delivery' => $plan->next_run_at, 'price' => Money::both($price)], 201);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VendorResource;
use App\Models\Order;
use App\Models\OrderMessage;
use App\Models\Refund;
use App\Models\Review;
use App\Models\Setting;
use App\Models\Vendor;
use App\Services\OrderService;
use App\Services\PushService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Customer: reviews, favourites, cancellation, refunds and order chat. */
class EngagementController extends Controller
{
    private function own(Request $request, Order $order): void
    {
        abort_unless($order->user_id === $request->user()->id, 404);
    }

    // ── Reviews ──────────────────────────────────────────────────────

    public function review(Request $request, Order $order)
    {
        $this->own($request, $order);
        abort_unless($order->status === 'delivered', 422, 'You can review an order once it has been delivered.');
        abort_if($order->delivered_at?->lt(now()->subDays(Setting::get('orders.review_window_days'))), 422, 'The review window for this order has closed.');
        abort_if($order->review()->exists(), 422, 'You have already reviewed this order.');

        $data = $request->validate([
            'vendor_rating' => ['required', 'integer', 'between:1,5'],
            'driver_rating' => ['nullable', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'string', 'max:1000'],
            'tags' => ['array'], 'tags.*' => ['string', 'max:40'],
        ]);

        $review = DB::transaction(function () use ($order, $data, $request) {
            $review = Review::create($data + ['order_id' => $order->id, 'user_id' => $request->user()->id, 'vendor_id' => $order->vendor_id, 'driver_id' => $order->driver_id]);

            $v = $order->vendor;
            $v->update(['rating' => round(($v->rating * $v->rating_count + $data['vendor_rating']) / ($v->rating_count + 1), 2), 'rating_count' => $v->rating_count + 1]);
            if ($order->driver && isset($data['driver_rating'])) {
                $d = $order->driver;
                $d->update(['rating' => round(($d->rating * $d->rating_count + $data['driver_rating']) / ($d->rating_count + 1), 2), 'rating_count' => $d->rating_count + 1]);
            }

            return $review;
        });

        return response()->json($review, 201);
    }

    public function vendorReviews(Vendor $vendor)
    {
        return response()->json(Review::where('vendor_id', $vendor->id)->where('is_hidden', false)
            ->with('user:id,name')->latest()->paginate(20)
            ->through(fn ($r) => $r->only('id', 'vendor_rating', 'comment', 'tags', 'vendor_reply', 'created_at') + ['author' => $r->user?->name ? explode(' ', $r->user->name)[0] : 'Customer']));
    }

    // ── Favourites ───────────────────────────────────────────────────

    public function watches(Request $request)
    {
        return response()->json(\App\Models\ItemWatch::with('item.vendor:id,name,slug')->where('user_id', $request->user()->id)->latest()->get()
            ->map(fn ($w) => ['item_id' => $w->item_id, 'name' => $w->item?->name, 'vendor' => $w->item?->vendor, 'watched_at_zig' => $w->price_zig, 'now_zig' => $w->item?->effectivePrice()]));
    }

    public function watch(Request $request, \App\Models\Item $item)
    {
        $w = \App\Models\ItemWatch::updateOrCreate(['user_id' => $request->user()->id, 'item_id' => $item->id], ['price_zig' => $item->effectivePrice()]);

        return response()->json(['watching' => true, 'price_zig' => $w->price_zig], 201);
    }

    public function unwatch(Request $request, \App\Models\Item $item)
    {
        \App\Models\ItemWatch::where('user_id', $request->user()->id)->where('item_id', $item->id)->delete();

        return response()->json(['watching' => false]);
    }

    public function favorites(Request $request)
    {
        return VendorResource::collection($request->user()->favorites()->where('status', 'active')->get());
    }

    public function toggleFavorite(Request $request, Vendor $vendor)
    {
        $result = $request->user()->favorites()->toggle($vendor->id);

        return response()->json(['favorited' => ! empty($result['attached'])]);
    }

    // ── Cancel & refunds ─────────────────────────────────────────────

    public function cancel(Request $request, Order $order, OrderService $orders)
    {
        $this->own($request, $order);
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);

        return response()->json(['status' => $orders->cancel($order, 'customer', $data['reason'])->status]);
    }

    public function requestRefund(Request $request, Order $order)
    {
        $this->own($request, $order);
        abort_unless(in_array($order->status, ['delivered'], true) && $order->payment_status === 'paid', 422, 'Refunds can be requested for delivered, paid orders.');

        $data = $request->validate([
            'reason' => ['required', 'in:missing_items,wrong_items,cold_food,quality,late,never_arrived,other'],
            'items' => ['array'], 'items.*' => ['string'],
            'amount_zig' => ['nullable', 'numeric', 'min:1'],
            'note' => ['nullable', 'string', 'max:1000'],
            'photo' => ['nullable', 'image', 'max:8192'],
        ]);

        $remaining = $order->total_zig - $order->refunded_zig;
        $amount = min($data['amount_zig'] ?? $order->subtotal_zig, $remaining);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount_zig' => 'This order has already been fully refunded.']);
        }

        $refund = Refund::create([
            'order_id' => $order->id,
            'requested_by' => $request->user()->id,
            'amount_zig' => $amount,
            'reason' => $data['reason'],
            'items' => $data['items'] ?? null,
            'note' => $data['note'] ?? null,
            'evidence_path' => $request->hasFile('photo') ? '/storage/'.$request->file('photo')->store("refunds/{$order->id}", 'public') : null,
        ]);
        app(\App\Services\StaffNotifier::class)->notify('refund_requested', "Refund requested · #{$order->reference}", str_replace('_', ' ', ucfirst($data['reason'])).' · ZiG '.number_format($amount, 2), '/admin/refunds', null, ['refunds.approve'], ['order_id' => $order->id]);

        // Small missing-item claims are approved instantly to wallet (configurable).
        if (Setting::get('orders.auto_refund_missing_items') && $data['reason'] === 'missing_items' && $amount <= Setting::get('orders.auto_refund_limit_zig')
            && ! app(\App\Services\RiskService::class)->needsManualRefundReview($request->user())) {
            app(\App\Services\RefundService::class)->approve($refund, null);
        }

        return response()->json($refund->fresh(), 201);
    }

    // ── Order chat ───────────────────────────────────────────────────

    public function messages(Request $request, Order $order)
    {
        $this->authorizeChat($request, $order);
        $order->messages()->where('sender_id', '!=', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json($order->messages()->oldest()->get(['id', 'sender_id', 'sender_role', 'channel', 'body', 'read_at', 'created_at']));
    }

    public function sendMessage(Request $request, Order $order, PushService $push)
    {
        $role = $this->authorizeChat($request, $order);
        $data = $request->validate(['body' => ['required', 'string', 'max:1000'], 'channel' => ['in:customer_driver,customer_store']]);
        abort_if(! in_array($order->status, Order::LIVE, true), 422, 'Chat closes when the order is complete.');

        $msg = $order->messages()->create(['sender_id' => $request->user()->id, 'sender_role' => $role, 'channel' => $data['channel'] ?? 'customer_driver', 'body' => $data['body']]);
        \App\Events\OrderMessageSent::dispatch($msg);

        $recipient = $role === 'customer' ? $order->driver?->user : $order->user;
        if ($recipient) {
            $push->toUser($recipient, 'chat', $role === 'customer' ? 'Message from customer' : 'Message from your driver', $data['body'], ['order_id' => $order->id]);
        }

        return response()->json($msg, 201);
    }

    private function authorizeChat(Request $request, Order $order): string
    {
        $user = $request->user();
        if ($order->user_id === $user->id) {
            return 'customer';
        }
        if ($order->driver && $order->driver->user_id === $user->id) {
            return 'driver';
        }
        if ($user->vendor_id === $order->vendor_id) {
            return 'store';
        }
        abort(404);
    }
}

<?php

namespace Tests\Feature\Api;

use App\Events\OrderUpdated;
use App\Models\Item;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CustomerFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        Http::fake(); // Expo push
        Event::fake([OrderUpdated::class]);
    }

    private function login(): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => '0771234567'])->assertOk();
        $res = $this->postJson('/api/auth/otp/verify', ['phone' => '0771234567', 'code' => '123456'])->assertOk();

        return ['Authorization' => 'Bearer '.$res->json('token')];
    }

    public function test_config_and_resolved_home_layout()
    {
        $this->getJson('/api/config')->assertOk()->assertJsonPath('platform_mode', 'marketplace');

        $blocks = collect($this->getJson('/api/home-layout?city=Harare')->assertOk()->json('blocks'));
        $this->assertEqualsCanonicalizing(['hero', 'categories', 'specials', 'vendors', 'banner', 'rewards'], $blocks->pluck('type')->all());
        $this->assertNotEmpty($blocks->firstWhere('type', 'vendors')['data']);
    }

    public function test_otp_login_normalises_zimbabwean_numbers()
    {
        $h = $this->login();
        $this->getJson('/api/me', $h)->assertOk()->assertJsonPath('phone', '+263771234567');
        $this->postJson('/api/auth/otp/verify', ['phone' => '0771234567', 'code' => '000000'])->assertStatus(422);
    }

    public function test_cart_allows_only_one_vendor()
    {
        $h = $this->login();
        [$a, $b] = Vendor::take(2)->get();

        $this->postJson('/api/cart/items', ['item_id' => $a->items()->first()->id, 'quantity' => 1], $h)->assertCreated();
        $this->postJson('/api/cart/items', ['item_id' => $b->items()->first()->id, 'quantity' => 1], $h)->assertStatus(409);
        $this->postJson('/api/cart/items', ['item_id' => $b->items()->first()->id, 'quantity' => 1, 'replace' => true], $h)
            ->assertCreated()->assertJsonPath('vendor.id', $b->id)->assertJsonCount(1, 'items');
    }

    public function test_ecocash_order_end_to_end_with_tracking_and_points()
    {
        $h = $this->login();
        $item = Item::where('vendor_id', Vendor::first()->id)->whereNotNull('variants')->first();

        $cart = $this->postJson('/api/cart/items', ['item_id' => $item->id, 'quantity' => 2, 'variant' => 'Large', 'modifiers' => ['Extra relish']], $h)->assertCreated();
        $this->assertEquals($item->effectivePrice() + 30, $cart->json('items.0.unit_price.zig'));
        $this->assertGreaterThan(0, $cart->json('totals.total.usd'));

        $this->postJson('/api/cart/voucher', ['code' => 'zvino20'], $h)->assertOk()->assertJsonPath('voucher.code', 'ZVINO20');
        $address = $this->postJson('/api/addresses', ['line1' => '12 Josiah Tongogara', 'city' => 'Harare'], $h)->assertCreated();

        $res = $this->postJson('/api/orders', [
            'fulfilment' => 'delivery', 'address_id' => $address->json('id'),
            'payment_method' => 'ecocash', 'phone' => '0771234567',
        ], $h)->assertCreated();

        $res->assertJsonPath('order.payment_status', 'paid')->assertJsonPath('next', 'track');
        $this->assertGreaterThan(0, $res->json('order.totals.discount.zig'));

        $order = Order::find($res->json('order.id'));
        $this->assertSame('placed', $order->status);
        $this->assertGreaterThan(0, $order->total_usd);
        $this->getJson('/api/cart', $h)->assertJsonCount(0, 'items');
        $this->getJson("/api/orders/{$order->id}/track", $h)->assertOk()->assertJsonPath('channel', "private-order.{$order->id}");

        $svc = app(OrderService::class);
        $svc->advanceKitchen($order);
        $this->assertSame('cooking', $order->fresh()->kitchen_stage);
        $svc->advanceKitchen($order->fresh());
        $svc->setStatus($order->fresh(), 'picked_up');
        $svc->setStatus($order->fresh(), 'delivered');

        $this->getJson('/api/loyalty/me', $h)->assertOk()->assertJsonPath('points', (int) floor($order->total_zig * 0.1));
        $this->assertGreaterThan(2, User::where('phone', '+263771234567')->first()->appNotifications()->count());
        Event::assertDispatched(OrderUpdated::class);
    }

    public function test_single_restaurant_mode_hides_other_vendors()
    {
        $vendor = Vendor::first();
        Setting::put('platform_mode', 'single');
        Setting::put('single_vendor_id', $vendor->id);

        $this->getJson('/api/vendors')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $vendor->id);
        $layout = $this->getJson('/api/home-layout')->assertOk();
        $this->assertNotContains('vendors', collect($layout->json('blocks'))->pluck('type'));
        $this->assertSame($vendor->id, $layout->json('single_vendor.id'));
    }
}

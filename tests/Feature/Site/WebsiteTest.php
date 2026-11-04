<?php

namespace Tests\Feature\Site;

use App\Events\OrderUpdated;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-04 12:00:00');
        Cache::flush();
        $this->seed();
        Http::fake();
        Event::fake([OrderUpdated::class, \App\Events\DriverOfferCreated::class]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function signIn(): User
    {
        $this->post('/signin/code', ['phone' => '0779999999'])->assertSessionHas('success');
        $this->post('/signin/verify', ['code' => '123456', 'name' => 'Rudo'])->assertRedirect();

        return User::where('phone', '+263779999999')->firstOrFail();
    }

    public function test_public_pages_render_with_seo()
    {
        $vendor = Vendor::first();
        foreach (['/', '/stores', '/stores?q=sadza', '/stores?cuisine=Grills&sort=rating', "/store/{$vendor->slug}", '/p/terms', '/plus', '/gift-cards', '/partners', '/drive', '/signin', '/hampers', '/catering'] as $url) {
            $this->get($url)->assertOk();
        }
        $this->get("/store/{$vendor->slug}")->assertSee(": order online in", false)->assertSee('"@type":"Restaurant"', false);
        $this->get('/store/does-not-exist')->assertNotFound();
    }

    public function test_guests_are_sent_to_phone_sign_in_and_staff_to_email_login()
    {
        $this->get('/checkout')->assertRedirect('/signin');
        $this->get('/account')->assertRedirect('/signin');
        $this->get('/dashboard')->assertRedirect('/login');
    }

    public function test_full_website_order_flow()
    {
        $user = $this->signIn();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('Rudo', $user->name);

        $this->post('/account/addresses', ['label' => 'Home', 'line1' => '5 Fife Ave', 'landmark' => 'Blue gate', 'city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045])->assertSessionHas('success');
        $address = $user->addresses()->first();

        $vendor = Vendor::where('city', 'Harare')->first();
        $item = $vendor->items()->first();
        $this->get('/checkout')->assertOk();
        $this->postJson('/checkout/sync', ['vendor_id' => $vendor->id, 'lines' => [['item_id' => $item->id, 'quantity' => 2]]])->assertOk()->assertJsonCount(1, 'items');
        $this->postJson('/checkout/quote', ['fulfilment' => 'delivery', 'address_id' => $address->id, 'tip' => 10, 'promo' => 'ZVINO20'])->assertOk()
            ->assertJsonPath('voucher.code', 'ZVINO20')->assertJsonPath('tip_totals.tip.zig', 10);

        $this->post('/checkout', ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => 'ecocash', 'phone' => '0779999999', 'tip' => 10, 'dropoff' => 'leave_at_door'])->assertRedirect();
        $order = Order::where('user_id', $user->id)->firstOrFail();
        $this->assertSame('web', $order->source);
        $this->assertSame('placed', $order->status);
        $this->assertSame('leave_at_door', $order->dropoff);
        $this->assertGreaterThan(0, $order->discount_zig);

        $this->get("/orders/{$order->id}")->assertOk();
        $this->getJson("/orders/{$order->id}/status")->assertOk()->assertJsonPath('status', 'placed');
        $this->get('/account')->assertOk();

        $this->post("/orders/{$order->id}/cancel", ['reason' => 'Changed my mind'])->assertSessionHas('success');
        $this->assertSame('cancelled', $order->fresh()->status);
        $this->assertEquals($order->total_zig, $user->fresh()->walletBalance());
    }

    public function test_customer_cannot_see_another_customers_order()
    {
        $other = User::create(['name' => 'Other', 'phone' => '+263771111111', 'role' => 'customer']);
        $order = Order::create(['user_id' => $other->id, 'vendor_id' => Vendor::first()->id, 'payment_method' => 'cash', 'subtotal_zig' => 10, 'total_zig' => 10, 'zig_per_usd' => 26.8, 'total_usd' => 0.37]);
        $this->signIn();
        $this->get("/orders/{$order->id}")->assertNotFound();
    }

    public function test_review_favourite_reorder_and_group_order()
    {
        $user = $this->signIn();
        $vendor = Vendor::first();
        $order = Order::create(['user_id' => $user->id, 'vendor_id' => $vendor->id, 'status' => 'delivered', 'delivered_at' => now(), 'payment_method' => 'cash', 'payment_status' => 'paid', 'subtotal_zig' => 50, 'total_zig' => 60, 'zig_per_usd' => 26.8, 'total_usd' => 2.24]);
        $order->items()->create(['item_id' => $vendor->items()->first()->id, 'name' => 'x', 'quantity' => 1, 'unit_price_zig' => 50, 'line_total_zig' => 50]);

        $this->post("/orders/{$order->id}/review", ['vendor_rating' => 5, 'comment' => 'Lekker'])->assertSessionHas('success');
        $this->assertSame(1, $vendor->fresh()->rating_count);
        $this->post("/store/{$vendor->id}/favorite")->assertSessionHas('success');
        $this->assertTrue($user->favorites()->where('vendor_id', $vendor->id)->exists());
        $this->post("/orders/{$order->id}/reorder")->assertRedirect("/store/{$vendor->slug}")->assertSessionHas('reorder');

        $this->post("/store/{$vendor->id}/group")->assertRedirect();
        $code = \App\Models\GroupOrder::firstOrFail()->code;
        $this->get("/group/{$code}")->assertOk();
        $this->postJson("/group/{$code}/items", ['item_id' => $vendor->items()->first()->id, 'quantity' => 1])->assertCreated();
        $this->postJson("/group/{$code}/checkout")->assertOk();
    }

    public function test_maintenance_mode_blocks_customers_but_not_staff()
    {
        Setting::put('apps.maintenance_mode', true);
        $this->get('/')->assertStatus(503);
        $this->actingAs(User::where('role', 'super_admin')->first())->get('/')->assertOk();
    }

    public function test_single_restaurant_mode_opens_straight_on_the_menu()
    {
        $vendor = Vendor::first();
        Setting::put('general.platform_mode', 'single');
        Setting::put('general.single_vendor_id', $vendor->id);
        $this->get('/')->assertRedirect("/store/{$vendor->slug}");
    }

    public function test_signin_returns_to_same_site_page_only()
    {
        $this->get('/signin?next=/hampers')->assertOk()->assertSessionHas('url.intended', url('/hampers'));
        $this->flushSession();
        $this->get('/signin?next=//evil.example')->assertOk()->assertSessionMissing('url.intended');
    }
}

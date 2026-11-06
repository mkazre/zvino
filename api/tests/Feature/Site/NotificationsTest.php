<?php

namespace Tests\Feature\Site;

use App\Http\Resources\ItemResource;
use App\Mail\ZvinoMail;
use App\Models\Item;
use App\Models\Order;
use App\Models\User;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class NotificationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $this->withoutVite();
        Http::fake();
        Event::fake([\App\Events\OrderUpdated::class, \App\Events\DriverOfferCreated::class]);
    }

    public function test_status_changes_email_the_customer_and_problems_email_staff(): void
    {
        Mail::fake();
        $order = Order::where('status', 'placed')->whereNotNull('user_id')->firstOrFail();
        $order->user->update(['email' => 'rudo@example.com']);
        User::where('role', 'super_admin')->update(['email' => 'boss@example.com']);

        app(OrderService::class)->setStatus($order, 'accepted');
        Mail::assertQueued(ZvinoMail::class, fn ($m) => $m->hasTo('rudo@example.com') && str_contains($m->subjectLine, 'confirmed'));

        app(OrderService::class)->setStatus($order->fresh(), 'cancelled');
        Mail::assertQueued(ZvinoMail::class, fn ($m) => $m->hasTo('boss@example.com') && str_contains($m->subjectLine, 'cancelled'));
    }

    public function test_browser_alerts_endpoint_returns_new_order_updates(): void
    {
        $order = Order::where('status', 'placed')->whereNotNull('user_id')->firstOrFail();
        $this->actingAs($order->user);
        $start = $this->getJson('/account/alerts')->assertOk()->json('latest_id');
        app(OrderService::class)->setStatus($order, 'accepted');
        $this->getJson("/account/alerts?after={$start}")->assertOk()->assertJsonPath('items.0.data.order_id', $order->id);
    }

    public function test_test_email_explains_when_email_is_switched_off(): void
    {
        config(['mail.default' => 'log']);
        $this->actingAs(User::where('role', 'super_admin')->first())->post('/admin/settings/test-email')->assertSessionHas('error', fn ($m) => str_contains($m, 'MAIL_MAILER=log'));
    }

    public function test_variant_prices_are_numbers_even_when_stored_as_text(): void
    {
        $item = Item::firstOrFail();
        $item->update(['variants' => [['name' => 'Regular', 'price_delta_zig' => '0'], ['name' => 'Large', 'price_delta_zig' => '20']]]);
        $v = (new ItemResource($item->fresh()))->resolve()['variants'];
        $this->assertSame(0.0, $v[0]['price_delta_zig']);
        $this->assertSame(20.0, $v[1]['price_delta_zig']);
    }
}

<?php

namespace Tests\Feature\Site;

use App\Mail\ZvinoMail;
use App\Models\Order;
use App\Support\OrderView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class OrderTrackingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $this->withoutVite();
    }

    private function order(string $status = 'preparing', string $fulfilment = 'delivery'): Order
    {
        $o = Order::whereNotNull('user_id')->where('fulfilment', 'delivery')->firstOrFail();
        $o->update(['fulfilment' => $fulfilment, 'status' => $status, 'status_history' => [['status' => 'placed', 'at' => now()->subMinutes(30)->toIso8601String()], ['status' => 'accepted', 'at' => now()->subMinutes(25)->toIso8601String()], ['status' => $status, 'at' => now()->subMinutes(5)->toIso8601String()]]]);

        return $o->fresh();
    }

    public function test_banner_and_timeline_follow_the_stage(): void
    {
        $v = OrderView::forCustomer($this->order('preparing'));
        $this->assertSame('preparing', $v['banner']['key']);
        $this->assertStringEndsWith('/images/tracking/preparing.jpg', $v['banner']['image']);
        $states = array_column($v['timeline'], 'state', 'key');
        $this->assertSame(['placed' => 'done', 'accepted' => 'done', 'preparing' => 'current', 'ready' => 'upcoming', 'picked_up' => 'upcoming', 'arriving' => 'upcoming', 'delivered' => 'upcoming'], $states);

        $pickup = OrderView::forCustomer($this->order('ready', 'pickup'));
        $this->assertSame('ready_pickup', $pickup['banner']['key']);
        $this->assertStringEndsWith('ready-to-collect.jpg', $pickup['banner']['image']);
        $this->assertNotContains('picked_up', array_column($pickup['timeline'], 'key'));

        $cancelled = OrderView::forCustomer($this->order('cancelled'));
        $this->assertSame('stopped', end($cancelled['timeline'])['state']);
        $this->assertStringEndsWith('cancelled.jpg', $cancelled['banner']['image']);
    }

    public function test_order_page_and_receipt(): void
    {
        $o = $this->order('delivered');
        $this->actingAs($o->user)->get("/orders/{$o->id}")->assertOk()->assertInertia(fn (Assert $p) => $p->component('site/order')->where('view.banner.key', 'delivered')->has('view.receipt.lines'));

        // Signed PDF link works without a session; tampered or unsigned links don't.
        $url = URL::temporarySignedRoute('site.order.receipt', now()->addHour(), ['order' => $o->id]);
        auth()->logout();
        $res = $this->get($url)->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->get("/orders/{$o->id}/receipt.pdf")->assertForbidden();

        Mail::fake();
        $this->actingAs($o->user)->post("/orders/{$o->id}/receipt/email", ['email' => 'me@example.com'])->assertSessionHas('success');
        Mail::assertSent(ZvinoMail::class, fn ($m) => $m->hasTo('me@example.com'));
    }

    public function test_app_api_includes_the_view_with_absolute_images(): void
    {
        $o = $this->order('picked_up');
        $this->actingAs($o->user, 'sanctum')->getJson("/api/orders/{$o->id}")->assertOk()
            ->assertJsonPath('view.banner.key', 'picked_up')
            ->assertJson(fn ($j) => $j->where('view.banner.image', fn ($u) => str_starts_with($u, 'http') && str_ends_with($u, 'on-the-way.jpg'))->etc());
    }

    public function test_other_customers_cannot_see_the_order(): void
    {
        $o = $this->order();
        $other = \App\Models\User::factory()->create(['role' => 'customer']);
        $this->actingAs($other)->get("/orders/{$o->id}")->assertNotFound();
        $this->actingAs($other)->post("/orders/{$o->id}/receipt/email", ['email' => 'x@example.com'])->assertNotFound();
    }
}

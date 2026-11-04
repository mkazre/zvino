<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\AppNotification;
use App\Models\Driver;
use App\Models\Order;
use App\Models\SafetyZone;
use App\Models\User;
use App\Models\Vendor;
use App\Services\CartService;
use App\Services\DispatchService;
use App\Services\OrderService;
use App\Support\I18n;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Shona/Ndebele, night safety zones, demand heatmap, earnings goals, selling by weight. */
class OriginalsThreeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Vendor $vendor;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-04 12:00:00');
        Cache::flush();
        $this->seed();
        Http::fake();
        Event::fake([OrderUpdated::class, DriverOfferCreated::class]);
        $this->user = User::where('phone', '+263771234567')->first();
        $this->vendor = Vendor::where('city', 'Harare')->first();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        if (isset($server['HTTP_AUTHORIZATION'])) {
            $this->app['auth']->forgetGuards(); // tests switch bearer tokens between requests
        }

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function login(string $phone): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => $phone]);

        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/otp/verify', ['phone' => $phone, 'code' => '123456'])->json('token')];
    }

    private function order(?array $at = null): Order
    {
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), 2, null, [], null, true);
        $address = $this->user->addresses()->create(['line1' => '5 Fife Ave', 'city' => 'Harare', 'lat' => $at[0] ?? -17.81, 'lng' => $at[1] ?? 31.045]);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => 'ecocash', 'phone' => '+263771234567']);

        return $order->fresh();
    }

    public function test_dictionaries_are_valid_and_cover_the_same_phrases()
    {
        $sn = I18n::dictionary('sn');
        $nd = I18n::dictionary('nd');
        $this->assertNotEmpty($sn);
        $this->assertEqualsCanonicalizing(array_keys($sn), array_keys($nd));
        $this->assertSame('Pamba', I18n::t('Home', 'sn'));
        $this->assertSame('Untranslated stays English', I18n::t('Untranslated stays English', 'nd'));
        $this->getJson('/api/i18n/nd')->assertOk()->assertJsonPath('strings.Home', 'Ekhaya');
    }

    public function test_push_notifications_use_the_customers_language()
    {
        $this->user->update(['locale' => 'sn']);
        $order = $this->order();
        app(OrderService::class)->accept($order, 15);

        $n = AppNotification::where('user_id', $this->user->id)->latest('id')->first();
        $this->assertSame('Odha yabvumwa', $n->title);
        $this->assertStringContainsString($this->vendor->name, $n->body);
    }

    public function test_website_language_switch_sets_cookie_and_user_locale()
    {
        $this->actingAs($this->user)->post('/locale', ['locale' => 'nd'])->assertRedirect()->assertCookie('zvino_locale');
        $this->assertSame('nd', $this->user->fresh()->locale);
    }

    public function test_night_safety_zone_warns_and_respects_opt_out()
    {
        SafetyZone::create(['name' => 'Test zone', 'lat' => -17.81, 'lng' => 31.045, 'radius_km' => 1, 'night_from' => '19:00', 'night_to' => '05:00']);
        $driver = Driver::first();
        $driver->update(['is_online' => true, 'lat' => $this->vendor->lat, 'lng' => $this->vendor->lng, 'location_updated_at' => now(), 'avoid_night_zones' => true]);

        // Daytime: zone inactive, opted-out driver still gets the job.
        $day = $this->order();
        $this->assertNull(SafetyZone::activeAt(-17.81, 31.045));
        $this->assertNotNull(app(DispatchService::class)->nearestDriver($day));

        // 21:00: zone active, opted-out driver is skipped.
        Carbon::setTestNow('2026-11-04 21:00:00');
        $driver->update(['location_updated_at' => now()]);
        $this->assertNotNull(SafetyZone::activeAt(-17.81, 31.045));
        $this->assertNull(app(DispatchService::class)->nearestDriver($day->fresh()));

        // Driver who hasn't opted out sees a warning on the offer.
        $driver->update(['avoid_night_zones' => false]);
        $offer = $day->dispatchOffers()->create(['driver_id' => $driver->id, 'pay_zig' => 20, 'expires_at' => now()->addMinute()]);
        $h = $this->login('+263772000001');
        $this->getJson('/api/driver/offers', $h)->assertOk()->assertJsonPath('0.safety.zone', 'Test zone');
    }

    public function test_driver_goals_and_heatmap()
    {
        $driver = Driver::first();
        $driver->ledger()->create(['type' => 'earning', 'amount_zig' => 150, 'description' => 'Trips']);
        $this->order();
        $h = $this->login('+263772000001');

        $this->patchJson('/api/driver/preferences', ['daily_goal_zig' => 300, 'avoid_night_zones' => true], $h)->assertOk()
            ->assertJsonPath('preferences.avoid_night_zones', true);
        $this->getJson('/api/driver/earnings', $h)->assertOk()->assertJsonPath('goals.daily.target', 300)->assertJsonPath('goals.daily.earned', 150);

        $cells = $this->getJson('/api/driver/heatmap', $h)->assertOk()->json('cells');
        $this->assertNotEmpty($cells);
        $this->assertEquals(1, $cells[0]['intensity']);
    }

    public function test_items_sold_by_weight_price_per_step_and_label_the_order()
    {
        $item = $this->vendor->items()->first();
        $item->update(['sold_by' => 'kg', 'step_kg' => 0.5, 'price_zig' => 40, 'special_price_zig' => null, 'variants' => null, 'modifiers' => null]);

        app(CartService::class)->add($this->user, $item->fresh(), 3, null, [], null, true); // 1.5 kg
        $line = app(CartService::class)->for($this->user)->items->first();
        $this->assertEquals(20, $line->unit_price_zig);

        $address = $this->user->addresses()->create(['line1' => '5 Fife Ave', 'city' => 'Harare', 'lat' => -17.81, 'lng' => 31.045]);
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'delivery', 'address_id' => $address->id, 'payment_method' => 'ecocash', 'phone' => '+263771234567']);
        $this->assertSame($item->name.' (1.5 kg)', $order->items->first()->name);
        $this->assertEquals(60, $order->items->first()->line_total_zig);
    }
}

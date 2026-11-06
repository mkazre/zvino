<?php

namespace Tests\Feature\Site;

use App\Models\User;
use App\Models\Vendor;
use App\Support\CustomerLocation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class LocationTest extends TestCase
{
    use RefreshDatabase;

    // Harare CBD (where the demo Harare stores are) and Bulawayo.
    private const HARARE = ['lat' => -17.8295, 'lng' => 31.0525];
    private const BULAWAYO = ['lat' => -20.1500, 'lng' => 28.5833];

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->withoutVite();
        Http::fake(['nominatim.openstreetmap.org/*' => Http::response(['address' => ['house_number' => '5', 'road' => 'Fife Ave', 'suburb' => 'Avenues', 'city' => 'Harare']])]);
    }

    private function customer(): User
    {
        $u = User::factory()->create(['role' => 'customer', 'phone' => '+263770000111']);
        $u->addresses()->create(['label' => 'Home', 'line1' => '21 Moepel Ave', 'city' => 'Harare', 'lat' => self::HARARE['lat'], 'lng' => self::HARARE['lng'], 'is_default' => true]);

        return $u;
    }

    public function test_gps_near_a_saved_address_picks_it(): void
    {
        $u = $this->customer();
        // ~30 m away from the saved address.
        $this->actingAs($u)->postJson('/location/detect', ['lat' => self::HARARE['lat'] + 0.00025, 'lng' => self::HARARE['lng']])
            ->assertOk()->assertJsonPath('matched', true)->assertJsonPath('location.label', 'Home');
        $this->assertSame($u->addresses()->first()->id, session(CustomerLocation::SESSION)['address_id']);
    }

    public function test_gps_away_from_saved_addresses_uses_current_location_and_asks_to_save(): void
    {
        $u = $this->customer();
        $this->actingAs($u)->postJson('/location/detect', ['lat' => self::HARARE['lat'] + 0.02, 'lng' => self::HARARE['lng']])
            ->assertOk()->assertJsonPath('matched', false)->assertJsonPath('needs_address', true)
            ->assertJsonPath('location.label', 'Current location')->assertJsonPath('location.line', '5 Fife Ave');
    }

    public function test_home_only_shows_stores_that_deliver_to_the_location(): void
    {
        $bulawayo = Vendor::where('city', 'Bulawayo')->firstOrFail();
        $this->withSession([CustomerLocation::SESSION => self::HARARE + ['address_id' => null, 'label' => 'Current location', 'line' => null, 'city' => 'Harare']])
            ->get('/')->assertOk()->assertInertia(fn (Assert $p) => $p
                ->where('nearby.has_location', true)
                ->where('stores', fn ($stores) => collect($stores)->isNotEmpty() && ! collect($stores)->pluck('id')->contains($bulawayo->id) && collect($stores)->every(fn ($s) => $s['distance_km'] !== null)));

        $this->withSession([CustomerLocation::SESSION => self::BULAWAYO + ['address_id' => null, 'label' => 'x', 'line' => null, 'city' => 'Bulawayo']])
            ->get('/stores')->assertInertia(fn (Assert $p) => $p->where('stores', fn ($s) => collect($s)->pluck('id')->all() === [$bulawayo->id]));
    }

    public function test_app_api_location_resolve_home_layout_and_shops(): void
    {
        $u = $this->customer();
        $this->actingAs($u, 'sanctum')->postJson('/api/location/resolve', self::HARARE)->assertOk()->assertJsonPath('matched', true);

        $res = $this->getJson('/api/home-layout?segment=restaurants&lat='.self::BULAWAYO['lat'].'&lng='.self::BULAWAYO['lng'])->assertOk();
        $types = collect($res->json('blocks'))->pluck('type');
        $this->assertTrue($types->contains('all_stores'));
        $all = collect($res->json('blocks'))->firstWhere('type', 'all_stores')['data'];
        $this->assertSame(['Bulawayo'], collect($all['stores'])->pluck('city')->unique()->values()->all());

        $this->getJson('/api/shops?lat='.self::HARARE['lat'].'&lng='.self::HARARE['lng'])->assertOk()->assertJsonStructure(['kinds', 'shops']);
        $this->getJson('/api/vendors?lat='.self::BULAWAYO['lat'].'&lng='.self::BULAWAYO['lng'])->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_switching_to_a_saved_address(): void
    {
        $u = $this->customer();
        $a = $u->addresses()->first();
        $this->actingAs($u)->post('/location/address', ['address_id' => $a->id])->assertRedirect();
        $this->assertSame($a->id, session(CustomerLocation::SESSION)['address_id']);
        $other = User::factory()->create(['role' => 'customer']);
        $this->actingAs($other)->post('/location/address', ['address_id' => $a->id])->assertNotFound();
    }
}

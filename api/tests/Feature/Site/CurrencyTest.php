<?php

namespace Tests\Feature\Site;

use App\Models\ExchangeRate;
use App\Models\Setting;
use App\Models\User;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CurrencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->withoutVite();
    }

    public function test_default_is_the_admin_setting_and_visitors_can_switch(): void
    {
        $this->get('/stores')->assertInertia(fn (Assert $p) => $p->where('currency.primary', 'ZIG')->where('currency.default', 'ZIG'));

        Setting::put('currency.primary', 'USD');
        $this->get('/stores')->assertInertia(fn (Assert $p) => $p->where('currency.primary', 'USD'));
        $this->getJson('/api/config')->assertJsonPath('currencies.primary', 'USD')->assertJsonPath('currencies.secondary', 'ZIG');

        // A visitor's own choice wins over the default.
        $this->withCookie(Money::COOKIE, 'ZIG')->get('/stores')->assertInertia(fn (Assert $p) => $p->where('currency.primary', 'ZIG')->where('currency.default', 'USD'));
        $this->post('/currency', ['currency' => 'USD'])->assertCookie(Money::COOKIE, 'USD');
        $this->post('/currency', ['currency' => 'EUR'])->assertSessionHasErrors('currency');
    }

    public function test_usd_amounts_use_the_current_rate_and_new_rates_apply_immediately(): void
    {
        ExchangeRate::create(['zig_per_usd' => 26.8, 'effective_at' => now()->subMinute()]);
        $this->assertSame(['zig' => 134.0, 'usd' => 5.0], Money::both(134));
        ExchangeRate::create(['zig_per_usd' => 13.4, 'effective_at' => now()]);
        $this->assertSame(10.0, Money::both(134)['usd']);
    }

    public function test_changing_the_setting_clears_the_admins_own_switch(): void
    {
        $admin = User::where('role', 'super_admin')->firstOrFail();
        $this->actingAs($admin)->withCookie(Money::COOKIE, 'ZIG')
            ->post('/admin/settings/currency', ['values' => ['primary' => 'USD']])
            ->assertCookieExpired(Money::COOKIE);
        $this->assertSame('USD', Setting::get('currency.primary'));
    }
}

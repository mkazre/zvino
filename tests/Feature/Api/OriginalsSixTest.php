<?php

namespace Tests\Feature\Api;

use App\Events\DriverOfferCreated;
use App\Events\OrderUpdated;
use App\Models\CateringRequest;
use App\Models\Company;
use App\Models\CompanyMember;
use App\Models\Driver;
use App\Models\Hamper;
use App\Models\Order;
use App\Models\Payment;
use App\Models\RecurringOrder;
use App\Models\User;
use App\Models\Vendor;
use App\Services\CartService;
use App\Services\CompanyService;
use App\Services\OrderService;
use App\Services\RecurringOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Catering, diaspora hampers, corporate accounts, and live-mode routing of non-order payments. */
class OriginalsSixTest extends TestCase
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
        $this->vendor = User::where('email', 'manager@zvino.co.zw')->first()->vendor;
        $this->vendor->update(['accepts_catering' => true, 'accepts_scheduled' => true]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function call($method, $uri, $parameters = [], $cookies = [], $files = [], $server = [], $content = null)
    {
        if (isset($server['HTTP_AUTHORIZATION'])) {
            $this->app['auth']->forgetGuards();
        }

        return parent::call($method, $uri, $parameters, $cookies, $files, $server, $content);
    }

    private function login(string $phone): array
    {
        $this->postJson('/api/auth/otp/request', ['phone' => $phone]);

        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/otp/verify', ['phone' => $phone, 'code' => '123456'])->json('token')];
    }

    private function manager(): array
    {
        return ['Authorization' => 'Bearer '.$this->postJson('/api/auth/staff/login', ['email' => 'manager@zvino.co.zw', 'password' => 'password'])->json('token')];
    }

    public function test_funeral_catering_quote_deposit_balance_and_settlement()
    {
        $h = $this->login('+263771234567');
        $c = $this->postJson('/api/catering', ['vendor_id' => $this->vendor->id, 'event_type' => 'funeral', 'event_at' => now()->addHours(20)->toDateTimeString(), 'headcount' => 150, 'location' => 'Plot 4, Domboshava'], $h)
            ->assertCreated()->json();

        $this->postJson("/api/merchant/catering/{$c['id']}", ['action' => 'quote', 'quote_zig' => 6000, 'note' => 'Sadza, beef, greens, serving staff'], $this->manager())
            ->assertOk()->assertJsonPath('deposit_zig', 3000);

        $this->postJson("/api/catering/{$c['id']}/pay", ['method' => 'ecocash'], $h)->assertOk()->assertJsonPath('catering.status', 'deposit_paid');
        $this->postJson("/api/catering/{$c['id']}/pay", ['method' => 'ecocash'], $h)->assertOk()->assertJsonPath('catering.status', 'paid');

        $this->postJson("/api/merchant/catering/{$c['id']}", ['action' => 'complete'], $this->manager())->assertOk();
        $this->assertEquals(6000, $this->vendor->ledger()->where('type', 'earning')->where('description', 'like', 'Catering%')->sum('amount_zig'));
    }

    public function test_catering_notice_and_late_cancellation_keeps_deposit()
    {
        $h = $this->login('+263771234567');
        $this->postJson('/api/catering', ['vendor_id' => $this->vendor->id, 'event_type' => 'wedding', 'event_at' => now()->addHours(20)->toDateTimeString(), 'headcount' => 100, 'location' => 'Hall'], $h)
            ->assertStatus(422); // weddings need 48 h

        $c = CateringRequest::create(['user_id' => $this->user->id, 'vendor_id' => $this->vendor->id, 'event_type' => 'wedding', 'event_at' => now()->addHours(10), 'headcount' => 100, 'location' => 'Hall', 'status' => 'quoted', 'quote_zig' => 4000, 'deposit_pct' => 50]);
        $this->postJson("/api/catering/{$c->id}/pay", ['method' => 'ecocash'], $h)->assertOk();
        $this->postJson("/api/catering/{$c->id}/cancel", [], $h)->assertOk()->assertJsonPath('status', 'cancelled');
        $this->assertEqualsWithDelta(0, $this->user->walletBalance(), 0.01); // within 24 h: deposit kept
    }

    public function test_hamper_sent_once_to_family_from_wallet()
    {
        $items = $this->vendor->items()->take(2)->get();
        $hamper = Hamper::create(['vendor_id' => $this->vendor->id, 'name' => 'Family basics', 'lines' => $items->map(fn ($i) => ['item_id' => $i->id, 'quantity' => 2])->all()]);
        $h = $this->login('+263771234567');

        $this->getJson('/api/hampers')->assertOk()->assertJsonPath('0.name', 'Family basics');
        $body = ['recipient_name' => 'Mai Tendai', 'recipient_phone' => '+263775555555', 'line1' => '12 Chikanga', 'city' => 'Harare', 'frequency' => 'once', 'deliver_on' => now()->addDays(2)->toDateString()];
        $this->postJson("/api/hampers/{$hamper->id}/send", $body, $h)->assertStatus(422); // wallet empty

        $this->user->walletTransactions()->create(['type' => 'credit', 'amount_zig' => 5000, 'reason' => 'Card top-up']);
        $plan = $this->postJson("/api/hampers/{$hamper->id}/send", $body, $h)->assertCreated()->json();

        Carbon::setTestNow(now()->addDays(2)->setTime(9, 30));
        app(RecurringOrderService::class)->run();
        $order = Order::where('recurring_order_id', $plan['plan_id'])->first();
        $this->assertNotNull($order);
        $this->assertStringContainsString('Mai Tendai', $order->notes);
        $this->assertFalse(RecurringOrder::find($plan['plan_id'])->is_active); // one-off
    }

    public function test_company_account_allowance_budget_refund_and_invoice()
    {
        $company = Company::create(['name' => 'Delta Beverages', 'daily_allowance_zig' => 400, 'monthly_budget_zig' => 100000, 'allowed_days' => [1, 2, 3, 4, 5]]);
        CompanyMember::create(['company_id' => $company->id, 'phone' => $this->user->phone]);
        $h = $this->login('+263771234567');
        $cart = app(CartService::class);
        $cart->add($this->user, $this->vendor->items()->first(), 1, null, [], null, true);

        $this->postJson('/api/checkout/quote', ['fulfilment' => 'pickup'], $h)->assertOk()->assertJsonPath('company.company', 'Delta Beverages');
        [$order] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'company']);
        $this->assertSame('paid', $order->payment_status);
        $this->assertSame($company->id, $order->company_id);

        // Over the daily allowance.
        $cart->add($this->user, $this->vendor->items()->first(), 30, null, [], null, true);
        $this->expectExceptionOnPlace();

        // Cancel the first order: nothing goes to the employee's wallet, invoice excludes it.
        app(OrderService::class)->cancel($order->fresh(), 'admin', 'Test');
        $this->assertEqualsWithDelta(0, $this->user->walletBalance(), 0.01);

        $cart->for($this->user)->items()->delete();
        $cart->add($this->user, $this->vendor->items()->first(), 1, null, [], null, true);
        [$second] = app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'company']);
        $this->assertSame(1, app(CompanyService::class)->invoiceAll(now()));
        $invoice = $company->invoices()->first();
        $this->assertEquals(1, $invoice->orders_count);
        $this->assertEqualsWithDelta($second->total_zig, $invoice->amount_zig, 0.01);
    }

    private function expectExceptionOnPlace(): void
    {
        try {
            app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'company']);
            $this->fail('Should exceed the daily allowance');
        } catch (\Illuminate\Validation\ValidationException $e) {
            $this->assertStringContainsString('allowance', $e->getMessage());
        }
    }

    public function test_non_members_dont_see_company_and_cant_use_it()
    {
        $h = $this->login('+263771234567');
        app(CartService::class)->add($this->user, $this->vendor->items()->first(), 1, null, [], null, true);
        $methods = $this->postJson('/api/checkout/quote', ['fulfilment' => 'pickup'], $h)->json('payment_methods');
        $this->assertNotContains('company', $methods);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        app(OrderService::class)->placeFromCart($this->user, ['fulfilment' => 'pickup', 'payment_method' => 'company']);
    }

    public function test_live_webhook_routes_driver_remittance_to_ledger_not_wallet()
    {
        $driver = Driver::first();
        $driver->ledger()->create(['type' => 'cash_collected', 'amount_zig' => -120, 'description' => 'COD']);
        $payment = Payment::create(['provider' => 'paynow', 'method' => 'ecocash', 'amount_zig' => 120, 'status' => 'pending',
            'payable_type' => $driver->getMorphClass(), 'payable_id' => $driver->id, 'raw' => ['user_id' => $driver->user_id, 'purpose' => 'cash_remittance', 'reference' => 'ZVR-1']]);

        app(\App\Services\GrowthService::class)->onPaymentPaid($payment->fresh());

        $this->assertEquals(0, $driver->fresh()->cashHeld());
        $this->assertEqualsWithDelta(0, $driver->user->walletBalance(), 0.01);
    }
}

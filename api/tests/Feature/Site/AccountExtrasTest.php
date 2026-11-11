<?php

namespace Tests\Feature\Site;

use App\Models\Order;
use App\Models\Setting;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AccountExtrasTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        $this->seed(\Database\Seeders\DemoActivitySeeder::class);
        $this->withoutVite();
        Setting::put('integrations.google_client_id', 'web-client.apps.googleusercontent.com');
        Setting::put('integrations.google_client_secret', 'secret');
        Setting::put('integrations.google_android_client_id', 'android-client.apps.googleusercontent.com');
    }

    private function fakeGoogle(string $aud, string $email = 'rudo@gmail.com', string $sub = 'g-123'): void
    {
        Http::swap(new \Illuminate\Http\Client\Factory); // fresh fake each time
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['id_token' => 'ID.TOKEN']),
            'oauth2.googleapis.com/tokeninfo*' => Http::response(['aud' => $aud, 'iss' => 'https://accounts.google.com', 'exp' => (string) (time() + 600), 'sub' => $sub, 'email' => $email, 'email_verified' => 'true', 'name' => 'Rudo Moyo', 'picture' => 'https://lh3.googleusercontent.com/a.jpg']),
        ]);
    }

    public function test_website_google_sign_in_creates_and_then_finds_the_customer(): void
    {
        $this->fakeGoogle('web-client.apps.googleusercontent.com');
        $go = $this->get('/auth/google?back=/stores')->assertRedirect();
        $this->assertStringStartsWith('https://accounts.google.com/o/oauth2/v2/auth?', $go->headers->get('Location'));
        $state = session('google_state');

        $this->get("/auth/google/callback?code=abc&state=$state")->assertRedirect('/stores');
        $user = User::where('email', 'rudo@gmail.com')->firstOrFail();
        $this->assertSame('g-123', $user->google_id);
        $this->assertSame('customer', $user->role);
        $this->assertAuthenticatedAs($user);

        // Wrong state (forged callback) is refused.
        auth()->logout();
        $this->get('/auth/google/callback?code=abc&state=nope')->assertRedirect('/signin');
        $this->assertGuest();
    }

    public function test_app_google_token_signs_in_or_links_an_existing_phone_account(): void
    {
        // A phone customer without email links Google from the profile prompt: gets their email.
        $phoneUser = User::where('role', 'customer')->whereNotNull('phone')->firstOrFail();
        $phoneUser->update(['email' => null, 'google_id' => null]);
        $this->fakeGoogle('android-client.apps.googleusercontent.com', 'tafadzwa@gmail.com', 'g-777');
        $this->actingAs($phoneUser, 'sanctum')->postJson('/api/auth/google', ['id_token' => 'x'])->assertOk()->assertJsonPath('token', null);
        $this->assertSame('tafadzwa@gmail.com', $phoneUser->fresh()->email);

        // A token for someone else's app is rejected.
        $this->fakeGoogle('evil-client.apps.googleusercontent.com');
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/google', ['id_token' => 'x'])->assertStatus(422);
    }

    public function test_customer_sends_a_support_ticket_from_the_order_page(): void
    {
        $order = Order::whereNotNull('user_id')->firstOrFail();
        $this->actingAs($order->user)->post('/account/support', ['topic' => 'Late delivery', 'message' => 'My order is 40 minutes late.', 'order_id' => $order->id])->assertSessionHas('success');
        $ticket = SupportTicket::latest('id')->firstOrFail();
        $this->assertSame($order->id, $ticket->order_id);
        $this->assertStringContainsString($order->reference, $ticket->subject);

        // Someone else's order can't be attached.
        $other = User::factory()->create(['role' => 'customer']);
        $this->actingAs($other)->post('/account/support', ['topic' => 'Other', 'message' => 'Hello there team', 'order_id' => $order->id]);
        $this->assertNull(SupportTicket::latest('id')->first()->order_id);
    }
}

<?php

namespace Tests\Feature\Admin;

use App\Models\AppNotification;
use App\Models\Campaign;
use App\Models\DeviceToken;
use App\Models\Setting;
use App\Models\User;
use App\Services\CampaignService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Onboarding builder, launch screen, announcements, brand colours for the apps. */
class AppContentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Http::fake();
        Storage::fake('public');
        $this->admin = User::where('role', 'super_admin')->first();
    }

    public function test_onboarding_is_drafted_then_published_with_a_new_version()
    {
        $this->actingAs($this->admin)->get('/admin/app-content?app=driver')->assertOk();

        $this->actingAs($this->admin)->post('/admin/app-content/slides', [
            'app' => 'customer', 'heading' => 'Hungry?', 'body' => 'Food fast', 'button_label' => 'Next', 'text_position' => 'bottom',
            'overlay' => ['type' => 'gradient', 'from' => '#000000', 'to' => '#17C74A', 'opacity' => 0.6, 'direction' => 'diagonal'],
            'image' => UploadedFile::fake()->image('hero.jpg', 1080, 1920),
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        // Not visible to the app until published
        $this->getJson('/api/app-content?app=customer')->assertOk()->assertJsonPath('onboarding', null);

        $this->actingAs($this->admin)->post('/admin/app-content/publish', ['app' => 'customer'])->assertSessionHas('success');
        $res = $this->getJson('/api/app-content?app=customer')->assertOk();
        $res->assertJsonPath('onboarding.version', 1)->assertJsonPath('onboarding.slides.0.heading', 'Hungry?')
            ->assertJsonPath('onboarding.slides.0.overlay.direction', 'diagonal');
        $this->assertStringContainsString('/storage/onboarding/', $res->json('onboarding.slides.0.image'));

        // Editing after publishing: the app keeps the old version until the next publish, which bumps the version
        $slide = \App\Models\OnboardingSlide::first();
        $this->actingAs($this->admin)->post("/admin/app-content/slides/{$slide->id}", ['heading' => 'Still hungry?']);
        $this->getJson('/api/app-content?app=customer')->assertJsonPath('onboarding.slides.0.heading', 'Hungry?');
        $this->actingAs($this->admin)->post('/admin/app-content/publish', ['app' => 'customer']);
        $this->getJson('/api/app-content?app=customer')->assertJsonPath('onboarding.version', 2)->assertJsonPath('onboarding.slides.0.heading', 'Still hungry?');

        // Other apps are separate
        $this->getJson('/api/app-content?app=driver')->assertJsonPath('onboarding', null);
    }

    public function test_launch_screen_publishes_immediately()
    {
        $this->actingAs($this->admin)->post('/admin/app-content/launch', ['app' => 'merchant', 'is_enabled' => true, 'background' => '#FFFFFF', 'gradient_to' => '#FDE500', 'tagline' => 'Run your store', 'show_logo' => true, 'duration_ms' => 1200]);
        $this->getJson('/api/app-content?app=merchant')->assertJsonPath('launch.version', 1)->assertJsonPath('launch.tagline', 'Run your store')->assertJsonPath('launch.gradient_to', '#FDE500');
    }

    public function test_service_announcement_reaches_everyone_and_lands_in_inbox()
    {
        User::query()->update(['marketing_opt_in' => false]); // nobody allows marketing
        $driver = User::where('role', 'driver')->first();
        DeviceToken::create(['user_id' => $driver->id, 'token' => 'ExponentPushToken[x]', 'platform' => 'android']);
        $svc = app(CampaignService::class);

        $this->assertSame(0, $svc->audience(['roles' => 'all'])->count()); // marketing: respects opt-out
        $everyone = $svc->audience(['roles' => 'all', 'kind' => 'service'])->count();
        $this->assertGreaterThan(3, $everyone);
        $this->assertSame(1, $svc->audience(['roles' => 'drivers', 'kind' => 'service'])->count());

        $c = Campaign::create(['name' => 'Outage', 'channel' => 'push', 'kind' => 'service', 'title' => 'Payments are back', 'body' => 'EcoCash is working again.', 'audience' => ['roles' => 'drivers'], 'image_path' => '/storage/campaigns/x.jpg', 'link_to' => 'url:https://zvino.co.zw/status']);
        Setting::put('notifications.quiet_hours_start', '00:00');
        Setting::put('notifications.quiet_hours_end', '23:59'); // quiet hours don't block service notices
        $this->assertSame(1, $svc->send($c));

        $n = AppNotification::where('user_id', $driver->id)->latest('id')->first();
        $this->assertSame('announcement', $n->type);
        $this->assertSame('url:https://zvino.co.zw/status', $n->data['link_to']);
        $this->assertStringEndsWith('/storage/campaigns/x.jpg', $n->data['image']);
        Http::assertSent(fn ($r) => str_contains($r->url(), 'exp.host') && ($r->data()[0]['richContent']['image'] ?? null));
    }

    public function test_campaign_link_format_is_validated()
    {
        $this->actingAs($this->admin)->post('/admin/campaigns', ['name' => 'X', 'channel' => 'push', 'body' => 'Hi', 'link_to' => 'javascript:alert(1)'])->assertSessionHasErrors('link_to');
        $this->actingAs($this->admin)->post('/admin/campaigns', ['name' => 'X', 'channel' => 'push', 'kind' => 'service', 'body' => 'Hi', 'link_to' => 'store:3'])->assertSessionHasNoErrors();
    }

    public function test_brand_colours_flow_to_apps_and_website()
    {
        Setting::put('branding.primary_color', '#DF302D');
        $brand = $this->getJson('/api/config')->assertOk()->json('brand');
        $this->assertSame('#DF302D', $brand['primary']);
        $this->assertSame('#FFFFFF', $brand['on_primary']);
        $this->assertStringEndsWith('/brand/logo.png', $brand['logo']);
        $this->get('/')->assertOk()->assertSee('--brand-primary:#DF302D', false)->assertSee('favicon.ico', false);
    }
}

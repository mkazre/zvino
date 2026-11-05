<?php

namespace Tests\Feature\Site;

use App\Mail\ZvinoMail;
use App\Models\AppNotification;
use App\Models\Company;
use App\Models\Driver;
use App\Models\ExchangeRate;
use App\Models\PartnerApplication;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ApplicationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
        Storage::fake('local');
        Storage::fake('public');
        Mail::fake();
        $this->withoutVite();
    }

    private function upload(string $name = 'photo.jpg'): string
    {
        $file = str_ends_with($name, '.pdf') ? UploadedFile::fake()->create($name, 200, 'application/pdf') : UploadedFile::fake()->image($name, 800, 600);

        return $this->postJson('/apply/upload', ['file' => $file])->assertOk()->json('token');
    }

    private function admin(): User
    {
        return User::where('role', 'super_admin')->firstOrFail();
    }

    public function test_sign_up_pages_render(): void
    {
        foreach (['/partners/apply', '/drive/apply', '/business/apply', '/business', '/partners', '/drive'] as $url) {
            $this->get($url)->assertOk();
        }
    }

    public function test_restaurant_application_is_submitted_as_draft_and_can_be_approved_into_a_store(): void
    {
        $answers = [
            'business_name' => 'Gogo’s Grill', 'kind' => 'restaurant', 'cuisine' => 'Braai', 'description' => 'Flame-grilled chicken and sadza.',
            'city' => 'Harare', 'suburb' => 'Avondale', 'address' => '12 King George Rd', 'business_phone' => '0242 123 456',
            'open_days' => ['mon', 'tue', 'sat'], 'opens_at' => '09:00', 'closes_at' => '21:00', 'services' => ['delivery', 'pickup'],
            'owner_name' => 'Tendai Moyo', 'owner_role' => 'owner', 'owner_phone' => '0771 222 333', 'owner_email' => 'Tendai@Example.com', 'owner_id_number' => '63-123456A78',
            'payout_method' => 'ecocash', 'mm_number' => '0771222333', 'mm_name' => 'Tendai Moyo',
            'logo' => $this->upload('logo.png'), 'cover' => $this->upload('cover.jpg'), 'menu' => [$this->upload('menu1.jpg'), $this->upload('menu.pdf')], 'owner_id_doc' => $this->upload('id.pdf'),
        ];

        // Missing terms and a required field → validation errors on the right keys.
        $this->post('/apply/restaurant', ['answers' => array_merge($answers, ['owner_email' => ''])])->assertSessionHasErrors(['answers.owner_email', 'accept_terms']);

        $res = $this->post('/apply/restaurant', ['answers' => $answers, 'accept_terms' => true])->assertSessionHasNoErrors();
        $app = PartnerApplication::firstOrFail();
        $res->assertRedirect("/apply/done/{$app->reference}");
        $this->assertSame('draft', $app->status);
        $this->assertSame('Gogo’s Grill', $app->title);
        $this->assertSame('tendai@example.com', $app->email);
        $this->assertSame('+263771222333', $app->phone);
        $this->assertCount(5, $app->documents);
        Storage::disk('local')->assertExists($app->documents->first()->path);
        $this->assertEmpty(Storage::disk('local')->files('applications/tmp'));

        // Applicant + staff emails, and a bell notification for the super admin.
        Mail::assertSent(ZvinoMail::class, fn ($m) => $m->hasTo('tendai@example.com'));
        Mail::assertSent(ZvinoMail::class, fn ($m) => str_contains($m->subjectLine, 'New restaurant or shop application'));
        $this->assertTrue(AppNotification::where('user_id', $this->admin()->id)->where('type', 'application')->exists());
        $this->get("/apply/done/{$app->reference}")->assertOk();

        // Admin: list, view, open a document, then approve.
        $this->actingAs($this->admin());
        $this->get('/admin/applications')->assertOk();
        $this->get("/admin/applications/{$app->id}")->assertOk();
        $this->get("/admin/applications/{$app->id}/documents/{$app->documents->first()->id}")->assertOk();
        $this->post("/admin/applications/{$app->id}/status", ['status' => 'in_review'])->assertRedirect();
        $this->post("/admin/applications/{$app->id}/approve", ['commission_pct' => 12, 'store_status' => 'pending'])->assertRedirect()->assertSessionHasNoErrors();

        $app->refresh();
        $this->assertSame('approved', $app->status);
        $vendor = Vendor::where('name', 'Gogo’s Grill')->firstOrFail();
        $this->assertTrue($app->approvable->is($vendor));
        $this->assertSame('pending', $vendor->status);
        $this->assertEquals(12, $vendor->commission_pct);
        $this->assertSame('ecocash', $vendor->payout_method);
        $this->assertSame('+263771222333', $vendor->payout_details['phone']);
        $this->assertNotNull($vendor->logo_path);
        $this->assertCount(3, $vendor->hours);
        $owner = User::where('email', 'tendai@example.com')->firstOrFail();
        $this->assertSame('vendor_manager', $owner->role);
        $this->assertSame($vendor->id, $owner->vendor_id);
        Mail::assertSent(ZvinoMail::class, fn ($m) => str_contains($m->subjectLine, 'You’re approved') && $m->buttonUrl !== null);
        // Documents stay viewable after approval.
        $this->get("/admin/applications/{$app->id}/documents/{$app->documents->first()->id}")->assertOk();
    }

    public function test_driver_application_conditional_fields_and_approval(): void
    {
        $base = [
            'full_name' => 'Farai Chikore', 'phone' => '0773 456 789', 'date_of_birth' => '1995-04-02', 'national_id' => '63-987654B21', 'city' => 'Harare', 'suburb' => 'Mbare',
            'home_address' => '5 Main St', 'emergency_name' => 'Rufaro', 'emergency_phone' => '0772111222', 'vehicle_type' => 'motorbike',
            'availability' => ['evenings'], 'has_smartphone' => true, 'payout_method' => 'bank', 'bank_name' => 'CBZ', 'bank_branch' => 'Kwame Nkrumah',
            'bank_account_name' => 'F Chikore', 'bank_account_number' => '0123456789', 'bank_currency' => 'USD',
            'selfie' => $this->upload('me.jpg'), 'national_id_doc' => $this->upload('id.jpg'),
        ];
        // Motorbike → plate, licence and registration are required.
        $this->post('/apply/driver', ['answers' => $base, 'accept_terms' => true])->assertSessionHasErrors(['answers.vehicle_plate', 'answers.licence_number', 'answers.licence_doc']);
        // Bicycle → not required.
        $this->post('/apply/driver', ['answers' => array_merge($base, ['vehicle_type' => 'bicycle']), 'accept_terms' => true])->assertRedirect()->assertSessionHasNoErrors();

        $app = PartnerApplication::where('type', 'driver')->firstOrFail();
        $this->actingAs($this->admin())->post("/admin/applications/{$app->id}/approve")->assertSessionHasNoErrors();
        $driver = Driver::whereHas('user', fn ($q) => $q->where('phone', '+263773456789'))->firstOrFail();
        $this->assertSame('approved', $driver->status);
        $this->assertSame('bicycle', $driver->vehicle_type);
        $this->assertSame('bank', $driver->payout_method);
        $this->assertSame('CBZ', $driver->payout_details['bank']);
        $this->assertSame(2, $driver->documents()->count());
    }

    public function test_corporate_application_creates_company_with_budget_in_zig(): void
    {
        $answers = [
            'company_name' => 'Acme Mining', 'industry' => 'Mining & energy', 'employees' => '51-200', 'city' => 'Harare', 'address' => '1 Samora Machel',
            'contact_name' => 'Nyasha Dube', 'job_title' => 'HR Manager', 'contact_email' => 'nyasha@acme.co.zw', 'contact_phone' => '0712345678',
            'billing_email' => 'accounts@acme.co.zw', 'payment_terms' => 'invoice_30', 'billing_method' => 'bank', 'uses' => ['staff_lunch'], 'staff_count' => 40,
            'monthly_budget_usd' => 1000, 'daily_allowance_usd' => 5, 'order_days' => ['1', '2', '3', '4', '5'],
        ];
        $this->post('/apply/corporate', ['answers' => $answers, 'accept_terms' => true])->assertSessionHasNoErrors();
        $app = PartnerApplication::where('type', 'corporate')->firstOrFail();
        $this->actingAs($this->admin())->post("/admin/applications/{$app->id}/approve")->assertSessionHasNoErrors();

        $company = Company::where('name', 'Acme Mining')->firstOrFail();
        $rate = ExchangeRate::current();
        $this->assertEqualsWithDelta(1000 * $rate, $company->monthly_budget_zig, 0.01);
        $this->assertEqualsWithDelta(5 * $rate, $company->daily_allowance_zig, 0.01);
        $this->assertSame([1, 2, 3, 4, 5], $company->allowed_days);
        $this->assertSame('admin', $company->members()->first()->role);
    }

    public function test_upload_rejects_wrong_types_and_tampered_tokens(): void
    {
        $this->postJson('/apply/upload', ['file' => UploadedFile::fake()->create('virus.exe', 10)])->assertStatus(422);
        $this->post('/apply/corporate', ['answers' => ['registration_doc' => 'not-a-token'], 'accept_terms' => true])->assertSessionHasErrors();
    }

    public function test_reviewing_requires_permission(): void
    {
        $customer = User::factory()->create(['role' => 'customer']);
        $this->actingAs($customer)->get('/admin/applications')->assertForbidden();
    }
}

<?php

namespace App\Providers;

use App\Models\Driver;
use App\Models\Vendor;
use App\Support\Permissions;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Website sign-up forms: separate budgets for file uploads and final submits (per IP).
        \Illuminate\Support\Facades\RateLimiter::for('apply-upload', fn ($r) => \Illuminate\Cache\RateLimiting\Limit::perMinute(40)->by('apply-upload|'.$r->ip()));
        \Illuminate\Support\Facades\RateLimiter::for('apply-submit', fn ($r) => \Illuminate\Cache\RateLimiting\Limit::perMinute(6)->by('apply-submit|'.$r->ip()));

        // Short, stable names in polymorphic columns (ledger, payouts, payments).
        Relation::enforceMorphMap([
            'vendor' => Vendor::class,
            'supplier_source' => \App\Models\SupplierSource::class,
            'driver' => Driver::class,
            'gift_card' => \App\Models\GiftCard::class,
            'subscription' => \App\Models\Subscription::class,
            'order' => \App\Models\Order::class,
            'refund' => \App\Models\Refund::class,
            'payout' => \App\Models\Payout::class,
            'user' => \App\Models\User::class,
            'home_block' => \App\Models\HomeBlock::class,
            'item' => \App\Models\Item::class,
            'zone' => \App\Models\Zone::class,
            'setting' => \App\Models\Setting::class,
            'promo_code' => \App\Models\PromoCode::class,
            'catering_request' => \App\Models\CateringRequest::class,
            'company' => \App\Models\Company::class,
            'company_invoice' => \App\Models\CompanyInvoice::class,
            'hamper' => \App\Models\Hamper::class,
            'safety_zone' => \App\Models\SafetyZone::class,
            'app_content' => \App\Models\AppContent::class,
            'onboarding_slide' => \App\Models\OnboardingSlide::class,
            'partner_application' => \App\Models\PartnerApplication::class,
            'campaign' => \App\Models\Campaign::class,
            'recurring_order' => \App\Models\RecurringOrder::class,
        ]);

        // Every permission in Permissions::ALL is usable as a gate: @can('refunds.approve'), ->can('refunds.approve').
        Gate::before(fn ($user, string $ability) => array_key_exists($ability, Permissions::ALL) ? Permissions::allows($user, $ability) : null);
    }
}

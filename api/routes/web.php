<?php

use App\Http\Controllers\Admin\AuditController;
use App\Http\Controllers\Admin\CampaignController;
use App\Http\Controllers\Admin\CatalogController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\DispatchController;
use App\Http\Controllers\Admin\DriverController;
use App\Http\Controllers\Admin\HomeBuilderController;
use App\Http\Controllers\Admin\KitchenController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\PayoutController;
use App\Http\Controllers\Admin\PosController;
use App\Http\Controllers\Admin\RefundController;
use App\Http\Controllers\Admin\ReportController;
use App\Http\Controllers\Admin\ReviewController;
use App\Http\Controllers\Admin\RewardsPromosController;
use App\Http\Controllers\Admin\SearchController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\StaffController;
use App\Http\Controllers\Admin\SupportController;
use App\Http\Controllers\Admin\VendorController;
use App\Http\Controllers\Admin\ZoneController;
use App\Http\Middleware\EnsureMarketplaceMode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

// Customer website at "/" (routes/site.php). Starter-kit code that redirects to route('home') lands there.
require __DIR__.'/site.php';
Route::redirect('/home', '/')->name('home');

// Every admin route is guarded by a permission from App\Support\Permissions (editable per role).
Route::middleware(['auth', 'staff'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
    Route::post('broadcasting/auth', fn (Request $request) => Broadcast::auth($request));

    Route::prefix('admin')->name('admin.')->group(function () {
        Route::get('search', SearchController::class)->name('search');

        Route::middleware('can:orders.view')->group(function () {
            Route::get('orders', [OrderController::class, 'index'])->name('orders');
            Route::get('orders/export', [OrderController::class, 'export'])->name('orders.export');
            Route::get('orders/{order}', [OrderController::class, 'show'])->name('orders.show');
            Route::get('orders/{order}/prescription', [OrderController::class, 'prescription'])->name('orders.prescription');
            Route::get('orders/{order}/till-slip', [OrderController::class, 'tillSlip'])->name('orders.till-slip');
            Route::get('reviews', [ReviewController::class, 'index'])->name('reviews');
        });
        Route::middleware('can:orders.manage')->group(function () {
            Route::get('catering', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'catering'])->name('catering');
            Route::post('catering/{catering}', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'cateringAction'])->name('catering.action');
            Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->name('orders.status');
            Route::post('orders/{order}/cancel', [OrderController::class, 'cancel'])->name('orders.cancel');
            Route::post('orders/{order}/note', [OrderController::class, 'note'])->name('orders.note');
            Route::patch('reviews/{review}', [ReviewController::class, 'update'])->name('reviews.update');
        });

        Route::middleware('can:dispatch.manage')->group(function () {
            Route::get('dispatch', [DispatchController::class, 'index'])->name('dispatch');
            Route::get('dispatch/live', [DispatchController::class, 'live'])->name('dispatch.live');
            Route::post('dispatch/{order}/assign', [DispatchController::class, 'assign'])->name('dispatch.assign');
            Route::post('dispatch/{order}/retry', [DispatchController::class, 'retry'])->name('dispatch.retry');
        });

        Route::middleware('can:refunds.approve')->group(function () {
            Route::get('refunds', [RefundController::class, 'index'])->name('refunds');
            Route::post('refunds/{refund}/approve', [RefundController::class, 'approve'])->name('refunds.approve');
            Route::post('refunds/{refund}/reject', [RefundController::class, 'reject'])->name('refunds.reject');
            Route::post('refunds/{refund}/paid', [RefundController::class, 'markPaid'])->name('refunds.paid');
            Route::post('orders/{order}/refund', [RefundController::class, 'issue'])->name('orders.refund');
        });

        Route::middleware('can:support.manage')->group(function () {
            Route::get('support', [SupportController::class, 'index'])->name('support');
            Route::get('support/{ticket}', [SupportController::class, 'show'])->name('support.show');
            Route::post('support/{ticket}/reply', [SupportController::class, 'reply'])->name('support.reply');
            Route::patch('support/{ticket}', [SupportController::class, 'update'])->name('support.update');
        });

        Route::middleware('can:catalog.manage')->group(function () {
            Route::get('hampers', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'hampers'])->name('hampers');
            Route::post('hampers/{hamper?}', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'saveHamper'])->name('hampers.save');
            Route::get('catalog', [CatalogController::class, 'index'])->name('catalog');
            Route::get('catalog/import', [\App\Http\Controllers\Admin\CatalogImportController::class, 'show'])->name('catalog.import');
            Route::get('catalog/import/template', [\App\Http\Controllers\Admin\CatalogImportController::class, 'template'])->name('catalog.import.template');
            Route::post('catalog/import/preview', [\App\Http\Controllers\Admin\CatalogImportController::class, 'preview'])->middleware('throttle:20,1')->name('catalog.import.preview');
            Route::post('catalog/import/run', [\App\Http\Controllers\Admin\CatalogImportController::class, 'run'])->middleware('throttle:10,1')->name('catalog.import.run');
            Route::post('catalog/items', [CatalogController::class, 'store'])->name('catalog.store');
            Route::post('catalog/items/{item}', [CatalogController::class, 'update'])->name('catalog.update'); // POST for multipart
            Route::patch('catalog/items/{item}/toggle', [CatalogController::class, 'toggle'])->name('catalog.toggle');
            Route::delete('catalog/items/{item}', [CatalogController::class, 'destroy'])->name('catalog.destroy');
            Route::post('catalog/categories', [CatalogController::class, 'storeCategory'])->name('catalog.categories.store');
            Route::patch('catalog/categories/{category}', [CatalogController::class, 'updateCategory'])->name('catalog.categories.update');
            Route::delete('catalog/categories/{category}', [CatalogController::class, 'destroyCategory'])->name('catalog.categories.destroy');
            Route::post('catalog/modifier-groups/{group?}', [CatalogController::class, 'saveGroup'])->name('catalog.groups.save');
            Route::delete('catalog/modifier-groups/{group}', [CatalogController::class, 'destroyGroup'])->name('catalog.groups.destroy');
        });

        // Supplier integrations (TM Pick n Pay): catalogue, markups, branch stores, weekly sync.
        Route::middleware(['can:vendors.manage', EnsureMarketplaceMode::class])->prefix('suppliers/tmpnp')->name('suppliers.')->group(function () {
            $c = \App\Http\Controllers\Admin\SupplierController::class;
            Route::get('/', [$c, 'show'])->name('show');
            Route::get('status', [$c, 'status'])->name('status');
            Route::post('settings', [$c, 'settings'])->name('settings');
            Route::post('refresh', [$c, 'refresh'])->middleware('throttle:6,1')->name('refresh');
            Route::post('categories', [$c, 'categories'])->name('categories');
            Route::post('categories/{category}/markup', [$c, 'categoryMarkup'])->name('categories.markup');
            Route::post('products/markup', [$c, 'productMarkup'])->name('products.markup');
            Route::post('stores', [$c, 'stores'])->name('stores');
            Route::post('sync', [$c, 'sync'])->middleware('throttle:4,1')->name('sync');
        });
        Route::middleware(['can:vendors.manage', EnsureMarketplaceMode::class])->group(function () {
            Route::get('vendors', [VendorController::class, 'index'])->name('vendors');
            Route::post('vendors', [VendorController::class, 'store'])->name('vendors.store');
            Route::get('vendors/{vendor}', [VendorController::class, 'show'])->name('vendors.show');
            Route::post('vendors/{vendor}', [VendorController::class, 'update'])->name('vendors.update'); // POST for logo upload
            Route::put('vendors/{vendor}/hours', [VendorController::class, 'hours'])->name('vendors.hours');
        });

        Route::middleware('can:applications.review')->group(function () {
            Route::get('applications', [\App\Http\Controllers\Admin\ApplicationController::class, 'index'])->name('applications');
            Route::get('applications/{application}', [\App\Http\Controllers\Admin\ApplicationController::class, 'show'])->name('applications.show');
            Route::post('applications/{application}/status', [\App\Http\Controllers\Admin\ApplicationController::class, 'status'])->name('applications.status');
            Route::post('applications/{application}/notes', [\App\Http\Controllers\Admin\ApplicationController::class, 'notes'])->name('applications.notes');
            Route::post('applications/{application}/details', [\App\Http\Controllers\Admin\ApplicationController::class, 'updateDetails'])->name('applications.details');
            Route::post('applications/{application}/approve', [\App\Http\Controllers\Admin\ApplicationController::class, 'approve'])->name('applications.approve');
            Route::get('applications/{application}/documents/{document}', [\App\Http\Controllers\Admin\ApplicationController::class, 'document'])->name('applications.document');
            Route::delete('applications/{application}', [\App\Http\Controllers\Admin\ApplicationController::class, 'destroy'])->name('applications.destroy');
        });

        // Bell: in-app notifications for the signed-in staff member.
        // Live alerts for the admin panel and kitchen (new orders ring until acknowledged).
        Route::get('alerts', function (Request $request) {
            $q = $request->user()->appNotifications();
            if (! $request->has('after')) {
                return response()->json(['latest_id' => (int) $q->max('id'), 'items' => [], 'ringing' => $request->user()->appNotifications()->where('type', 'new_order')->whereNull('read_at')->where('created_at', '>=', now()->subHours(3))->latest()->limit(5)->get(['id', 'type', 'title', 'body', 'data', 'created_at'])]);
            }
            $items = $q->where('id', '>', $request->integer('after'))->orderBy('id')->limit(20)->get(['id', 'type', 'title', 'body', 'data', 'created_at']);
            $ringing = $request->user()->appNotifications()->where('type', 'new_order')->whereNull('read_at')->where('created_at', '>=', now()->subHours(3))->latest()->limit(5)->get(['id', 'type', 'title', 'body', 'data', 'created_at']);

            return response()->json(['latest_id' => (int) ($items->max('id') ?? $request->integer('after')), 'items' => $items, 'ringing' => $ringing]);
        })->middleware('throttle:240,1')->name('alerts');
        Route::post('alerts/{notification}/ack', function (Request $request, \App\Models\AppNotification $notification) {
            abort_unless($notification->user_id === $request->user()->id, 404);
            // Acknowledging a new order silences it for this person.
            $notification->update(['read_at' => $notification->read_at ?? now()]);

            return response()->json(['ok' => true]);
        })->name('alerts.ack');
        Route::post('notifications/read', function (Request $request) {
            $request->user()->appNotifications()->whereNull('read_at')->update(['read_at' => now()]);

            return back();
        })->name('notifications.read');
        Route::get('notifications/{notification}', function (Request $request, \App\Models\AppNotification $notification) {
            abort_unless($notification->user_id === $request->user()->id, 404);
            $notification->update(['read_at' => $notification->read_at ?? now()]);
            $url = $notification->data['url'] ?? '/dashboard';

            return redirect(str_starts_with($url, '/') ? $url : '/dashboard');
        })->name('notifications.open');

        Route::middleware('can:drivers.manage')->group(function () {
            Route::get('drivers', [DriverController::class, 'index'])->name('drivers');
            Route::get('drivers/{driver}', [DriverController::class, 'show'])->name('drivers.show');
            Route::patch('drivers/{driver}', [DriverController::class, 'update'])->name('drivers.update');
            Route::patch('drivers/documents/{document}', [DriverController::class, 'reviewDocument'])->name('drivers.documents');
            Route::get('drivers/documents/{document}/file', [DriverController::class, 'documentFile'])->name('drivers.documents.file');
        });

        Route::middleware('can:customers.manage')->group(function () {
            Route::get('companies', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'companies'])->name('companies');
            Route::post('companies/{company?}', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'saveCompany'])->name('companies.save');
            Route::post('companies/{company}/members', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'addMembers'])->name('companies.members');
            Route::patch('company-members/{member}', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'updateMember'])->name('companies.member');
            Route::post('company-invoices', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'invoice'])->name('companies.invoice');
            Route::post('company-invoices/{invoice}/paid', [\App\Http\Controllers\Admin\SpecialOrdersController::class, 'invoicePaid'])->name('companies.invoice.paid');
            Route::get('users', [CustomerController::class, 'index'])->name('users');
            Route::get('users/export', [CustomerController::class, 'export'])->name('users.export');
            Route::get('users/{user}', [CustomerController::class, 'show'])->name('users.show');
            Route::post('users/{user}/wallet', [CustomerController::class, 'adjustWallet'])->name('users.wallet');
            Route::post('users/{user}/ban', [CustomerController::class, 'toggleBan'])->name('users.ban');
        });

        Route::middleware('can:staff.manage')->group(function () {
            Route::get('staff', [StaffController::class, 'index'])->name('staff');
            Route::post('staff', [StaffController::class, 'store'])->name('staff.store');
            Route::patch('staff/{user}', [StaffController::class, 'update'])->name('staff.update');
            Route::put('staff/permissions/{role}', [StaffController::class, 'permissions'])->name('staff.permissions');
        });

        Route::middleware('can:marketing.manage')->group(function () {
            Route::get('app-content', [\App\Http\Controllers\Admin\AppContentController::class, 'index'])->name('app-content');
            Route::post('app-content/slides/{slide?}', [\App\Http\Controllers\Admin\AppContentController::class, 'saveSlide'])->name('app-content.slide');
            Route::delete('app-content/slides/{slide}', [\App\Http\Controllers\Admin\AppContentController::class, 'deleteSlide'])->name('app-content.slide.delete');
            Route::post('app-content/reorder', [\App\Http\Controllers\Admin\AppContentController::class, 'reorder'])->name('app-content.reorder');
            Route::post('app-content/publish', [\App\Http\Controllers\Admin\AppContentController::class, 'publish'])->name('app-content.publish');
            Route::post('app-content/launch', [\App\Http\Controllers\Admin\AppContentController::class, 'saveLaunch'])->name('app-content.launch');
            Route::get('home-builder', [HomeBuilderController::class, 'index'])->name('home-builder');
            Route::post('home-builder/blocks', [HomeBuilderController::class, 'store'])->name('home-builder.store');
            Route::patch('home-builder/blocks/{block}', [HomeBuilderController::class, 'update'])->name('home-builder.update');
            Route::post('home-builder/reorder', [HomeBuilderController::class, 'reorder'])->name('home-builder.reorder');
            Route::post('home-builder/upload', [HomeBuilderController::class, 'upload'])->name('home-builder.upload');
            Route::post('home-builder/blocks/{block}/duplicate', [HomeBuilderController::class, 'duplicate'])->name('home-builder.duplicate');
            Route::delete('home-builder/blocks/{block}', [HomeBuilderController::class, 'destroy'])->name('home-builder.destroy');

            Route::get('rewards-promos', [RewardsPromosController::class, 'index'])->name('rewards');
            Route::post('rewards/{reward?}', [RewardsPromosController::class, 'saveReward'])->name('rewards.save');
            Route::patch('rewards/{reward}/toggle', [RewardsPromosController::class, 'toggleReward'])->name('rewards.toggle');
            Route::post('promos/{promo?}', [RewardsPromosController::class, 'savePromo'])->name('promos.save');
            Route::patch('promos/{promo}/toggle', [RewardsPromosController::class, 'togglePromo'])->name('promos.toggle');
            Route::post('plans/{plan?}', [RewardsPromosController::class, 'savePlan'])->name('plans.save');

            Route::get('campaigns', [CampaignController::class, 'index'])->name('campaigns');
            Route::post('campaigns/{campaign?}', [CampaignController::class, 'save'])->name('campaigns.save');
            Route::post('campaigns/{campaign}/send', [CampaignController::class, 'send'])->name('campaigns.send');
            Route::post('campaigns-audience', [CampaignController::class, 'audience'])->name('campaigns.audience');
        });

        Route::middleware('can:payouts.manage')->group(function () {
            Route::get('payouts', [PayoutController::class, 'index'])->name('payouts');
            Route::post('payouts/generate', [PayoutController::class, 'generate'])->name('payouts.generate');
            Route::post('payouts/{payout}/paid', [PayoutController::class, 'markPaid'])->name('payouts.paid');
        });

        Route::middleware('can:reports.view')->group(function () {
            Route::get('reports', [ReportController::class, 'index'])->name('reports');
            Route::get('reports/export/{report}', [ReportController::class, 'export'])->name('reports.export');
        });

        Route::middleware('can:settings.manage')->group(function () {
            Route::get('settings/{group?}', [SettingsController::class, 'index'])->name('settings');
            Route::post('settings/test-email', [SettingsController::class, 'testEmail'])->name('settings.test-email');
            Route::post('settings/reload-env', [SettingsController::class, 'reloadEnv'])->name('settings.reload-env');
            Route::post('settings/{group}', [SettingsController::class, 'update'])->name('settings.update');
            Route::post('settings-platform-mode', [SettingsController::class, 'platformMode'])->name('settings.mode');
            Route::post('settings-exchange-rate', [SettingsController::class, 'exchangeRate'])->name('settings.rate');
            Route::post('settings-pages/{page}', [SettingsController::class, 'savePage'])->name('settings.pages');
            Route::post('settings-templates/{template}', [SettingsController::class, 'saveTemplate'])->name('settings.templates');

            Route::get('zones', [ZoneController::class, 'index'])->name('zones');
            Route::post('zones-rain', [ZoneController::class, 'rain'])->name('zones.rain');
            Route::post('safety-zones/{safetyZone?}', [ZoneController::class, 'saveSafety'])->name('safety-zones.save');
            Route::delete('safety-zones/{safetyZone}', [ZoneController::class, 'destroySafety'])->name('safety-zones.destroy');
            Route::post('zones/{zone?}', [ZoneController::class, 'save'])->name('zones.save');
            Route::delete('zones/{zone}', [ZoneController::class, 'destroy'])->name('zones.destroy');
        });

        Route::get('audit', AuditController::class)->middleware('can:audit.view')->name('audit');

        Route::middleware('can:pos.use')->group(function () {
            Route::get('pos', [PosController::class, 'index'])->name('pos');
            Route::post('pos/sales', [PosController::class, 'store'])->name('pos.store');
            Route::get('pos/payments/{payment}', [PosController::class, 'paymentStatus'])->name('pos.payment');
        });

        Route::middleware('can:kitchen.use')->group(function () {
            Route::get('kitchen', [KitchenController::class, 'index'])->name('kitchen');
            Route::patch('api/orders/{order}/stage', [KitchenController::class, 'advance'])->name('kitchen.advance');
            Route::post('kitchen/{vendor}/rush', [KitchenController::class, 'rush'])->name('kitchen.rush');
        });
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

// Data-light resized images (also used by the apps).
Route::get('img/{width}/{path}', [\App\Http\Controllers\ImageController::class, 'show'])->whereNumber('width')->where('path', '.*')->name('img');

// Demo only: "pay" a counter QR from your phone when Paynow is simulated (never in production).
Route::get('pay/demo/{payment}', function (\App\Models\Payment $payment, \Illuminate\Http\Request $request) {
    abort_if(app()->isProduction() || ! app(\App\Services\Payments\PaynowGateway::class)->fake(), 404);
    abort_unless(hash_equals(hash_hmac('sha256', (string) $payment->id, config('app.key')), (string) $request->query('sig')), 403);
    app(\App\Services\OrderService::class)->markPaid($payment);

    return response('<meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;text-align:center;padding:60px"><h1>✅ Paid</h1><p>ZiG '.number_format($payment->amount_zig, 2).' (demo payment)</p></body>');
})->name('pay.demo');

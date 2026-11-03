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

Route::redirect('/', '/dashboard')->name('home');

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
            Route::get('reviews', [ReviewController::class, 'index'])->name('reviews');
        });
        Route::middleware('can:orders.manage')->group(function () {
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
            Route::get('catalog', [CatalogController::class, 'index'])->name('catalog');
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

        Route::middleware(['can:vendors.manage', EnsureMarketplaceMode::class])->group(function () {
            Route::get('vendors', [VendorController::class, 'index'])->name('vendors');
            Route::post('vendors', [VendorController::class, 'store'])->name('vendors.store');
            Route::get('vendors/{vendor}', [VendorController::class, 'show'])->name('vendors.show');
            Route::post('vendors/{vendor}', [VendorController::class, 'update'])->name('vendors.update'); // POST for logo upload
            Route::put('vendors/{vendor}/hours', [VendorController::class, 'hours'])->name('vendors.hours');
        });

        Route::middleware('can:drivers.manage')->group(function () {
            Route::get('drivers', [DriverController::class, 'index'])->name('drivers');
            Route::get('drivers/{driver}', [DriverController::class, 'show'])->name('drivers.show');
            Route::patch('drivers/{driver}', [DriverController::class, 'update'])->name('drivers.update');
            Route::patch('drivers/documents/{document}', [DriverController::class, 'reviewDocument'])->name('drivers.documents');
            Route::get('drivers/documents/{document}/file', [DriverController::class, 'documentFile'])->name('drivers.documents.file');
        });

        Route::middleware('can:customers.manage')->group(function () {
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
            Route::get('home-builder', [HomeBuilderController::class, 'index'])->name('home-builder');
            Route::post('home-builder/blocks', [HomeBuilderController::class, 'store'])->name('home-builder.store');
            Route::patch('home-builder/blocks/{block}', [HomeBuilderController::class, 'update'])->name('home-builder.update');
            Route::post('home-builder/reorder', [HomeBuilderController::class, 'reorder'])->name('home-builder.reorder');
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
            Route::post('settings/{group}', [SettingsController::class, 'update'])->name('settings.update');
            Route::post('settings-platform-mode', [SettingsController::class, 'platformMode'])->name('settings.mode');
            Route::post('settings-exchange-rate', [SettingsController::class, 'exchangeRate'])->name('settings.rate');
            Route::post('settings-pages/{page}', [SettingsController::class, 'savePage'])->name('settings.pages');
            Route::post('settings-templates/{template}', [SettingsController::class, 'saveTemplate'])->name('settings.templates');

            Route::get('zones', [ZoneController::class, 'index'])->name('zones');
            Route::post('zones/{zone?}', [ZoneController::class, 'save'])->name('zones.save');
            Route::delete('zones/{zone}', [ZoneController::class, 'destroy'])->name('zones.destroy');
        });

        Route::get('audit', AuditController::class)->middleware('can:audit.view')->name('audit');

        Route::middleware('can:pos.use')->group(function () {
            Route::get('pos', [PosController::class, 'index'])->name('pos');
            Route::post('pos/sales', [PosController::class, 'store'])->name('pos.store');
        });

        Route::middleware('can:kitchen.use')->group(function () {
            Route::get('kitchen', [KitchenController::class, 'index'])->name('kitchen');
            Route::patch('api/orders/{order}/stage', [KitchenController::class, 'advance'])->name('kitchen.advance');
        });
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

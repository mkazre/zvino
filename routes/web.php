<?php

use App\Http\Controllers\Admin\CatalogController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\HomeBuilderController;
use App\Http\Controllers\Admin\KitchenController;
use App\Http\Controllers\Admin\OrderController;
use App\Http\Controllers\Admin\PosController;
use App\Http\Controllers\Admin\RewardsPromosController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\VendorController;
use App\Http\Middleware\EnsureMarketplaceMode;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

Route::redirect('/', '/dashboard')->name('home');

Route::middleware(['auth', 'staff'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');
    Route::post('broadcasting/auth', fn (Request $request) => Broadcast::auth($request));

    $managers = 'staff:super_admin,vendor_manager';
    $admins = 'staff:super_admin';

    Route::prefix('admin')->name('admin.')->group(function () use ($managers, $admins) {
        Route::get('orders', [OrderController::class, 'index'])->middleware('staff:super_admin,vendor_manager,cashier')->name('orders');
        Route::patch('orders/{order}/status', [OrderController::class, 'updateStatus'])->middleware($managers)->name('orders.status');

        Route::middleware($managers)->group(function () {
            Route::get('catalog', [CatalogController::class, 'index'])->name('catalog');
            Route::post('catalog/items', [CatalogController::class, 'store'])->name('catalog.store');
            Route::post('catalog/items/{item}', [CatalogController::class, 'update'])->name('catalog.update'); // POST for multipart
            Route::patch('catalog/items/{item}/toggle', [CatalogController::class, 'toggle'])->name('catalog.toggle');
            Route::delete('catalog/items/{item}', [CatalogController::class, 'destroy'])->name('catalog.destroy');
            Route::post('catalog/categories', [CatalogController::class, 'storeCategory'])->name('catalog.categories.store');
        });

        Route::middleware($admins)->group(function () {
            Route::post('settings/platform-mode', [SettingsController::class, 'platformMode'])->name('settings.mode');
            Route::post('settings/exchange-rate', [SettingsController::class, 'exchangeRate'])->name('settings.rate');

            Route::middleware(EnsureMarketplaceMode::class)->group(function () {
                Route::get('vendors', [VendorController::class, 'index'])->name('vendors');
                Route::post('vendors', [VendorController::class, 'store'])->name('vendors.store');
                Route::patch('vendors/{vendor}', [VendorController::class, 'update'])->name('vendors.update');
            });

            Route::get('users', [UserController::class, 'index'])->name('users');
            Route::post('users/staff', [UserController::class, 'storeStaff'])->name('users.staff.store');
            Route::patch('users/staff/{user}', [UserController::class, 'updateStaff'])->name('users.staff.update');

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
        });

        Route::middleware('staff:super_admin,vendor_manager,cashier')->group(function () {
            Route::get('pos', [PosController::class, 'index'])->name('pos');
            Route::post('pos/sales', [PosController::class, 'store'])->name('pos.store');
        });

        Route::middleware('staff:super_admin,vendor_manager,kitchen')->group(function () {
            Route::get('kitchen', [KitchenController::class, 'index'])->name('kitchen');
            Route::patch('api/orders/{order}/stage', [KitchenController::class, 'advance'])->name('kitchen.advance');
        });
    });
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';

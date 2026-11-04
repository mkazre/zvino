<?php

use App\Http\Controllers\Site\AccountController;
use App\Http\Controllers\Site\CheckoutController;
use App\Http\Controllers\Site\SignInController;
use App\Http\Controllers\Site\SiteController;
use App\Http\Middleware\EnsureSiteOpen;
use Illuminate\Support\Facades\Route;

/*
 * Public customer website (zvino.co.zw). Admin lives under /dashboard and /admin.
 */
Route::middleware(EnsureSiteOpen::class)->name('site.')->group(function () {
    Route::get('/', [SiteController::class, 'home'])->name('home');
    Route::get('stores', [SiteController::class, 'stores'])->name('stores');
    Route::get('store/{slug}', [SiteController::class, 'store'])->name('store');
    Route::get('p/{slug}', [SiteController::class, 'page'])->name('page');
    Route::get('plus', [SiteController::class, 'plus'])->name('plus');
    Route::get('gift-cards', [SiteController::class, 'giftCards'])->name('gift-cards');
    Route::get('partners', [SiteController::class, 'partners'])->name('partners');
    Route::get('drive', [SiteController::class, 'drivers'])->name('drivers');
    Route::get('group/{code}', [SiteController::class, 'group'])->name('group');
    Route::post('city', [SiteController::class, 'setCity'])->name('city');

    // Group orders from the browser (session-authenticated twins of the API routes; guests allowed to add items).
    Route::get('group/{code}/data', [\App\Http\Controllers\Api\GroupOrderController::class, 'show'])->name('group.data');
    Route::post('group/{code}/items', [\App\Http\Controllers\Api\GroupOrderController::class, 'addItem'])->middleware('throttle:30,1')->name('group.items');
    Route::post('group/{code}/checkout', [\App\Http\Controllers\Api\GroupOrderController::class, 'checkout'])->middleware('auth')->name('group.checkout');

    Route::get('signin', [SignInController::class, 'show'])->name('signin');
    Route::post('signin/code', [SignInController::class, 'sendCode'])->middleware('throttle:10,1')->name('signin.code');
    Route::post('signin/verify', [SignInController::class, 'verify'])->middleware('throttle:10,1')->name('signin.verify');
    Route::post('signout', [SignInController::class, 'logout'])->name('signout');

    Route::middleware('auth')->group(function () {
        Route::get('checkout', [CheckoutController::class, 'show'])->name('checkout');
        Route::post('checkout/sync', [CheckoutController::class, 'sync'])->name('checkout.sync');
        Route::post('checkout/quote', [CheckoutController::class, 'quote'])->name('checkout.quote');
        Route::post('checkout', [CheckoutController::class, 'place'])->name('checkout.place');

        Route::get('account', [AccountController::class, 'index'])->name('account');
        Route::post('account/profile', [AccountController::class, 'updateProfile'])->name('account.profile');
        Route::post('account/addresses', [AccountController::class, 'storeAddress'])->name('account.addresses');
        Route::delete('account/addresses/{id}', [AccountController::class, 'destroyAddress'])->name('account.addresses.destroy');
        Route::post('account/rewards', [AccountController::class, 'redeemReward'])->name('account.rewards');
        Route::post('account/gift-cards', [AccountController::class, 'buyGiftCard'])->name('account.gift-cards');
        Route::post('account/gift-cards/redeem', [AccountController::class, 'redeemGiftCard'])->name('account.gift-cards.redeem');
        Route::post('account/plus', [AccountController::class, 'subscribe'])->name('account.plus');
        Route::post('account/referral', [AccountController::class, 'applyReferral'])->name('account.referral');
        Route::post('store/{vendor}/favorite', [AccountController::class, 'toggleFavorite'])->name('favorite');
        Route::post('store/{vendor}/group', [AccountController::class, 'startGroup'])->name('group.start');

        Route::get('orders/{order}', [AccountController::class, 'order'])->name('order');
        Route::get('orders/{order}/status', [AccountController::class, 'orderStatus'])->name('order.status');
        Route::post('orders/{order}/cancel', [AccountController::class, 'cancel'])->name('order.cancel');
        Route::post('orders/{order}/review', [AccountController::class, 'review'])->name('order.review');
        Route::post('orders/{order}/reorder', [AccountController::class, 'reorder'])->name('order.reorder');
    });
});

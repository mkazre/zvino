<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\HomeLayoutController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\Driver\DriverController;
use App\Http\Controllers\Api\EngagementController;
use App\Http\Controllers\Api\GroupOrderController;
use App\Http\Controllers\Api\GrowthController;
use App\Http\Controllers\Api\Merchant\MerchantController;
use App\Http\Controllers\Api\PaymentController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Route;

// Public
Route::get('config', [CatalogController::class, 'config']);
Route::get('home-layout', HomeLayoutController::class);
Route::get('categories', [CatalogController::class, 'categories']);
Route::get('vendors', [CatalogController::class, 'vendors']);
Route::get('vendors/{vendor}', [CatalogController::class, 'vendor']);
Route::get('vendors/{vendor}/menu', [CatalogController::class, 'menu']);
Route::get('items/{item}', [CatalogController::class, 'item']);
Route::get('specials', [CatalogController::class, 'specials']);
Route::get('search', [CatalogController::class, 'search']);
Route::post('addresses/geocode', [AccountController::class, 'geocode'])->middleware('throttle:30,1');

Route::middleware('throttle:5,1')->group(function () {
    Route::post('auth/otp/request', [AuthController::class, 'requestOtp']);
    Route::post('auth/otp/verify', [AuthController::class, 'verifyOtp']);
});

Route::post('payments/webhook/{provider}', [PaymentController::class, 'webhook']);

// Authenticated customer
Route::middleware('auth:sanctum')->group(function () {
    // Pusher private-channel auth for the mobile app (Bearer token).
    Route::post('broadcasting/auth', fn (Request $request) => Broadcast::auth($request));

    Route::get('me', [AuthController::class, 'me']);
    Route::patch('me', [AuthController::class, 'update']);
    Route::post('auth/logout', [AuthController::class, 'logout']);

    Route::get('addresses', [AccountController::class, 'addresses']);
    Route::post('addresses', [AccountController::class, 'storeAddress']);
    Route::patch('addresses/{address}', [AccountController::class, 'updateAddress']);
    Route::delete('addresses/{address}', [AccountController::class, 'destroyAddress']);

    Route::get('cart', [CartController::class, 'show']);
    Route::post('cart/items', [CartController::class, 'add']);
    Route::patch('cart/items/{cartItem}', [CartController::class, 'update']);
    Route::delete('cart/items/{cartItem}', [CartController::class, 'remove']);
    Route::delete('cart', [CartController::class, 'clear']);
    Route::post('cart/voucher', [CartController::class, 'voucher']);
    Route::delete('cart/voucher', [CartController::class, 'removeVoucher']);

    Route::get('orders', [OrderController::class, 'index']);
    Route::post('orders', [OrderController::class, 'store']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::get('orders/{order}/track', [OrderController::class, 'track']);
    Route::post('orders/{order}/reorder', [OrderController::class, 'reorder']);

    Route::post('payments/initiate', [PaymentController::class, 'initiate']);
    Route::get('payments/{payment}', [PaymentController::class, 'status']);

    Route::get('loyalty/me', [AccountController::class, 'loyalty']);
    Route::get('loyalty/rewards', [AccountController::class, 'rewards']);
    Route::post('loyalty/redeem', [AccountController::class, 'redeem']);

    Route::get('notifications', [AccountController::class, 'notifications']);
    Route::post('notifications/read', [AccountController::class, 'markNotificationsRead']);
    Route::post('devices', [AccountController::class, 'registerDevice']);
    Route::post('support/tickets', [AccountController::class, 'createTicket']);

    // Checkout extras
    Route::post('checkout/quote', [OrderController::class, 'quote']);
    Route::post('orders/{order}/cancel', [EngagementController::class, 'cancel']);
    Route::post('orders/{order}/review', [EngagementController::class, 'review']);
    Route::post('orders/{order}/refund', [EngagementController::class, 'requestRefund']);
    Route::get('orders/{order}/messages', [EngagementController::class, 'messages']);
    Route::post('orders/{order}/messages', [EngagementController::class, 'sendMessage'])->middleware('throttle:30,1');

    Route::get('favorites', [EngagementController::class, 'favorites']);
    Route::post('vendors/{vendor}/favorite', [EngagementController::class, 'toggleFavorite']);

    // Wallet & growth
    Route::get('wallet', [GrowthController::class, 'wallet']);
    Route::post('wallet/topup', [GrowthController::class, 'topUp']);
    Route::get('gift-cards', [GrowthController::class, 'myGiftCards']);
    Route::post('gift-cards', [GrowthController::class, 'buyGiftCard']);
    Route::post('gift-cards/redeem', [GrowthController::class, 'redeemGiftCard'])->middleware('throttle:10,1');
    Route::get('zvino-plus', [GrowthController::class, 'plans']);
    Route::post('zvino-plus', [GrowthController::class, 'subscribe']);
    Route::delete('zvino-plus', [GrowthController::class, 'cancelSubscription']);
    Route::get('referral', [GrowthController::class, 'referral']);
    Route::post('referral/apply', [GrowthController::class, 'applyReferral']);

    // Group orders (host actions)
    Route::post('group-orders', [GroupOrderController::class, 'create']);
    Route::post('group-orders/{code}/checkout', [GroupOrderController::class, 'checkout']);

    // ── Zvino Driver app ─────────────────────────────────────────────
    Route::prefix('driver')->group(function () {
        Route::post('apply', [DriverController::class, 'apply']);
        Route::post('documents', [DriverController::class, 'uploadDocument']);
        Route::get('me', [DriverController::class, 'me']);
        Route::post('online', [DriverController::class, 'online']);
        Route::post('location', [DriverController::class, 'location'])->middleware('throttle:120,1');
        Route::get('offers', [DriverController::class, 'offers']);
        Route::post('offers/{offer}/accept', [DriverController::class, 'accept']);
        Route::post('offers/{offer}/decline', [DriverController::class, 'decline']);
        Route::get('jobs', [DriverController::class, 'jobs']);
        Route::post('jobs/{order}/pickup', [DriverController::class, 'pickup']);
        Route::post('jobs/{order}/deliver', [DriverController::class, 'deliver']);
        Route::get('earnings', [DriverController::class, 'earnings']);
        Route::post('cash/remit', [DriverController::class, 'remitCash']);
        Route::post('sos', [DriverController::class, 'sos'])->middleware('throttle:5,1');
    });

    // ── Zvino Merchant app (store manager / POS / kitchen) ───────────
    Route::prefix('merchant')->group(function () {
        Route::get('me', [MerchantController::class, 'me']);
        Route::patch('store', [MerchantController::class, 'updateStore']);
        Route::get('hours', [MerchantController::class, 'hours']);
        Route::put('hours', [MerchantController::class, 'saveHours']);
        Route::get('orders', [MerchantController::class, 'orders']);
        Route::post('orders/{order}/accept', [MerchantController::class, 'accept']);
        Route::post('orders/{order}/reject', [MerchantController::class, 'reject']);
        Route::post('orders/{order}/advance', [MerchantController::class, 'advance']);
        Route::post('orders/{order}/hand-over', [MerchantController::class, 'handOver']);
        Route::post('orders/{order}/delay', [MerchantController::class, 'delay']);
        Route::get('menu', [MerchantController::class, 'menu']);
        Route::patch('items/{item}/availability', [MerchantController::class, 'setAvailability']);
        Route::get('earnings', [MerchantController::class, 'earnings']);
        Route::get('reviews', [MerchantController::class, 'reviews']);
        Route::post('reviews/{review}/reply', [MerchantController::class, 'reply']);
        Route::get('insights', [MerchantController::class, 'insights']);
        Route::post('pos/sales', [MerchantController::class, 'posSale']);
    });
});

// Group orders: friends can join without an account (guest name).
Route::get('group-orders/{code}', [GroupOrderController::class, 'show']);
Route::post('group-orders/{code}/items', [GroupOrderController::class, 'addItem'])->middleware('throttle:30,1');
Route::delete('group-orders/{code}/items/{itemId}', [GroupOrderController::class, 'removeItem'])->middleware('auth:sanctum');
Route::get('vendors/{vendor}/reviews', [EngagementController::class, 'vendorReviews']);
Route::post('auth/staff/login', [AuthController::class, 'staffLogin'])->middleware('throttle:10,1');

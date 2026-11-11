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
Route::get('app-content', [\App\Http\Controllers\Admin\AppContentController::class, 'forApp']); // onboarding + launch screen (published from the admin)
Route::get('home-layout', HomeLayoutController::class);
Route::get('shops', [HomeLayoutController::class, 'shops']);
Route::post('location/resolve', [HomeLayoutController::class, 'resolveLocation'])->middleware('throttle:30,1');
Route::get('categories', [CatalogController::class, 'categories']);
Route::get('vendors', [CatalogController::class, 'vendors']);
Route::get('vendors/{vendor}', [CatalogController::class, 'vendor']);
Route::get('vendors/{vendor}/menu', [CatalogController::class, 'menu']);
Route::get('hampers', [\App\Http\Controllers\Api\HamperController::class, 'index']);
Route::get('items/{item}', [CatalogController::class, 'item']);
Route::get('specials', [CatalogController::class, 'specials']);
Route::get('search', [CatalogController::class, 'search']);
Route::post('addresses/geocode', [AccountController::class, 'geocode'])->middleware('throttle:30,1');

Route::middleware('throttle:5,1')->group(function () {
    Route::get('i18n/{locale}', fn (string $locale) => response()->json(['locale' => $locale, 'languages' => \App\Support\I18n::LOCALES, 'strings' => (object) \App\Support\I18n::dictionary($locale)])->header('Cache-Control', 'public, max-age=3600'));
    Route::post('auth/otp/request', [AuthController::class, 'requestOtp']);
    Route::post('auth/otp/verify', [AuthController::class, 'verifyOtp']);
    Route::post('auth/google', [AuthController::class, 'google'])->middleware('throttle:20,1');
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
    Route::post('addresses/{address}/media', [AccountController::class, 'addressMedia']);
    Route::post('prescriptions', fn (\Illuminate\Http\Request $r) => response()->json(['token' => \App\Support\PrescriptionStore::put($r)], 201))->middleware('throttle:10,1');
    Route::get('plans', [\App\Http\Controllers\Api\PlanController::class, 'index']);
    Route::post('plans', [\App\Http\Controllers\Api\PlanController::class, 'store']);
    Route::patch('plans/{plan}', [\App\Http\Controllers\Api\PlanController::class, 'update']);
    Route::delete('plans/{plan}', [\App\Http\Controllers\Api\PlanController::class, 'destroy']);
    Route::post('plans/{plan}/skip', [\App\Http\Controllers\Api\PlanController::class, 'skip']);
    Route::post('orders/{order}/split/{payment}/resend', [OrderController::class, 'resendShare']);
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
    Route::get('orders/active', [OrderController::class, 'active']);
    Route::get('items/{item}/substitutes', [\App\Http\Controllers\SubstituteController::class, 'index'])->middleware('throttle:60,1');
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::get('orders/{order}/track', [OrderController::class, 'track']);
    Route::post('orders/{order}/reorder', [OrderController::class, 'reorder']);
    Route::post('orders/{order}/receipt/email', [\App\Http\Controllers\Site\ReceiptController::class, 'email'])->middleware('throttle:6,1');

    Route::post('payments/initiate', [PaymentController::class, 'initiate']);
    Route::get('payments/{payment}', [PaymentController::class, 'status']);

    Route::get('loyalty/me', [AccountController::class, 'loyalty']);
    Route::get('loyalty/rewards', [AccountController::class, 'rewards']);
    Route::post('loyalty/redeem', [AccountController::class, 'redeem']);

    Route::get('notifications', [AccountController::class, 'notifications']);
    Route::get('notifications/unread', fn (\Illuminate\Http\Request $r) => response()->json(['count' => $r->user()->appNotifications()->whereNull('read_at')->count()]));
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
    Route::post('broadcasting/auth', fn (\Illuminate\Http\Request $r) => \Illuminate\Support\Facades\Broadcast::auth($r)); // apps: private Pusher channels
    Route::get('watches', [EngagementController::class, 'watches']);
    Route::get('catering', [\App\Http\Controllers\Api\CateringController::class, 'index']);
    Route::post('catering', [\App\Http\Controllers\Api\CateringController::class, 'store'])->middleware('throttle:10,1');
    Route::post('catering/{catering}/pay', [\App\Http\Controllers\Api\CateringController::class, 'pay']);
    Route::post('catering/{catering}/cancel', [\App\Http\Controllers\Api\CateringController::class, 'cancel']);
    Route::post('hampers/{hamper}/send', [\App\Http\Controllers\Api\HamperController::class, 'send']);
    Route::get('company', fn (\Illuminate\Http\Request $r) => response()->json(app(\App\Services\CompanyService::class)->summary($r->user())));
    Route::post('items/{item}/watch', [EngagementController::class, 'watch']);
    Route::delete('items/{item}/watch', [EngagementController::class, 'unwatch']);
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
        Route::get('route', [DriverController::class, 'route']);
        Route::post('location', [DriverController::class, 'location'])->middleware('throttle:120,1');
        Route::get('offers', [DriverController::class, 'offers']);
        Route::post('offers/{offer}/accept', [DriverController::class, 'accept']);
        Route::post('offers/{offer}/decline', [DriverController::class, 'decline']);
        Route::get('jobs', [DriverController::class, 'jobs']);
        // Shopping an order in a Zvino-run store (TM Pick n Pay branches).
        Route::get('jobs/{order}/shop', [\App\Http\Controllers\Api\Driver\ShopController::class, 'show']);
        Route::post('jobs/{order}/shop/start', [\App\Http\Controllers\Api\Driver\ShopController::class, 'start']);
        Route::get('jobs/{order}/shop/search', [\App\Http\Controllers\Api\Driver\ShopController::class, 'search'])->middleware('throttle:60,1');
        Route::post('jobs/{order}/shop/items/{line}', [\App\Http\Controllers\Api\Driver\ShopController::class, 'mark']);
        Route::post('jobs/{order}/shop/finish', [\App\Http\Controllers\Api\Driver\ShopController::class, 'finish'])->middleware('throttle:10,1');
        Route::post('jobs/{order}/pickup', [DriverController::class, 'pickup']);
        Route::post('jobs/{order}/deliver', [DriverController::class, 'deliver']);
        Route::get('earnings', [DriverController::class, 'earnings']);
        Route::post('cash/remit', [DriverController::class, 'remitCash']);
        Route::post('cashout', [DriverController::class, 'cashOut'])->middleware('throttle:5,1');
        Route::get('tier', [DriverController::class, 'tier']);
        Route::patch('preferences', [DriverController::class, 'preferences']);
        Route::get('heatmap', [DriverController::class, 'heatmap']);
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
        Route::get('promos', [MerchantController::class, 'promos']);
        Route::get('catering', [MerchantController::class, 'catering']);
        Route::post('catering/{catering}', [MerchantController::class, 'cateringAction']);
        Route::post('payout-now', [MerchantController::class, 'payoutNow'])->middleware('throttle:5,1');
        Route::get('orders/{order}/prescription', [MerchantController::class, 'prescription']);
        Route::get('payments/{payment}', [MerchantController::class, 'paymentStatus']);
        Route::post('promos', [MerchantController::class, 'savePromo']);
        Route::patch('promos/{promo}', [MerchantController::class, 'savePromo']);
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

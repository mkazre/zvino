<?php

use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CartController;
use App\Http\Controllers\Api\CatalogController;
use App\Http\Controllers\Api\HomeLayoutController;
use App\Http\Controllers\Api\OrderController;
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
});

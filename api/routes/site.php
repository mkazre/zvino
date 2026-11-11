<?php

use App\Http\Controllers\Site\AccountController;
use App\Http\Controllers\Site\CheckoutController;
use App\Http\Controllers\Site\SignInController;
use App\Http\Controllers\Site\SiteController;
use App\Http\Middleware\EnsureSiteOpen;
use Illuminate\Support\Facades\Route;

/*
 * Public customer website (zvino.online). Admin lives under /dashboard and /admin.
 */
// Currency switcher (website header and admin top bar): remembers ZiG / USD for this browser.
Route::post('currency', [SiteController::class, 'setCurrency'])->name('site.currency');

Route::middleware(EnsureSiteOpen::class)->name('site.')->group(function () {
    Route::get('/', [SiteController::class, 'home'])->name('home');
    Route::get('stores', [SiteController::class, 'stores'])->name('stores');
    Route::get('store/{slug}', [SiteController::class, 'store'])->name('store');
    Route::get('p/{slug}', [SiteController::class, 'page'])->name('page');
    Route::get('plus', [SiteController::class, 'plus'])->name('plus');
    Route::get('gift-cards', [SiteController::class, 'giftCards'])->name('gift-cards');
    Route::get('hampers', [SiteController::class, 'hampers'])->name('hampers');
    Route::get('catering', [SiteController::class, 'catering'])->name('catering');
    Route::middleware(['auth', 'throttle:20,1'])->group(function () {
        Route::post('hampers/{hamper}/send', [\App\Http\Controllers\Api\HamperController::class, 'send'])->name('hampers.send');
        Route::post('wallet/topup', [\App\Http\Controllers\Api\GrowthController::class, 'topUp'])->name('wallet.topup');
        Route::post('catering', [\App\Http\Controllers\Api\CateringController::class, 'store'])->name('catering.store');
        Route::post('catering/{catering}/pay', [\App\Http\Controllers\Api\CateringController::class, 'pay'])->name('catering.pay');
        Route::post('catering/{catering}/cancel', [\App\Http\Controllers\Api\CateringController::class, 'cancel'])->name('catering.cancel');
    });
    Route::get('partners', [SiteController::class, 'partners'])->name('partners');
    // Sign-up forms: restaurants & shops, drivers, corporate accounts → Admin → Applications.
    Route::get('partners/apply', [\App\Http\Controllers\Site\ApplyController::class, 'show'])->defaults('type', 'restaurant')->name('apply.restaurant');
    Route::get('drive/apply', [\App\Http\Controllers\Site\ApplyController::class, 'show'])->defaults('type', 'driver')->name('apply.driver');
    Route::get('business', [\App\Http\Controllers\Site\ApplyController::class, 'business'])->name('business');
    Route::get('business/apply', [\App\Http\Controllers\Site\ApplyController::class, 'show'])->defaults('type', 'corporate')->name('apply.corporate');
    Route::post('apply/upload', [\App\Http\Controllers\Site\ApplyController::class, 'upload'])->middleware('throttle:apply-upload')->name('apply.upload');
    Route::post('apply/{type}', [\App\Http\Controllers\Site\ApplyController::class, 'submit'])->whereIn('type', ['restaurant', 'driver', 'corporate'])->middleware('throttle:apply-submit')->name('apply.submit');
    Route::get('apply/done/{reference}', [\App\Http\Controllers\Site\ApplyController::class, 'done'])->name('apply.done');
    Route::get('drive', [SiteController::class, 'drivers'])->name('drivers');
    Route::get('group/{code}', [SiteController::class, 'group'])->name('group');
    Route::post('city', [SiteController::class, 'setCity'])->name('city');
    // Active delivery location (address picker in the header; GPS on first visit).
    Route::post('location/detect', [SiteController::class, 'detectLocation'])->middleware('throttle:30,1')->name('location.detect');
    Route::post('location/address', [SiteController::class, 'useAddress'])->middleware('auth')->name('location.address');
    Route::post('location/clear', [SiteController::class, 'clearLocation'])->name('location.clear');
    Route::get('items/{item}/substitutes', [\App\Http\Controllers\SubstituteController::class, 'index'])->middleware('throttle:60,1')->name('item.substitutes');
    Route::get('shops', fn () => redirect('/stores?segment=shops'))->name('shops');
    Route::post('locale', [SiteController::class, 'setLocale'])->name('locale');
    Route::post('checkout/prescription', fn (\Illuminate\Http\Request $r) => response()->json(['token' => \App\Support\PrescriptionStore::put($r)]))->middleware(['auth', 'throttle:10,1'])->name('checkout.prescription');

    // Group orders from the browser (session-authenticated twins of the API routes; guests allowed to add items).
    Route::get('group/{code}/data', [\App\Http\Controllers\Api\GroupOrderController::class, 'show'])->name('group.data');
    Route::post('group/{code}/items', [\App\Http\Controllers\Api\GroupOrderController::class, 'addItem'])->middleware('throttle:30,1')->name('group.items');
    Route::post('group/{code}/checkout', [\App\Http\Controllers\Api\GroupOrderController::class, 'checkout'])->middleware('auth')->name('group.checkout');

    // PDF receipt: signed link (works from the app and in any browser without signing in).
    Route::get('orders/{order}/receipt.pdf', [\App\Http\Controllers\Site\ReceiptController::class, 'pdf'])->middleware('signed')->name('order.receipt');

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
        // Browser alerts: order updates since the last one this browser saw (polled every ~15 s).
        Route::get('account/alerts', function (\Illuminate\Http\Request $request) {
            $after = $request->integer('after');
            $q = $request->user()->appNotifications()->whereIn('type', ['order_status', 'late_credit', 'split_declined']);
            if (! $request->has('after')) {
                return response()->json(['latest_id' => (int) $q->max('id'), 'items' => []]);
            }
            $items = $q->where('id', '>', $after)->orderBy('id')->limit(10)->get(['id', 'type', 'title', 'body', 'data', 'created_at']);

            return response()->json(['latest_id' => (int) ($items->max('id') ?? $after), 'items' => $items]);
        })->middleware('throttle:120,1')->name('account.alerts');
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
        Route::post('orders/{order}/receipt/email', [\App\Http\Controllers\Site\ReceiptController::class, 'email'])->middleware('throttle:6,1')->name('order.receipt.email');
        Route::post('orders/{order}/review', [AccountController::class, 'review'])->name('order.review');
        Route::post('orders/{order}/reorder', [AccountController::class, 'reorder'])->name('order.reorder');
    });
});

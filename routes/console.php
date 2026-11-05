<?php

use App\Models\DriverLocation;
use App\Models\OtpCode;
use App\Services\CampaignService;
use App\Services\DispatchService;
use App\Services\PayoutService;
use App\Services\OrderService;
use Illuminate\Support\Facades\Schedule;

// Shared hosting has no long-running workers: one cPanel cron entry runs the
// scheduler every minute, which drains the queue and runs the order engine.
//   * * * * * cd /home/USER/zvino && php artisan schedule:run >> /dev/null 2>&1
Schedule::command('queue:work --stop-when-empty --max-time=50')->everyMinute()->withoutOverlapping();

Schedule::call(function () {
    $orders = app(OrderService::class);
    $orders->releaseScheduled();
    $orders->cancelUnaccepted();
    $orders->expireUnpaid();
    app(DispatchService::class)->sweep();
    app(\App\Services\RecurringOrderService::class)->run();
    \Illuminate\Support\Facades\Cache::put('zvino.scheduler_heartbeat', now(), now()->addHour()); // zvino:doctor checks this
})->everyMinute()->name('order-engine')->withoutOverlapping();

Schedule::command('zvino:backup')->dailyAt('02:30')->name('backup');
Schedule::call(fn () => app(\App\Services\CompanyService::class)->invoiceAll())->monthlyOn(1, '07:00')->name('company-invoices');

Schedule::call(fn () => app(CampaignService::class)->sendDue())->everyFiveMinutes()->name('campaigns')->withoutOverlapping();

Schedule::call(function () {
    $payouts = app(PayoutService::class);
    if ($payouts->isDue()) {
        $payouts->generate(now()->startOfDay());
    }
})->dailyAt('06:00')->name('payouts');

Schedule::call(fn () => OtpCode::where('expires_at', '<', now()->subDay())->delete())->daily();
Schedule::call(fn () => DriverLocation::where('recorded_at', '<', now()->subDays(30))->delete())->daily();

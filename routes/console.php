<?php

use App\Models\OtpCode;
use Illuminate\Support\Facades\Schedule;

// Shared hosting has no long-running workers: one cPanel cron entry runs the
// scheduler every minute, which drains the queue and exits.
//   * * * * * cd /home/USER/zvino && php artisan schedule:run >> /dev/null 2>&1
Schedule::command('queue:work --stop-when-empty --max-time=50')->everyMinute()->withoutOverlapping();

Schedule::call(fn () => OtpCode::where('expires_at', '<', now()->subDay())->delete())->daily();

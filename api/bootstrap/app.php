<?php

use App\Http\Middleware\EnsureStaffRole;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->web(append: [
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);
        $middleware->alias(['staff' => EnsureStaffRole::class, 'throttle' => \App\Http\Middleware\ThrottlePerRoute::class]); // each route counts separately

        // Customers go to phone sign-in; staff screens go to the email login.
        $middleware->redirectGuestsTo(fn ($request) => $request->is('dashboard', 'admin', 'admin/*', 'settings/*') ? route('login') : route('site.signin'));
        $middleware->redirectUsersTo(fn ($request) => $request->user()?->isStaff() ? '/dashboard' : '/');
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Error monitoring: reports to Sentry only when SENTRY_LARAVEL_DSN is set.
        \Sentry\Laravel\Integration::handles($exceptions);
    })->create();

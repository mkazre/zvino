<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Symfony\Component\HttpFoundation\Response;

/** Maintenance mode (Settings → Apps & website) shows a friendly page; staff can still browse. */
class EnsureSiteOpen
{
    public function handle(Request $request, Closure $next): Response
    {
        if (Setting::get('apps.maintenance_mode') && ! $request->user()?->isStaff()) {
            return Inertia::render('site/maintenance', ['message' => Setting::get('apps.maintenance_message'), 'seo' => ['title' => 'Back soon | Zvino']])->toResponse($request)->setStatusCode(503);
        }

        return $next($request);
    }
}

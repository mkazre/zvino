<?php

namespace App\Http\Middleware;

use Illuminate\Routing\Middleware\ThrottleRequests;

/**
 * Laravel's plain `throttle:N,M` counts every throttled route for a signed-in user together,
 * so a page that polls in the background (bell alerts, sync progress) could use up the limit
 * of an unrelated button and show "429 Too Many Requests". Here each route has its own count.
 * Named limiters (RateLimiter::for) are unaffected.
 */
class ThrottlePerRoute extends ThrottleRequests
{
    protected function resolveRequestSignature($request)
    {
        $route = $request->route();
        $where = $route ? implode('|', $route->methods()).' '.$route->uri() : $request->method().' '.$request->path();

        return sha1(parent::resolveRequestSignature($request).'|'.$where);
    }
}

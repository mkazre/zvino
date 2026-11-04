<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Vendor management only exists in marketplace mode. */
class EnsureMarketplaceMode
{
    public function handle(Request $request, Closure $next): Response
    {
        if (Setting::platformMode() !== 'marketplace') {
            return redirect()->route('dashboard')->with('error', 'Vendors are hidden in single-restaurant mode.');
        }

        return $next($request);
    }
}

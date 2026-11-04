<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Usage: ->middleware('staff') for any staff, or 'staff:super_admin,vendor_manager'. */
class EnsureStaffRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_unless($user && $user->isStaff(), 403, 'Staff access only.');
        abort_if($roles && ! in_array($user->role, $roles, true), 403, 'Your role cannot access this page.');

        return $next($request);
    }
}

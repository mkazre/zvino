<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

/** Customers sign in on the website with their phone number and an SMS code (same as the app). */
class SignInController extends Controller
{
    public function __construct(private OtpService $otp) {}

    public function show(Request $request)
    {
        if ($request->user()?->role === 'customer') {
            return redirect()->intended('/account');
        }

        return Inertia::render('site/signin', ['seo' => ['title' => 'Sign in | Zvino'], 'phone' => session('signin_phone')]);
    }

    public function sendCode(Request $request)
    {
        $phone = self::normalise($request->validate(['phone' => ['required', 'regex:/^\+?[0-9 ]{9,16}$/']])['phone']);
        $key = 'signin:'.$phone.'|'.$request->ip();
        abort_if(RateLimiter::tooManyAttempts($key, 4), 429, 'Too many codes requested. Try again in a few minutes.');
        RateLimiter::hit($key, 300);

        $this->otp->send($phone);
        session(['signin_phone' => $phone]);

        return back()->with('success', 'We sent a 6-digit code to '.$phone);
    }

    public function verify(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'digits:'.config('zvino.otp.length')], 'name' => ['nullable', 'string', 'max:120']]);
        $phone = session('signin_phone');
        if (! $phone || ! $this->otp->verify($phone, $data['code'])) {
            throw ValidationException::withMessages(['code' => 'That code is incorrect or has expired.']);
        }

        $user = User::firstOrCreate(['phone' => $phone], ['name' => $data['name'] ?? '', 'role' => 'customer']);
        abort_if($user->banned_at, 403, 'This account has been disabled. Contact support.');
        if (! $user->name && ! empty($data['name'])) {
            $user->update(['name' => $data['name']]);
        }
        abort_unless(in_array($user->role, ['customer', 'driver'], true), 403, 'Staff accounts sign in at /login.');

        Auth::login($user, remember: true);
        $request->session()->regenerate();
        session()->forget('signin_phone');
        $user->update(['last_seen_at' => now()]);

        return redirect()->intended($user->name ? '/' : '/account?welcome=1');
    }

    public function logout(Request $request)
    {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }

    public static function normalise(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '0')) {
            $digits = '263'.substr($digits, 1);
        } elseif (strlen($digits) === 9) {
            $digits = '263'.$digits;
        }

        return '+'.$digits;
    }
}

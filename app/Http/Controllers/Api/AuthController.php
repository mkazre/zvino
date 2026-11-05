<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private OtpService $otp) {}

    public function requestOtp(Request $request)
    {
        $data = $request->validate(['phone' => ['required', 'regex:/^\+?[0-9]{9,15}$/']]);
        $this->otp->send($this->normalise($data['phone']));

        return response()->json(['message' => 'Code sent', 'expires_in' => config('zvino.otp.ttl_minutes') * 60]);
    }

    public function verifyOtp(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'regex:/^\+?[0-9]{9,15}$/'],
            'code' => ['required', 'digits:'.config('zvino.otp.length')],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);
        $phone = $this->normalise($data['phone']);

        if (! $this->otp->verify($phone, $data['code'])) {
            throw ValidationException::withMessages(['code' => 'Invalid or expired code.']);
        }

        $user = User::firstOrCreate(['phone' => $phone], ['name' => '', 'role' => 'customer']);
        abort_if($user->banned_at, 403, 'This account has been disabled. Contact support.');
        $user->update(['last_seen_at' => now()]);
        $token = $user->createToken($data['device_name'] ?? 'mobile')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->present($user),
            'is_new' => $user->wasRecentlyCreated || $user->name === '',
        ]);
    }

    public function me(Request $request)
    {
        return response()->json($this->present($request->user()));
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'nullable', 'email', 'unique:users,email,'.$request->user()->id],
            'preferred_currency' => ['sometimes', 'in:ZIG,USD'],
            'locale' => ['sometimes', 'in:en,sn,nd'],
            'marketing_opt_in' => ['sometimes', 'boolean'],
        ]);
        $request->user()->update($data);

        return response()->json($this->present($request->user()->fresh()));
    }

    /** Merchant app (store manager / cashier / kitchen) signs in with email + password. */
    public function staffLogin(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string'], 'device_name' => ['nullable', 'string', 'max:100']]);
        $user = User::where('email', $data['email'])->first();

        if (! $user || ! $user->password || ! \Illuminate\Support\Facades\Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Incorrect email or password.']);
        }
        abort_unless(in_array($user->role, User::STORE_ROLES, true), 403, 'This app is for store staff.');
        abort_if($user->banned_at, 403, 'This account is disabled.');

        return response()->json([
            'token' => $user->createToken($data['device_name'] ?? 'merchant')->plainTextToken,
            'user' => $user->only('id', 'name', 'email', 'role', 'vendor_id'),
            'mode' => ['vendor_manager' => 'manager', 'cashier' => 'pos', 'kitchen' => 'kitchen'][$user->role],
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    private function present(User $user): array
    {
        $loyalty = $user->loyalty;

        return $user->only('id', 'name', 'email', 'phone', 'preferred_currency', 'locale', 'marketing_opt_in', 'role') + [
            'avatar' => $user->avatar_path,
            'wallet_balance_zig' => $user->walletBalance(),
            'points' => $loyalty?->points ?? 0,
            'tier' => $loyalty?->tier ?? 'Bronze',
            'zvino_plus' => $user->activeSubscription()?->only('status', 'current_period_end'),
            'is_driver' => (bool) $user->driver,
        ];
    }

    /** Zimbabwe numbers: 0771234567 / 771234567 → +263771234567. */
    private function normalise(string $phone): string
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

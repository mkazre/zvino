<?php

namespace App\Support;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

/**
 * "Continue with Google" without extra packages: the standard OAuth code flow for the website and
 * ID-token sign-in for the apps, both checked with Google. Keys: Settings → Integrations.
 */
class GoogleAuth
{
    public static function webClientId(): ?string
    {
        return Setting::get('integrations.google_client_id') ?: null;
    }

    public static function enabled(): bool
    {
        return (bool) (self::webClientId() && Setting::get('integrations.google_client_secret'));
    }

    /** Every client id we accept tokens for (web + Android + iOS apps). */
    public static function audiences(): array
    {
        return array_values(array_filter([
            self::webClientId(),
            ...array_map('trim', explode(',', (string) Setting::get('integrations.google_android_client_id'))),
            ...array_map('trim', explode(',', (string) Setting::get('integrations.google_ios_client_id'))),
        ]));
    }

    public static function authUrl(string $redirect, string $state): string
    {
        return 'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id' => self::webClientId(), 'redirect_uri' => $redirect, 'response_type' => 'code',
            'scope' => 'openid email profile', 'state' => $state, 'prompt' => 'select_account',
        ]);
    }

    /** Website callback: swap the one-time code for a verified ID token. */
    public static function profileFromCode(string $code, string $redirect): array
    {
        $res = Http::asForm()->timeout(15)->post('https://oauth2.googleapis.com/token', [
            'code' => $code, 'client_id' => self::webClientId(), 'client_secret' => Setting::get('integrations.google_client_secret'),
            'redirect_uri' => $redirect, 'grant_type' => 'authorization_code',
        ]);
        if (! $res->successful() || ! $res->json('id_token')) {
            throw ValidationException::withMessages(['google' => 'Google sign-in didn’t complete. Please try again.']);
        }

        return self::profileFromIdToken($res->json('id_token'));
    }

    /** Check an ID token with Google: it must be for one of our apps, and the email verified. */
    public static function profileFromIdToken(string $idToken): array
    {
        $res = Http::timeout(15)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $idToken]);
        $p = $res->json() ?? [];
        if (! $res->successful() || ! in_array($p['aud'] ?? null, self::audiences(), true)
            || ! in_array($p['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            || (int) ($p['exp'] ?? 0) < time() || empty($p['sub'])) {
            throw ValidationException::withMessages(['google' => 'We couldn’t verify your Google account. Please try again.']);
        }
        if (empty($p['email']) || ! filter_var($p['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            throw ValidationException::withMessages(['google' => 'Your Google account’s email isn’t verified.']);
        }

        return ['google_id' => (string) $p['sub'], 'email' => strtolower($p['email']), 'name' => trim((string) ($p['name'] ?? '')), 'avatar' => $p['picture'] ?? null];
    }

    /**
     * The customer for this Google profile. Signed in already (e.g. adding an email): link it.
     * Otherwise find by Google id, then by email, else create a new customer.
     */
    public static function resolveUser(array $g, ?User $current = null): User
    {
        $byGoogle = User::where('google_id', $g['google_id'])->first();
        if ($current) {
            if ($byGoogle && $byGoogle->id !== $current->id) {
                throw ValidationException::withMessages(['google' => 'That Google account is already linked to another Zvino account.']);
            }
            $emailTaken = User::where('email', $g['email'])->where('id', '!=', $current->id)->exists();
            $current->update(array_filter(['google_id' => $g['google_id'], 'email' => $current->email ?: ($emailTaken ? null : $g['email']), 'name' => $current->name ?: $g['name'], 'avatar_url' => $current->avatar_url ?: $g['avatar']]));

            return $current->fresh();
        }
        $user = $byGoogle ?? User::where('email', $g['email'])->first();
        if ($user) {
            abort_if($user->isStaff(), 403, 'Staff accounts sign in at /login.');
            $user->update(array_filter(['google_id' => $g['google_id'], 'name' => $user->name ?: $g['name'], 'avatar_url' => $user->avatar_url ?: $g['avatar']]));

            return $user->fresh();
        }

        return User::create(['name' => $g['name'], 'email' => $g['email'], 'google_id' => $g['google_id'], 'avatar_url' => $g['avatar'], 'role' => 'customer', 'email_verified_at' => now()]);
    }
}

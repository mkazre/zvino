<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

/**
 * Prescription photos are medical records: kept on the private disk, never public URLs.
 * Upload returns an encrypted token the checkout sends back; only that customer can use it.
 */
class PrescriptionStore
{
    public static function put(Request $request): string
    {
        $request->validate(['photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192']], ['photo.max' => 'Photo must be 8 MB or smaller.']);
        $path = $request->file('photo')->storeAs('prescriptions/'.$request->user()->id, Str::uuid().'.'.$request->file('photo')->extension(), 'local');

        return Crypt::encryptString(json_encode(['u' => $request->user()->id, 'p' => $path]));
    }

    public static function resolve(?string $token, User $user): ?string
    {
        if (! $token) {
            return null;
        }
        try {
            $d = json_decode(Crypt::decryptString($token), true);
        } catch (\Throwable) {
            return null;
        }

        return ($d['u'] ?? null) === $user->id && \Illuminate\Support\Facades\Storage::disk('local')->exists($d['p'] ?? '') ? $d['p'] : null;
    }
}

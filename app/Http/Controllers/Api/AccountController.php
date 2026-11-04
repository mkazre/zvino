<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\Reward;
use App\Services\LoyaltyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/** Addresses, loyalty, notifications, devices, support. */
class AccountController extends Controller
{
    public function addresses(Request $request)
    {
        return response()->json($request->user()->addresses()->orderByDesc('is_default')->get());
    }

    public function storeAddress(Request $request)
    {
        $data = $this->validateAddress($request);
        $user = $request->user();

        if (($data['is_default'] ?? false) || ! $user->addresses()->exists()) {
            $user->addresses()->update(['is_default' => false]);
            $data['is_default'] = true;
        }

        return response()->json($user->addresses()->create($data), 201);
    }

    public function updateAddress(Request $request, Address $address)
    {
        abort_unless($address->user_id === $request->user()->id, 404);
        $data = $this->validateAddress($request, partial: true);

        if ($data['is_default'] ?? false) {
            $request->user()->addresses()->update(['is_default' => false]);
        }
        $address->update($data);

        return response()->json($address);
    }

    /** Gate photo and voice-note directions (#5) for the driver, in any language. */
    public function addressMedia(Request $request, Address $address)
    {
        abort_unless($address->user_id === $request->user()->id, 404);
        $request->validate([
            'gate_photo' => ['nullable', 'image', 'max:8192'],
            'voice_note' => ['nullable', 'file', 'mimetypes:audio/mp4,audio/x-m4a,audio/m4a,audio/aac,audio/mpeg,audio/ogg,audio/webm,audio/wav,audio/3gpp,video/mp4', 'max:3072'],
            'remove' => ['nullable', 'in:gate_photo,voice_note'],
        ], ['voice_note.max' => 'Keep the voice note under a minute (3 MB).']);

        if ($request->input('remove')) {
            $address->update([$request->input('remove').'_path' => null]);
        }
        foreach (['gate_photo' => 'gates', 'voice_note' => 'voice-notes'] as $field => $dir) {
            if ($request->hasFile($field)) {
                $address->update([$field.'_path' => '/storage/'.$request->file($field)->store("$dir/{$address->user_id}", 'public')]);
            }
        }

        return response()->json($address->fresh());
    }

    public function destroyAddress(Request $request, Address $address)
    {
        abort_unless($address->user_id === $request->user()->id, 404);
        $address->delete();

        return response()->noContent();
    }

    /** Reverse-geocodes a pin (lat/lng) or forward-geocodes typed text via OpenStreetMap Nominatim. */
    public function geocode(Request $request)
    {
        $data = $request->validate([
            'lat' => ['required_without:query', 'numeric'],
            'lng' => ['required_without:query', 'numeric'],
            'query' => ['required_without:lat', 'string'],
        ]);

        $http = Http::withHeaders(['User-Agent' => 'Zvino/1.0'])->timeout(8);
        $res = isset($data['query'])
            ? $http->get('https://nominatim.openstreetmap.org/search', ['q' => $data['query'].', Zimbabwe', 'format' => 'json', 'limit' => 5, 'addressdetails' => 1])->json()
            : [$http->get('https://nominatim.openstreetmap.org/reverse', ['lat' => $data['lat'], 'lon' => $data['lng'], 'format' => 'json', 'addressdetails' => 1])->json()];

        return response()->json(collect($res)->filter()->map(fn ($r) => [
            'line1' => trim(($r['address']['house_number'] ?? '').' '.($r['address']['road'] ?? $r['display_name'] ?? '')),
            'suburb' => $r['address']['suburb'] ?? $r['address']['neighbourhood'] ?? null,
            'city' => $r['address']['city'] ?? $r['address']['town'] ?? null,
            'lat' => (float) ($r['lat'] ?? 0),
            'lng' => (float) ($r['lon'] ?? 0),
        ])->values());
    }

    public function loyalty(Request $request, LoyaltyService $loyalty)
    {
        $account = $loyalty->account($request->user());

        return response()->json([
            'points' => $account->points,
            'lifetime_points' => $account->lifetime_points,
            'wallet_balance_zig' => $request->user()->walletBalance(),
        ] + $loyalty->tierFor($account->lifetime_points));
    }

    public function rewards()
    {
        return response()->json(Reward::where('is_active', true)->orderBy('points_cost')->get());
    }

    public function redeem(Request $request, LoyaltyService $loyalty)
    {
        $data = $request->validate(['reward_id' => ['required', 'exists:rewards,id']]);
        $account = $loyalty->redeem($request->user(), Reward::findOrFail($data['reward_id']));

        return response()->json(['points' => $account->points, 'wallet_balance_zig' => $request->user()->walletBalance()]);
    }

    public function notifications(Request $request)
    {
        return response()->json($request->user()->appNotifications()->latest()->paginate(30));
    }

    public function markNotificationsRead(Request $request)
    {
        $ids = $request->validate(['ids' => ['array'], 'ids.*' => ['integer']])['ids'] ?? null;
        $request->user()->appNotifications()->whereNull('read_at')
            ->when($ids, fn ($q) => $q->whereIn('id', $ids))
            ->update(['read_at' => now()]);

        return response()->noContent();
    }

    public function registerDevice(Request $request)
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:255'], 'platform' => ['nullable', 'in:ios,android']]);
        $request->user()->deviceTokens()->updateOrCreate(['token' => $data['token']], $data);

        return response()->noContent();
    }

    public function createTicket(Request $request)
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:150'],
            'message' => ['required', 'string', 'max:5000'],
            'order_id' => ['nullable', 'exists:orders,id'],
        ]);

        return response()->json($request->user()->hasMany(\App\Models\SupportTicket::class)->create($data), 201);
    }

    private function validateAddress(Request $request, bool $partial = false): array
    {
        $req = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'label' => ['sometimes', 'string', 'max:40'],
            'line1' => [$req, 'string', 'max:200'],
            'suburb' => ['nullable', 'string', 'max:100'],
            'city' => [$req, 'string', 'max:100'],
            'lat' => ['nullable', 'numeric'],
            'lng' => ['nullable', 'numeric'],
            'instructions' => ['nullable', 'string', 'max:300'],
            'is_default' => ['boolean'],
        ]);
    }
}

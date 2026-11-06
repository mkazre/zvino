<?php

namespace App\Support;

use App\Models\Address;
use Illuminate\Http\Request;

/**
 * The customer's active delivery location: a saved address or "current location".
 * Website: kept in the session (set by the address picker / on first visit from the browser's GPS).
 * Apps: sent with each request as lat, lng (+ address_id).
 */
class CustomerLocation
{
    public const SESSION = 'zvino_location';

    public static function fromRequest(Request $request): ?array
    {
        if (is_numeric($request->query('lat')) && is_numeric($request->query('lng'))) {
            return ['lat' => (float) $request->query('lat'), 'lng' => (float) $request->query('lng'), 'address_id' => $request->integer('address_id') ?: null, 'label' => null, 'line' => null, 'city' => null];
        }

        return $request->hasSession() ? $request->session()->get(self::SESSION) : null;
    }

    public static function fromAddress(Address $a): array
    {
        return [
            'lat' => $a->lat !== null ? (float) $a->lat : null,
            'lng' => $a->lng !== null ? (float) $a->lng : null,
            'address_id' => $a->id,
            'label' => $a->label ?: 'Home',
            'line' => implode(', ', array_filter([$a->line1, $a->suburb])),
            'city' => $a->city,
        ];
    }

    public static function remember(Request $request, ?array $loc): void
    {
        if ($loc === null) {
            $request->session()->forget(self::SESSION);

            return;
        }
        $request->session()->put(self::SESSION, $loc);
        if (! empty($loc['city'])) {
            $request->session()->put('city', $loc['city']);
        }
    }
}

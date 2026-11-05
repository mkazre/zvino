<?php

namespace App\Support;

class Geo
{
    /** Great-circle distance in km. */
    public static function km(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return round($r * 2 * atan2(sqrt($a), sqrt(1 - $a)), 2);
    }

    /** Road distance is typically ~1.3× straight-line in Harare/Bulawayo grids. */
    public static function roadKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        return round(self::km($lat1, $lng1, $lat2, $lng2) * 1.3, 2);
    }

    /** Ray-casting point-in-polygon; polygon is [[lat,lng], ...]. */
    public static function inPolygon(float $lat, float $lng, array $polygon): bool
    {
        $inside = false;
        $n = count($polygon);
        for ($i = 0, $j = $n - 1; $i < $n; $j = $i++) {
            [$yi, $xi] = $polygon[$i];
            [$yj, $xj] = $polygon[$j];
            if ((($yi > $lat) !== ($yj > $lat)) && ($lng < ($xj - $xi) * ($lat - $yi) / (($yj - $yi) ?: 1e-12) + $xi)) {
                $inside = ! $inside;
            }
        }

        return $inside;
    }

    /** Minutes for a motorbike at ~25 km/h average city speed. */
    public static function rideMinutes(float $km): int
    {
        return (int) ceil($km / 25 * 60);
    }
}

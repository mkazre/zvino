<?php

namespace Database\Seeders;

use App\Models\Address;
use App\Models\Driver;
use App\Models\ExchangeRate;
use App\Models\Item;
use App\Models\Order;
use App\Models\Refund;
use App\Models\Review;
use App\Models\SupportTicket;
use App\Models\User;
use App\Models\Vendor;
use App\Services\LedgerService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * 30 days of believable activity so dashboards, reports and lists have data.
 * Demo only:  php artisan db:seed --class=DemoActivitySeeder
 */
class DemoActivitySeeder extends Seeder
{
    private const FIRST = ['Tendai', 'Chipo', 'Farai', 'Rumbi', 'Tatenda', 'Nyasha', 'Kuda', 'Tafadzwa', 'Rutendo', 'Simba', 'Thandiwe', 'Sipho', 'Nomsa', 'Blessing', 'Precious', 'Takudzwa', 'Ruvimbo', 'Munashe', 'Anesu', 'Vimbai'];
    private const LAST = ['Moyo', 'Ncube', 'Dube', 'Sibanda', 'Chikore', 'Mutasa', 'Nyathi', 'Mhlanga', 'Chirwa', 'Marufu', 'Gumbo', 'Mapfumo'];
    private const SUBURBS = ['Avondale', 'Belgravia', 'Borrowdale', 'Mt Pleasant', 'Greendale', 'Milton Park', 'Eastlea', 'Hatfield', 'Highlands', 'Marlborough'];
    private const COMMENTS = ['Hot and fast, as always!', 'Sadza was perfect.', 'Driver was very polite.', 'Bit late but food was great.', 'Best braai in Harare.', 'Portion could be bigger.', 'Will order again!', 'Cold chips, disappointed.', 'Excellent service 👌'];

    public function run(): void
    {
        mt_srand(42);
        $rate = ExchangeRate::current();
        $ledger = app(LedgerService::class);
        $vendors = Vendor::with('items')->where('status', 'active')->get();

        // Customers + addresses
        $customers = collect(range(1, 60))->map(function ($i) {
            $u = User::create([
                'name' => self::FIRST[$i % 20].' '.self::LAST[$i % 12], 'phone' => '+2637'.(71 + $i % 7).sprintf('%07d', 1000 + $i * 37),
                'role' => 'customer', 'created_at' => now()->subDays(mt_rand(1, 90)),
            ]);
            $u->addresses()->create(['label' => 'Home', 'line1' => mt_rand(1, 90).' '.self::SUBURBS[$i % 10].' Rd', 'suburb' => self::SUBURBS[$i % 10], 'city' => 'Harare',
                'lat' => -17.83 + mt_rand(-250, 250) / 10000, 'lng' => 31.05 + mt_rand(-300, 300) / 10000, 'is_default' => true]);

            return $u;
        });

        // Extra drivers
        $drivers = collect([Driver::first()]);
        foreach (['Tino Mutasa', 'Blessing Nyathi', 'Simba Gumbo', 'Rufaro Chikore'] as $k => $name) {
            $u = User::create(['name' => $name, 'phone' => '+26377300'.sprintf('%04d', $k + 10), 'role' => 'driver']);
            $drivers->push(Driver::create(['user_id' => $u->id, 'status' => $k === 3 ? 'applied' : 'approved', 'approved_at' => now()->subDays(20), 'vehicle_type' => $k === 2 ? 'bicycle' : 'motorbike', 'vehicle_plate' => 'AE'.chr(65 + $k).' '.(2000 + $k * 111), 'national_id' => '63-'.(100000 + $k).'-B-'.(10 + $k),
                'is_online' => $k < 2, 'lat' => -17.83 + $k * 0.004, 'lng' => 31.05 - $k * 0.003, 'location_updated_at' => now(), 'rating' => 4.6 + $k * 0.1, 'rating_count' => 10 + $k * 7]));
        }
        Driver::first()->update(['is_online' => true, 'lat' => -17.828, 'lng' => 31.049, 'location_updated_at' => now()]);
        $active = $drivers->where('status', 'approved')->values();

        $methods = ['ecocash', 'ecocash', 'ecocash', 'innbucks', 'onemoney', 'card', 'cash', 'cash', 'wallet'];

        // 30 days of delivered history (more on weekends and at lunch/dinner)
        for ($d = 29; $d >= 0; $d--) {
            $day = now()->subDays($d)->startOfDay();
            $n = ($day->isWeekend() ? 18 : 11) + mt_rand(-3, 5) + (29 - $d) / 4;
            for ($k = 0; $k < $n; $k++) {
                $hour = [12, 12, 13, 13, 14, 17, 18, 18, 19, 19, 20, 21][mt_rand(0, 11)];
                $at = $day->copy()->setTime($hour, mt_rand(0, 59));
                if ($at->isFuture()) {
                    continue;
                }
                $status = mt_rand(1, 100) <= 6 ? (mt_rand(0, 1) ? 'cancelled' : 'rejected') : 'delivered';
                $this->order($vendors->random(), $customers->random(), $active->random(), $methods[mt_rand(0, 8)], $at, $status, $rate, $ledger);
            }
        }

        // Live orders right now, across every stage
        foreach (['placed', 'placed', 'accepted', 'preparing', 'preparing', 'ready', 'picked_up', 'arriving'] as $i => $status) {
            $this->order($vendors->where('city', 'Harare')->random(), $customers->random(), in_array($status, ['picked_up', 'arriving', 'ready'], true) ? $active[$i % $active->count()] : null, $methods[$i], now()->subMinutes(4 + $i * 6), $status, $rate, $ledger);
        }

        // Reviews, refunds, support
        Order::where('status', 'delivered')->inRandomOrder()->limit(70)->get()->each(function (Order $o) {
            $r = mt_rand(1, 100) > 88 ? mt_rand(2, 3) : mt_rand(4, 5);
            Review::create(['order_id' => $o->id, 'user_id' => $o->user_id, 'vendor_id' => $o->vendor_id, 'driver_id' => $o->driver_id, 'vendor_rating' => $r, 'driver_rating' => mt_rand(4, 5),
                'comment' => mt_rand(0, 2) ? self::COMMENTS[mt_rand(0, 8)] : null, 'created_at' => $o->delivered_at]);
        });
        Vendor::all()->each(fn ($v) => $v->update(['rating' => round((float) Review::where('vendor_id', $v->id)->avg('vendor_rating') ?: 4.5, 2), 'rating_count' => Review::where('vendor_id', $v->id)->count()]));

        Order::where('status', 'delivered')->latest()->limit(4)->get()->each(fn ($o, $i) => Refund::create(['order_id' => $o->id, 'requested_by' => $o->user_id, 'amount_zig' => [25, 18, 60, 35][$i], 'reason' => ['missing_items', 'cold_food', 'wrong_items', 'late'][$i], 'items' => $i === 0 ? ['Covo with Dovi'] : null, 'note' => ['The covo was missing from my order', 'Food arrived cold', 'Got chicken instead of beef', 'Took over 1 hour'][$i]]));

        foreach ([['Where is my order?', 'It has been 50 minutes, the app says on the way.', 'high'], ['Refund not received', 'I cancelled yesterday but no money back on EcoCash.', 'normal'], ['Can I change my address?', 'I put the wrong gate number.', 'normal']] as $i => [$s, $m, $p]) {
            SupportTicket::create(['user_id' => $customers[$i]->id, 'subject' => $s, 'message' => $m, 'priority' => $p, 'created_at' => now()->subHours($i * 3 + 1)]);
        }
    }

    private function order(Vendor $vendor, User $user, ?Driver $driver, string $method, Carbon $at, string $status, float $rate, LedgerService $ledger): void
    {
        $items = $vendor->items->random(min(mt_rand(1, 3), $vendor->items->count()));
        $lines = $items->map(fn (Item $i) => ['item' => $i, 'qty' => mt_rand(1, 2)]);
        $subtotal = $lines->sum(fn ($l) => $l['item']->effectivePrice() * $l['qty']);
        $delivery = 15 + mt_rand(0, 4) * 4;
        $service = max(3, round($subtotal * 0.05, 2));
        $tip = mt_rand(0, 3) === 0 ? [5, 10, 15][mt_rand(0, 2)] : 0;
        $total = $subtotal + $delivery + $service + $tip;
        $live = in_array($status, Order::LIVE, true);

        $history = [['status' => 'placed', 'at' => $at->toIso8601String()]];
        $order = Order::create([
            'user_id' => $user->id, 'vendor_id' => $vendor->id, 'zone_id' => $vendor->zone_id, 'address_id' => $user->addresses()->value('id'),
            'driver_id' => in_array($status, ['delivered', 'ready', 'picked_up', 'arriving'], true) ? $driver?->id : null,
            'source' => mt_rand(0, 9) ? 'app' : 'web', 'fulfilment' => 'delivery', 'status' => $status,
            'kitchen_stage' => match ($status) { 'preparing' => 'cooking', 'ready', 'picked_up', 'arriving', 'delivered' => 'ready', default => 'new' },
            'payment_method' => $method, 'payment_status' => in_array($status, ['cancelled', 'rejected'], true) ? 'refunded' : ($method === 'cash' && $status !== 'delivered' ? 'pending_cash' : 'paid'),
            'subtotal_zig' => $subtotal, 'delivery_fee_zig' => $delivery, 'service_fee_zig' => $service, 'tip_zig' => $tip,
            'vat_zig' => round($total - $total / 1.155, 2), 'total_zig' => $total, 'zig_per_usd' => $rate, 'total_usd' => round($total / $rate, 2),
            'commission_zig' => round($subtotal * $vendor->commission_pct / 100, 2), 'driver_pay_zig' => 12 + mt_rand(2, 8) * 3.5, 'distance_km' => mt_rand(15, 70) / 10,
            'prep_minutes' => $vendor->prep_minutes, 'accepted_at' => $status === 'placed' ? null : $at->copy()->addMinutes(2),
            'ready_at' => in_array($status, ['ready', 'picked_up', 'arriving', 'delivered'], true) ? $at->copy()->addMinutes($vendor->prep_minutes + mt_rand(-5, 8)) : null,
            'picked_up_at' => in_array($status, ['picked_up', 'arriving', 'delivered'], true) ? $at->copy()->addMinutes($vendor->prep_minutes + 10) : null,
            'delivered_at' => $status === 'delivered' ? $at->copy()->addMinutes($vendor->prep_minutes + mt_rand(18, 38)) : null,
            'estimated_delivery_at' => $at->copy()->addMinutes($vendor->prep_minutes + 25),
            'cancelled_at' => in_array($status, ['cancelled', 'rejected'], true) ? $at->copy()->addMinutes(5) : null,
            'cancelled_by' => $status === 'rejected' ? 'store' : ($status === 'cancelled' ? 'customer' : null),
            'cancel_reason' => $status === 'cancelled' ? 'Changed my mind' : null, 'reject_reason' => $status === 'rejected' ? 'too busy' : null,
            'delivery_pin' => sprintf('%04d', mt_rand(0, 9999)), 'status_history' => $history, 'created_at' => $at, 'updated_at' => $live ? now() : $at,
        ]);
        foreach ($lines as $l) {
            $order->items()->create(['item_id' => $l['item']->id, 'name' => $l['item']->name, 'quantity' => $l['qty'], 'unit_price_zig' => $l['item']->effectivePrice(), 'line_total_zig' => $l['item']->effectivePrice() * $l['qty']]);
        }
        $order->payments()->create(['provider' => in_array($method, ['cash', 'wallet'], true) ? $method : 'paynow', 'method' => $method, 'amount_zig' => $total, 'status' => $order->payment_status === 'paid' ? 'paid' : 'pending', 'provider_reference' => $method === 'cash' ? null : 'PN'.mt_rand(1000000, 9999999)]);

        if ($status === 'delivered') {
            $ledger->settleDelivered($order->fresh(['vendor', 'driver', 'promoCode']));
            \App\Models\LedgerEntry::where('order_id', $order->id)->update(['created_at' => $order->delivered_at]);
        }
    }
}

<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Driver;
use App\Models\Item;
use App\Models\NotificationTemplate;
use App\Models\Page;
use App\Models\SubscriptionPlan;
use App\Models\Zone;
use App\Models\ExchangeRate;
use App\Models\HomeBlock;
use App\Models\LoyaltyRule;
use App\Models\PromoCode;
use App\Models\Reward;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database with demo data matching the design handover.
     */
    public function run(): void
    {
        Setting::put('platform_mode', 'marketplace');
        ExchangeRate::create(['zig_per_usd' => 26.8, 'effective_at' => now()->subDay()]);

        $sort = 0;
        foreach (['Traditional' => '🍲', 'Grills' => '🔥', 'Burgers' => '🍔', 'Pizza' => '🍕', 'Chicken' => '🍗', 'Groceries' => '🛒', 'Drinks' => '🥤', 'Desserts' => '🍰'] as $name => $icon) {
            Category::create(['name' => $name, 'icon' => $icon, 'sort_order' => $sort++]);
        }

        $vendors = [
            ['Mama Rudo\'s Kitchen', 'Traditional', 'Harare', 4.8, 25, 15, true, [
                'Mains' => [['Sadza & Beef Stew', 85, 'Hand-stirred sadza with slow-cooked beef stew and covo.'], ['Sadza & Road Runner', 95, 'Free-range village chicken, tomato & onion relish.'], ['Matemba & Sadza', 70, 'Crispy kapenta with peanut-butter greens.']],
                'Sides' => [['Covo with Dovi', 25, 'Greens cooked in peanut butter.'], ['Nyemba', 20, 'Stewed cowpeas.']],
                'Drinks' => [['Maheu', 18, 'Traditional fermented maize drink.'], ['Mazoe Orange', 15, '500ml.']],
            ]],
            ['Braai Masters', 'Grills', 'Harare', 4.6, 30, 20, true, [
                'Braai Platters' => [['Boerewors Roll', 60, 'Grilled boerewors in a fresh roll with chakalaka.'], ['Mixed Braai Platter', 210, 'T-bone, wors, chicken and sadza for two.'], ['Pork Chops & Chips', 120, 'Two flame-grilled chops.']],
                'Sides' => [['Chakalaka', 20, 'Spicy vegetable relish.'], ['Pap', 15, 'Stiff maize porridge.']],
            ]],
            ['Bulawayo Burger Co.', 'Burgers', 'Bulawayo', 4.5, 20, 10, false, [
                'Burgers' => [['Classic Smash', 75, 'Double patty, cheese, house sauce.'], ['Peri-Peri Chicken Burger', 80, 'Grilled thigh, peri-peri mayo.']],
                'Sides' => [['Chips', 25, 'Hand-cut, salted.'], ['Onion Rings', 30, 'Beer battered.']],
            ]],
            ['Pizza Piazza', 'Pizza', 'Harare', 4.4, 25, 0, false, [
                'Pizzas' => [['Margherita', 90, 'Tomato, mozzarella, basil.'], ['Boerewors & Peppadew', 125, 'A local favourite.']],
                'Drinks' => [['Coke 2L', 35, 'Ice cold.']],
            ]],
        ];

        foreach ($vendors as $vi => [$name, $cuisine, $city, $rating, $prep, $fee, $featured, $menu]) {
            $vendor = Vendor::create([
                'name' => $name, 'slug' => Str::slug($name), 'cuisine' => $cuisine, 'city' => $city,
                'status' => 'active', 'rating' => $rating, 'prep_minutes' => $prep,
                'delivery_fee_zig' => $fee, 'min_order_zig' => 50, 'is_featured' => $featured,
                'commission_pct' => 15, 'address' => $city === 'Harare' ? 'Samora Machel Ave, Harare' : 'Main St, Bulawayo',
                'lat' => $city === 'Harare' ? -17.8292 : -20.1500, 'lng' => $city === 'Harare' ? 31.0522 : 28.5833,
            ]);

            $cSort = 0;
            foreach ($menu as $catName => $items) {
                $cat = $vendor->categories()->create(['name' => $catName, 'sort_order' => $cSort++]);
                foreach ($items as $ii => [$itemName, $price, $desc]) {
                    $vendor->items()->create([
                        'category_id' => $cat->id, 'name' => $itemName, 'description' => $desc, 'price_zig' => $price,
                        'sort_order' => $ii,
                        'dietary' => self::dietaryFor($itemName.' '.$desc),
                        'is_special' => $vi === 0 && $ii === 0,
                        'special_price_zig' => $vi === 1 && $ii === 1 ? 180 : null,
                        'variants' => $cSort === 1 ? [['name' => 'Regular', 'price_delta_zig' => 0], ['name' => 'Large', 'price_delta_zig' => 20]] : null,
                        'modifiers' => $cSort === 1 ? [['group' => 'Extras', 'max' => 3, 'options' => [['name' => 'Extra relish', 'price_delta_zig' => 10], ['name' => 'Extra meat', 'price_delta_zig' => 30]]]] : null,
                    ]);
                }
            }
        }

        // Staff accounts (password: password)
        $first = Vendor::first();
        User::create(['name' => 'Super Admin', 'email' => 'admin@zvino.co.zw', 'password' => 'password', 'role' => 'super_admin']);
        User::create(['name' => 'Rudo Manager', 'email' => 'manager@zvino.co.zw', 'password' => 'password', 'role' => 'vendor_manager', 'vendor_id' => $first->id]);
        User::create(['name' => 'Tendai Cashier', 'email' => 'cashier@zvino.co.zw', 'password' => 'password', 'role' => 'cashier', 'vendor_id' => $first->id]);
        User::create(['name' => 'Kitchen Display', 'email' => 'kitchen@zvino.co.zw', 'password' => 'password', 'role' => 'kitchen', 'vendor_id' => $first->id]);
        User::create(['name' => 'Demo Customer', 'phone' => '+263771234567', 'role' => 'customer']);

        $blocks = [
            ['hero', 'Lunch is on us', 'Get 20% off your first order with code ZVINO20', 'Order now', 'specials', ['background' => '#1C1C1C']],
            ['categories', 'What are you craving?', null, null, null, null],
            ['specials', 'Today\'s specials', 'Limited-time deals near you', 'See all', 'specials', ['limit' => 8]],
            ['vendors', 'Popular near you', null, 'See all', 'vendors', ['limit' => 10]],
            ['banner', 'Free delivery weekend', 'On orders over ZiG 150 from selected restaurants', null, null, ['tone' => 'gold']],
            ['rewards', 'Zvino Rewards', 'Earn points on every order', 'View rewards', 'rewards', null],
        ];
        foreach ($blocks as $i => [$type, $title, $subtitle, $cta, $link, $payload]) {
            HomeBlock::create(compact('type', 'title', 'subtitle', 'payload') + ['cta_label' => $cta, 'link_to' => $link, 'sort_order' => $i, 'published_at' => now()]);
        }
        HomeBlock::addStarterWebBlocks(count($blocks));
        HomeBlock::addStoreFeedBlocks();

        PromoCode::create(['code' => 'ZVINO20', 'type' => 'percent', 'value' => 20, 'min_order_zig' => 50, 'max_uses' => 1000]);
        PromoCode::create(['code' => 'FREEDEL', 'type' => 'free_delivery', 'value' => 0, 'min_order_zig' => 150]);

        LoyaltyRule::create(['name' => 'Base earn rate', 'type' => 'earn_per_zig', 'config' => ['points' => 0.1]]);
        Reward::create(['name' => 'ZiG 20 wallet credit', 'points_cost' => 200, 'type' => 'wallet_credit', 'config' => ['amount_zig' => 20]]);
        Reward::create(['name' => 'Free delivery', 'points_cost' => 150, 'type' => 'free_delivery']);
        Reward::create(['name' => 'Free Maheu', 'points_cost' => 100, 'type' => 'free_item']);

        $this->seedPlatform();
    }

    /** Zones, hours, drivers, Zvino+, templates and legal pages. */
    private function seedPlatform(): void
    {
        $harare = Zone::create([
            'name' => 'Harare CBD & Avenues', 'city' => 'Harare',
            'polygon' => [[-17.76, 30.98], [-17.76, 31.12], [-17.88, 31.12], [-17.88, 30.98]],
            'base_delivery_fee_zig' => 15, 'per_km_fee_zig' => 4, 'free_km' => 2, 'max_delivery_km' => 12,
        ]);
        $byo = Zone::create([
            'name' => 'Bulawayo City', 'city' => 'Bulawayo',
            'polygon' => [[-20.10, 28.52], [-20.10, 28.65], [-20.20, 28.65], [-20.20, 28.52]],
            'base_delivery_fee_zig' => 12, 'per_km_fee_zig' => 3.5, 'free_km' => 2, 'max_delivery_km' => 10,
        ]);

        foreach (Vendor::all() as $v) {
            $v->update(['zone_id' => $v->city === 'Harare' ? $harare->id : $byo->id, 'phone' => '+263242700'.str_pad($v->id, 3, '0', STR_PAD_LEFT)]);
            foreach (range(0, 6) as $day) {
                $v->hours()->create(['weekday' => $day, 'opens_at' => '07:00:00', 'closes_at' => $day === 5 || $day === 6 ? '02:00:00' : '23:00:00']);
            }
        }
        // Grills and pizza need electricity: hidden during load-shedding.
        Item::whereHas('vendor', fn ($q) => $q->whereIn('cuisine', ['Grills', 'Pizza']))->update(['needs_power' => true]);

        $driverUser = User::create(['name' => 'Farai Moyo', 'phone' => '+263772000001', 'role' => 'driver']);
        Driver::create([
            'user_id' => $driverUser->id, 'zone_id' => $harare->id, 'status' => 'approved', 'approved_at' => now(),
            'vehicle_type' => 'motorbike', 'vehicle_make' => 'Honda Ace 125', 'vehicle_plate' => 'AEZ 1234',
            'national_id' => '63-123456-A-42', 'licence_number' => 'DL998877',
        ]);

        SubscriptionPlan::create([
            'name' => 'Zvino+', 'price_zig' => 99, 'interval' => 'month', 'min_order_for_free_delivery_zig' => 80,
            'service_fee_discount_pct' => 50, 'perks' => ['Free delivery on orders over ZiG 80', '50% off service fees', 'No small-order fees', 'Member-only deals'],
        ]);

        $templates = [
            ['order.accepted', 'push', 'Order confirmed', '{{store}} is preparing your order. Ready in about {{prep}} min.'],
            ['order.picked_up', 'push', 'On the way', '{{driver}} is on the way with your order.'],
            ['order.picked_up', 'sms', null, 'Zvino: {{driver}} is on the way with order {{order_ref}}. Track: {{link}}'],
            ['order.delivered', 'push', 'Delivered', 'Enjoy your meal! Tap to rate {{store}}.'],
            ['auth.otp', 'sms', null, 'Your Zvino code is {{code}}. It expires in 5 minutes. Never share it.'],
        ];
        foreach ($templates as [$event, $channel, $title, $body]) {
            NotificationTemplate::create(compact('event', 'channel', 'title', 'body'));
        }

        foreach (['terms' => 'Terms of Service', 'privacy' => 'Privacy Policy', 'about' => 'About Zvino', 'faq' => 'Help & FAQ', 'drivers' => 'Drive with Zvino', 'partners' => 'Partner with Zvino'] as $slug => $title) {
            Page::create(['slug' => $slug, 'title' => $title, 'body' => "<p>{$title}: content to be supplied by Zvino.</p>"]);
        }
    }

    /** Demo dietary tags inferred from the dish name. */
    private static function dietaryFor(string $text): array
    {
        $t = strtolower($text);
        $meat = preg_match('/beef|chicken|goat|oxtail|pork|boerewors|mince|matumbu|wings|burger|fish|kapenta|bream|meat/', $t);
        $tags = $meat ? ['halal'] : ['vegetarian'];
        if (preg_match('/chilli|peri|spicy|hot/', $t)) {
            $tags[] = 'spicy';
        }
        if (preg_match('/salad|veg|greens|covo|rape|beans|chips|fries|maheu|juice|tea|coffee/', $t) && ! $meat) {
            $tags[] = 'vegan';
        }
        if (! str_contains($t, 'pork')) {
            $tags[] = 'no_pork';
        }
        if (! preg_match('/peanut|nut|dovi/', $t)) {
            $tags[] = 'nut_free';
        }

        return $tags;
    }
}

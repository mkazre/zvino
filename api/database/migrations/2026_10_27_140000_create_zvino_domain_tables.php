<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key')->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->id();
            $table->decimal('zig_per_usd', 12, 4);
            $table->timestamp('effective_at');
            $table->timestamps();
        });

        Schema::create('vendors', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('cuisine')->nullable();
            $table->text('description')->nullable();
            $table->string('logo_path')->nullable();
            $table->string('cover_path')->nullable();
            $table->string('city')->index();
            $table->string('address')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->enum('status', ['active', 'pending', 'suspended'])->default('pending');
            $table->decimal('commission_pct', 5, 2)->default(15);
            $table->decimal('rating', 3, 2)->default(0);
            $table->unsignedInteger('prep_minutes')->default(20);
            $table->decimal('delivery_fee_zig', 12, 2)->default(0);
            $table->decimal('min_order_zig', 12, 2)->default(0);
            $table->boolean('is_featured')->default(false);
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->string('email')->nullable()->change();
            $table->string('password')->nullable()->change();
            $table->string('phone')->nullable()->unique()->after('email');
            $table->enum('role', ['customer', 'super_admin', 'vendor_manager', 'cashier', 'kitchen'])->default('customer')->after('phone');
            $table->foreignId('vendor_id')->nullable()->after('role')->constrained()->nullOnDelete();
            $table->string('preferred_currency', 3)->default('ZIG')->after('vendor_id');
        });

        Schema::create('otp_codes', function (Blueprint $table) {
            $table->id();
            $table->string('phone')->index();
            $table->string('code_hash');
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('expires_at');
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('icon')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('image_path')->nullable();
            $table->decimal('price_zig', 12, 2);
            $table->decimal('special_price_zig', 12, 2)->nullable();
            $table->boolean('is_available')->default(true);
            $table->boolean('is_special')->default(false);
            $table->json('variants')->nullable();   // [{name, price_delta_zig}]
            $table->json('modifiers')->nullable();  // [{group, max, options:[{name, price_delta_zig}]}]
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('label')->default('Home');
            $table->string('line1');
            $table->string('suburb')->nullable();
            $table->string('city');
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->text('instructions')->nullable();
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        Schema::create('promo_codes', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->enum('type', ['percent', 'fixed', 'free_delivery']);
            $table->decimal('value', 12, 2)->default(0);
            $table->decimal('min_order_zig', 12, 2)->default(0);
            $table->unsignedInteger('max_uses')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->foreignId('vendor_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('carts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('promo_code_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('cart_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cart_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->json('options')->nullable(); // {variant, modifiers[]}
            $table->decimal('unit_price_zig', 12, 2);
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('vendor_id')->constrained();
            $table->foreignId('address_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('promo_code_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('cashier_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('source', ['app', 'web', 'pos'])->default('app');
            $table->enum('fulfilment', ['delivery', 'pickup', 'dine_in'])->default('delivery');
            $table->enum('status', ['pending_payment', 'placed', 'accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'])->default('pending_payment')->index();
            $table->enum('kitchen_stage', ['new', 'cooking', 'ready'])->default('new');
            $table->string('payment_method');
            $table->enum('payment_status', ['unpaid', 'pending', 'pending_cash', 'paid', 'failed', 'refunded'])->default('unpaid');
            $table->decimal('subtotal_zig', 12, 2);
            $table->decimal('delivery_fee_zig', 12, 2)->default(0);
            $table->decimal('service_fee_zig', 12, 2)->default(0);
            $table->decimal('discount_zig', 12, 2)->default(0);
            $table->decimal('vat_zig', 12, 2)->default(0);
            $table->decimal('total_zig', 12, 2);
            $table->decimal('zig_per_usd', 12, 4);   // rate snapshot
            $table->decimal('total_usd', 12, 2);     // USD snapshot
            $table->decimal('commission_zig', 12, 2)->default(0);
            $table->text('notes')->nullable();
            $table->string('rider_name')->nullable();
            $table->string('rider_phone')->nullable();
            $table->decimal('rider_lat', 10, 7)->nullable();
            $table->decimal('rider_lng', 10, 7)->nullable();
            $table->json('status_history')->nullable();
            $table->timestamps();
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->unsignedInteger('quantity');
            $table->json('options')->nullable();
            $table->decimal('unit_price_zig', 12, 2);
            $table->decimal('line_total_zig', 12, 2);
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->string('provider');      // paynow, wallet, cash
            $table->string('method');        // ecocash, onemoney, innbucks, card, wallet, cash
            $table->string('phone')->nullable();
            $table->decimal('amount_zig', 12, 2);
            $table->enum('status', ['initiated', 'pending', 'paid', 'failed', 'cancelled'])->default('initiated');
            $table->string('provider_reference')->nullable()->index();
            $table->string('poll_url')->nullable();
            $table->string('redirect_url')->nullable();
            $table->json('raw')->nullable();
            $table->timestamps();
        });

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('type', ['credit', 'debit']);
            $table->decimal('amount_zig', 12, 2);
            $table->string('reason');
            $table->timestamps();
        });

        Schema::create('loyalty_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('points')->default(0);
            $table->unsignedInteger('lifetime_points')->default(0);
            $table->string('tier')->default('Bronze');
            $table->timestamps();
        });

        Schema::create('loyalty_rules', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('type', ['earn_per_zig', 'tier_threshold', 'bonus']);
            $table->json('config');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('rewards', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('points_cost');
            $table->enum('type', ['wallet_credit', 'free_item', 'free_delivery', 'discount']);
            $table->json('config')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('loyalty_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('reward_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('points');
            $table->string('reason');
            $table->timestamps();
        });

        Schema::create('home_blocks', function (Blueprint $table) {
            $table->id();
            $table->enum('type', ['hero', 'categories', 'specials', 'vendors', 'banner', 'rewards', 'richtext', 'spacer']);
            $table->string('title')->nullable();
            $table->string('subtitle')->nullable();
            $table->string('cta_label')->nullable();
            $table->string('link_to')->nullable();
            $table->string('city_scope')->nullable();
            $table->unsignedInteger('sort_order')->default(0)->index();
            $table->boolean('is_visible')->default(true);
            $table->boolean('broadcast')->default(false);
            $table->json('payload')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('device_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('token')->unique();
            $table->string('platform')->nullable();
            $table->timestamps();
        });

        Schema::create('app_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type');
            $table->string('title');
            $table->text('body');
            $table->json('data')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::create('support_tickets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('subject');
            $table->text('message');
            $table->enum('status', ['open', 'pending', 'resolved'])->default('open');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['support_tickets', 'app_notifications', 'device_tokens', 'home_blocks', 'loyalty_transactions', 'rewards', 'loyalty_rules', 'loyalty_accounts', 'wallet_transactions', 'payments', 'order_items', 'orders', 'cart_items', 'carts', 'promo_codes', 'addresses', 'items', 'categories', 'otp_codes'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('vendor_id');
            $table->dropColumn(['phone', 'role', 'preferred_currency']);
        });
        foreach (['vendors', 'exchange_rates', 'settings'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};

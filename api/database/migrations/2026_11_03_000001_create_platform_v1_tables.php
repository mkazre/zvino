<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Zones & fees ────────────────────────────────────────────────
        Schema::create('zones', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('city')->index();
            $table->json('polygon');                       // [[lat,lng], ...]
            $table->boolean('is_active')->default(true);
            $table->decimal('base_delivery_fee_zig', 12, 2)->default(15);
            $table->decimal('per_km_fee_zig', 12, 2)->default(4);
            $table->decimal('free_km', 5, 2)->default(2);
            $table->decimal('max_delivery_km', 5, 2)->default(12);
            $table->decimal('min_order_zig', 12, 2)->default(0);
            $table->decimal('surge_multiplier', 4, 2)->default(1);
            $table->string('surge_reason')->nullable();
            $table->unsignedSmallInteger('extra_eta_minutes')->default(0);
            $table->timestamps();
        });

        // ── Stores: hours, busy mode, pause ─────────────────────────────
        Schema::table('vendors', function (Blueprint $table) {
            $table->foreignId('zone_id')->nullable()->after('city')->constrained()->nullOnDelete();
            $table->string('phone')->nullable()->after('address');
            $table->string('email')->nullable()->after('phone');
            $table->json('tags')->nullable()->after('cuisine');
            $table->unsignedTinyInteger('price_level')->default(2)->after('tags'); // 1-4 ($ - $$$$)
            $table->decimal('delivery_radius_km', 5, 2)->default(8)->after('lng');
            $table->boolean('offers_delivery')->default(true);
            $table->boolean('offers_pickup')->default(true);
            $table->boolean('accepts_scheduled')->default(true);
            $table->boolean('auto_accept')->default(false);
            $table->boolean('is_busy')->default(false);
            $table->unsignedSmallInteger('busy_extra_minutes')->default(15);
            $table->timestamp('paused_until')->nullable();
            $table->unsignedInteger('rating_count')->default(0);
            $table->string('payout_method')->nullable();   // ecocash, bank
            $table->json('payout_details')->nullable();
        });

        Schema::create('vendor_hours', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('weekday');        // 0 = Sunday
            $table->time('opens_at');
            $table->time('closes_at');                     // may be < opens_at (past midnight)
            $table->index(['vendor_id', 'weekday']);
        });

        Schema::create('vendor_closures', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->date('date');
            $table->string('reason')->nullable();
            $table->unique(['vendor_id', 'date']);
        });

        // ── Menu: real modifier groups, stock ───────────────────────────
        Schema::table('items', function (Blueprint $table) {
            $table->timestamp('unavailable_until')->nullable()->after('is_available');
            $table->json('dietary')->nullable()->after('description');      // vegetarian, halal, spicy…
            $table->unsignedInteger('calories')->nullable()->after('dietary');
            $table->boolean('is_popular')->default(false)->after('is_special');
        });

        Schema::create('modifier_groups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->unsignedTinyInteger('min_select')->default(0);
            $table->unsignedTinyInteger('max_select')->default(1);
            $table->timestamps();
        });

        Schema::create('modifier_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('modifier_group_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->decimal('price_delta_zig', 12, 2)->default(0);
            $table->boolean('is_available')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
        });

        Schema::create('item_modifier_group', function (Blueprint $table) {
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('modifier_group_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('sort_order')->default(0);
            $table->primary(['item_id', 'modifier_group_id']);
        });

        // ── Users ───────────────────────────────────────────────────────
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_path')->nullable();
            $table->string('referral_code')->nullable()->unique();
            $table->foreignId('referred_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('locale', 5)->default('en');
            $table->boolean('marketing_opt_in')->default(true);
            $table->timestamp('banned_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
        });
        // Add 'driver' to the role enum (SQLite stores enums as CHECK constraints; MySQL needs ALTER).
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE users MODIFY role ENUM('customer','super_admin','admin','support','vendor_manager','cashier','kitchen','driver') NOT NULL DEFAULT 'customer'");
        } else {
            Schema::table('users', fn (Blueprint $t) => $t->string('role')->default('customer')->change());
        }

        Schema::create('permissions', function (Blueprint $table) {
            $table->id();
            $table->string('role');
            $table->string('permission');
            $table->unique(['role', 'permission']);
        });

        // ── Drivers & dispatch ──────────────────────────────────────────
        Schema::create('drivers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete();
            $table->enum('status', ['applied', 'approved', 'suspended', 'rejected'])->default('applied');
            $table->enum('vehicle_type', ['motorbike', 'bicycle', 'car', 'on_foot'])->default('motorbike');
            $table->string('vehicle_make')->nullable();
            $table->string('vehicle_plate')->nullable();
            $table->string('national_id')->nullable();
            $table->string('licence_number')->nullable();
            $table->boolean('is_online')->default(false)->index();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->decimal('heading', 5, 1)->nullable();
            $table->timestamp('location_updated_at')->nullable();
            $table->decimal('rating', 3, 2)->default(5);
            $table->unsignedInteger('rating_count')->default(0);
            $table->unsignedInteger('completed_deliveries')->default(0);
            $table->decimal('acceptance_rate', 5, 2)->default(100);
            $table->string('payout_method')->nullable();
            $table->json('payout_details')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });

        Schema::create('driver_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['national_id', 'licence', 'vehicle_registration', 'insurance', 'police_clearance', 'selfie']);
            $table->string('path');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->string('note')->nullable();
            $table->date('expires_on')->nullable();
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('driver_id')->nullable()->after('cashier_id')->constrained()->nullOnDelete();
            $table->foreignId('zone_id')->nullable()->after('driver_id')->constrained()->nullOnDelete();
            $table->foreignId('group_order_id')->nullable()->after('zone_id');
            $table->timestamp('scheduled_for')->nullable()->index();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('picked_up_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->string('cancelled_by')->nullable();     // customer, store, admin, system
            $table->unsignedSmallInteger('prep_minutes')->nullable();
            $table->timestamp('estimated_delivery_at')->nullable();
            $table->decimal('distance_km', 6, 2)->nullable();
            $table->decimal('tip_zig', 12, 2)->default(0);
            $table->decimal('small_order_fee_zig', 12, 2)->default(0);
            $table->decimal('refunded_zig', 12, 2)->default(0);
            $table->decimal('driver_pay_zig', 12, 2)->default(0);
            $table->decimal('vendor_payout_zig', 12, 2)->default(0);
            $table->string('delivery_pin', 4)->nullable();
            $table->string('proof_photo_path')->nullable();
            $table->enum('dropoff', ['hand_to_me', 'leave_at_door'])->default('hand_to_me');
            $table->string('reject_reason')->nullable();
        });

        // Lifecycle gains scheduled / rejected / driver states; payment gains partial refunds.
        Schema::table('orders', function (Blueprint $table) {
            $table->string('status')->default('pending_payment')->change();
            $table->string('payment_status')->default('unpaid')->change();
        });

        Schema::create('dispatch_offers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['offered', 'accepted', 'declined', 'expired', 'cancelled'])->default('offered')->index();
            $table->decimal('pickup_km', 6, 2)->nullable();
            $table->decimal('pay_zig', 12, 2);
            $table->timestamp('expires_at');
            $table->timestamp('responded_at')->nullable();
            $table->timestamps();
        });

        Schema::create('driver_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('driver_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->timestamp('recorded_at')->index();
        });

        // ── Engagement ──────────────────────────────────────────────────
        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('driver_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('vendor_rating');
            $table->unsignedTinyInteger('driver_rating')->nullable();
            $table->text('comment')->nullable();
            $table->json('tags')->nullable();              // "Hot food", "Friendly driver"…
            $table->text('vendor_reply')->nullable();
            $table->boolean('is_hidden')->default(false);
            $table->timestamps();
        });

        Schema::create('favorites', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
            $table->primary(['user_id', 'vendor_id']);
        });

        Schema::create('refunds', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('amount_zig', 12, 2);
            $table->enum('destination', ['wallet', 'original'])->default('wallet');
            $table->enum('status', ['requested', 'approved', 'rejected', 'paid'])->default('requested');
            $table->string('reason');
            $table->json('items')->nullable();
            $table->string('evidence_path')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();
        });

        Schema::create('referrals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('referrer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('referee_id')->unique()->constrained('users')->cascadeOnDelete();
            $table->enum('status', ['pending', 'rewarded'])->default('pending');
            $table->decimal('reward_zig', 12, 2)->default(0);
            $table->timestamps();
        });

        Schema::create('gift_cards', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->decimal('amount_zig', 12, 2);
            $table->foreignId('purchased_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('redeemed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('recipient_name')->nullable();
            $table->string('recipient_phone')->nullable();
            $table->string('message')->nullable();
            $table->enum('status', ['pending_payment', 'active', 'redeemed', 'void'])->default('pending_payment');
            $table->timestamp('redeemed_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('name');                        // Zvino+
            $table->decimal('price_zig', 12, 2);
            $table->enum('interval', ['month', 'year']);
            $table->decimal('min_order_for_free_delivery_zig', 12, 2)->default(0);
            $table->decimal('service_fee_discount_pct', 5, 2)->default(0);
            $table->json('perks')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_id')->constrained();
            $table->enum('status', ['active', 'cancelled', 'expired', 'pending_payment'])->default('pending_payment');
            $table->timestamp('current_period_end')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->timestamps();
        });

        Schema::create('group_orders', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->foreignId('host_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->enum('status', ['open', 'locked', 'ordered', 'cancelled'])->default('open');
            $table->decimal('spend_limit_zig', 12, 2)->nullable();
            $table->timestamp('deadline_at')->nullable();
            $table->timestamps();
        });

        Schema::create('group_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('group_order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('guest_name')->nullable();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->json('options')->nullable();
            $table->decimal('unit_price_zig', 12, 2);
            $table->string('notes')->nullable();
            $table->timestamps();
        });

        Schema::create('order_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('sender_role', ['customer', 'driver', 'store', 'support', 'system']);
            $table->enum('channel', ['customer_driver', 'customer_store', 'support'])->default('customer_driver');
            $table->text('body');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });

        Schema::table('support_tickets', function (Blueprint $table) {
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');
            $table->string('category')->nullable();
        });

        Schema::create('support_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('support_ticket_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_staff')->default(false);
            $table->text('body');
            $table->string('attachment_path')->nullable();
            $table->timestamps();
        });

        // ── Money: ledger & payouts ─────────────────────────────────────
        Schema::create('ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->morphs('account');                     // Vendor or Driver
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('payout_id')->nullable();
            $table->enum('type', ['earning', 'tip', 'commission', 'adjustment', 'refund', 'payout', 'cash_collected']);
            $table->decimal('amount_zig', 12, 2);           // + owed to account, − owed to Zvino
            $table->string('description');
            $table->timestamps();
        });

        Schema::create('payouts', function (Blueprint $table) {
            $table->id();
            $table->morphs('account');
            $table->decimal('amount_zig', 12, 2);
            $table->date('period_start');
            $table->date('period_end');
            $table->enum('status', ['pending', 'processing', 'paid', 'failed'])->default('pending');
            $table->string('method')->nullable();
            $table->string('reference')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        // ── Comms ───────────────────────────────────────────────────────
        Schema::create('notification_templates', function (Blueprint $table) {
            $table->id();
            $table->string('event');                       // order.accepted, driver.arriving…
            $table->enum('channel', ['push', 'sms', 'email']);
            $table->string('title')->nullable();
            $table->text('body');                          // supports {{order_ref}}, {{store}}, {{eta}}…
            $table->boolean('is_active')->default(true);
            $table->unique(['event', 'channel']);
            $table->timestamps();
        });

        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('channel', ['push', 'sms', 'email']);
            $table->string('title')->nullable();
            $table->text('body');
            $table->json('audience');                      // {city, tier, inactive_days, ...}
            $table->string('link_to')->nullable();
            $table->enum('status', ['draft', 'scheduled', 'sending', 'sent'])->default('draft');
            $table->timestamp('scheduled_at')->nullable();
            $table->unsignedInteger('sent_count')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('pages', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();              // terms, privacy, about, faq…
            $table->string('title');
            $table->longText('body');
            $table->boolean('is_published')->default(true);
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action');                      // settings.updated, order.refunded…
            $table->nullableMorphs('subject');
            $table->json('changes')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        foreach (['audit_logs', 'pages', 'campaigns', 'notification_templates', 'payouts', 'ledger_entries', 'support_messages',
            'order_messages', 'group_order_items', 'group_orders', 'subscriptions', 'subscription_plans', 'gift_cards',
            'referrals', 'refunds', 'favorites', 'reviews', 'driver_locations', 'dispatch_offers', 'driver_documents',
            'permissions', 'item_modifier_group', 'modifier_options', 'modifier_groups', 'vendor_closures', 'vendor_hours'] as $t) {
            Schema::dropIfExists($t);
        }
        // Column additions are left in place on rollback; use migrate:fresh in development.
        Schema::dropIfExists('drivers');
        Schema::dropIfExists('zones');
    }
};

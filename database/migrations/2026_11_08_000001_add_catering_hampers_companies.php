<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Funeral & gathering catering, diaspora hampers, corporate accounts. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catering_requests', function (Blueprint $table) {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->string('event_type');                     // funeral, wedding, gathering, corporate, church, other
            $table->timestamp('event_at');
            $table->unsignedInteger('headcount');
            $table->string('location');
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->string('contact_name')->nullable();
            $table->string('contact_phone')->nullable();
            $table->json('lines')->nullable();               // optional menu picks [{item_id, quantity}]
            $table->text('notes')->nullable();
            $table->string('status')->default('requested');  // requested, quoted, deposit_paid, paid, completed, declined, cancelled
            $table->decimal('quote_zig', 12, 2)->nullable();
            $table->text('quote_note')->nullable();
            $table->decimal('deposit_pct', 5, 2)->default(50);
            $table->decimal('paid_zig', 12, 2)->default(0);
            $table->timestamp('quoted_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->boolean('accepts_catering')->default(false)->after('accepts_scheduled');
        });

        Schema::create('hampers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('image_path')->nullable();
            $table->json('lines');                           // [{item_id, quantity}]
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('recurring_orders', function (Blueprint $table) {
            $table->foreignId('hamper_id')->nullable()->after('vendor_id')->constrained()->nullOnDelete();
            $table->string('recipient_name')->nullable()->after('phone');
            $table->string('recipient_phone')->nullable()->after('recipient_name');
            $table->string('gift_message', 200)->nullable()->after('recipient_phone');
        });

        Schema::create('companies', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('billing_email')->nullable();
            $table->string('billing_contact')->nullable();
            $table->string('vat_number')->nullable();
            $table->decimal('monthly_budget_zig', 12, 2)->nullable();
            $table->decimal('daily_allowance_zig', 12, 2)->nullable();  // per employee, per day
            $table->json('allowed_days')->nullable();                     // ISO weekdays; null = every day
            $table->unsignedTinyInteger('payment_terms_days')->default(30);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('company_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('phone');                         // invite by phone; linked when they sign in
            $table->string('name')->nullable();
            $table->string('role')->default('member');       // member | admin
            $table->decimal('daily_allowance_zig', 12, 2)->nullable(); // override
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['company_id', 'phone']);
        });

        Schema::create('company_invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('number')->unique();
            $table->date('period_start');
            $table->date('period_end');
            $table->unsignedInteger('orders_count');
            $table->decimal('amount_zig', 12, 2);
            $table->date('due_on');
            $table->string('status')->default('sent');       // sent | paid
            $table->timestamp('paid_at')->nullable();
            $table->string('reference')->nullable();
            $table->timestamps();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->foreignId('company_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
            $table->foreignId('company_invoice_id')->nullable()->after('company_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('company_invoice_id');
            $table->dropConstrainedForeignId('company_id');
        });
        Schema::dropIfExists('company_invoices');
        Schema::dropIfExists('company_members');
        Schema::dropIfExists('companies');
        Schema::table('recurring_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('hamper_id');
            $table->dropColumn(['recipient_name', 'recipient_phone', 'gift_message']);
        });
        Schema::dropIfExists('hampers');
        Schema::table('vendors', fn (Blueprint $t) => $t->dropColumn('accepts_catering'));
        Schema::dropIfExists('catering_requests');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Recurring orders (lunch plans, month-end shop), pharmacy prescriptions, split the bill. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recurring_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('vendor_id')->constrained()->cascadeOnDelete();
            $table->foreignId('address_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('kind')->default('weekly');          // weekly | monthly
            $table->json('weekdays')->nullable();               // ISO 1-7 for weekly
            $table->unsignedTinyInteger('day_of_month')->nullable();
            $table->string('time', 5)->default('12:30');
            $table->json('lines');                              // [{item_id, quantity, variant, modifiers}]
            $table->string('fulfilment')->default('delivery');
            $table->string('payment_method')->default('wallet');
            $table->string('phone')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('next_run_at')->nullable()->index();
            $table->timestamp('reminded_for')->nullable();
            $table->foreignId('last_order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->string('last_error')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('vendors', function (Blueprint $table) {
            $table->string('kind')->default('restaurant')->after('cuisine'); // restaurant | grocery | market | pharmacy
        });
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('requires_prescription')->default(false)->after('needs_power');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->string('prescription_path')->nullable()->after('notes');
            $table->string('source')->default('app')->change(); // app, web, pos, plan, ussd…
            $table->foreignId('recurring_order_id')->nullable()->after('group_order_id')->constrained('recurring_orders')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('recurring_order_id');
            $table->dropColumn('prescription_path');
        });
        Schema::table('items', fn (Blueprint $t) => $t->dropColumn('requires_prescription'));
        Schema::table('vendors', fn (Blueprint $t) => $t->dropColumn('kind'));
        Schema::dropIfExists('recurring_orders');
    }
};

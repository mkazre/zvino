<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Split tender, charity round-up, no-cutlery, driver tiers, instant cash-out, merchant promos. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('wallet_applied_zig', 12, 2)->default(0)->after('total_zig');
            $table->decimal('donation_zig', 12, 2)->default(0)->after('wallet_applied_zig');
            $table->boolean('no_cutlery')->default(false)->after('dropoff');
        });

        Schema::table('drivers', function (Blueprint $table) {
            $table->string('tier')->default('bronze')->after('acceptance_rate');
        });

        Schema::table('payouts', function (Blueprint $table) {
            $table->boolean('is_instant')->default(false)->after('method');
            $table->decimal('fee_zig', 12, 2)->default(0)->after('amount_zig');
        });

        Schema::table('promo_codes', function (Blueprint $table) {
            $table->string('title')->nullable()->after('code');
            $table->foreignId('created_by')->nullable()->after('vendor_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('promo_codes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by');
            $table->dropColumn('title');
        });
        Schema::table('payouts', fn (Blueprint $t) => $t->dropColumn(['is_instant', 'fee_zig']));
        Schema::table('drivers', fn (Blueprint $t) => $t->dropColumn('tier'));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['wallet_applied_zig', 'donation_zig', 'no_cutlery']));
    }
};

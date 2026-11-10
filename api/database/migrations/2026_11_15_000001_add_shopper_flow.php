<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shopper flow for Zvino-run stores (e.g. TM Pick n Pay branches): the driver shops the order,
 * marks each item found / replaced / not available, pays at the till and delivers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vendors', function (Blueprint $table) {
            $table->boolean('is_shopper_store')->default(false)->after('kind'); // Zvino buys the items at the shop
        });
        DB::table('vendors')->whereIn('id', DB::table('supplier_locations')->whereNotNull('vendor_id')->pluck('vendor_id'))->update(['is_shopper_store' => true]);

        Schema::table('orders', function (Blueprint $table) {
            $table->string('substitution_pref', 12)->nullable()->after('dropoff'); // best | contact | refund
            $table->timestamp('shopping_started_at')->nullable();
            $table->timestamp('shopping_finished_at')->nullable();
            $table->decimal('till_total_usd', 10, 2)->nullable();
            $table->string('till_slip_path')->nullable();
            $table->string('till_paid_with', 20)->nullable();          // zvino_card | own_cash
            $table->decimal('shopping_refund_zig', 12, 2)->nullable();  // missing / cheaper items, back to the customer's wallet
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->string('shop_status', 12)->nullable();   // found | partial | replaced | missing
            $table->unsignedInteger('found_qty')->nullable();
            $table->json('replacement')->nullable();         // {item_id, name, quantity, unit_price_zig, line_total_zig, image}
            $table->decimal('refund_zig', 12, 2)->nullable();
            $table->timestamp('shopped_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('order_items', fn (Blueprint $t) => $t->dropColumn(['shop_status', 'found_qty', 'replacement', 'refund_zig', 'shopped_at']));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['substitution_pref', 'shopping_started_at', 'shopping_finished_at', 'till_total_usd', 'till_slip_path', 'till_paid_with', 'shopping_refund_zig']));
        Schema::table('vendors', fn (Blueprint $t) => $t->dropColumn('is_shopper_store'));
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer-chosen substitutes (Zvino-run stores): one optional substitute per basket line. When the
 * substitute costs more, the difference is paid up front as a "buffer"; whatever isn't used goes
 * back to the customer's wallet when the shopper finishes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table) {
            $table->foreignId('substitute_item_id')->nullable()->after('item_id')->constrained('items')->nullOnDelete();
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->json('substitute')->nullable()->after('options');          // {item_id, name, image, unit_price_zig}
            $table->decimal('buffer_zig', 12, 2)->nullable()->after('line_total_zig');
        });
        Schema::table('orders', function (Blueprint $table) {
            $table->decimal('substitution_buffer_zig', 12, 2)->default(0)->after('donation_zig');
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn('substitution_buffer_zig'));
        Schema::table('order_items', fn (Blueprint $t) => $t->dropColumn(['substitute', 'buffer_zig']));
        Schema::table('cart_items', fn (Blueprint $t) => $t->dropConstrainedForeignId('substitute_item_id'));
    }
};

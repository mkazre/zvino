<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Product import: a stable code per product (re-imports update instead of duplicating), shelf cost and size details. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->string('sku', 64)->nullable()->after('vendor_id');
            $table->decimal('cost_usd', 10, 2)->nullable()->after('special_price_zig'); // what Zvino pays on the shelf
            $table->json('attributes')->nullable()->after('dietary');                  // size, weight, branch stock, source
            $table->string('source_image_url', 500)->nullable()->after('image_path');
            $table->index(['vendor_id', 'sku']);
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropIndex(['vendor_id', 'sku']);
            $table->dropColumn(['sku', 'cost_usd', 'attributes', 'source_image_url']);
        });
    }
};

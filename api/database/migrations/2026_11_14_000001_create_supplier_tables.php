<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Supplier integrations (first one: TM Pick n Pay). Zvino reads the supplier's live catalogue and
 * branches, keeps its own copy here, and turns it into Zvino stores and menus with Zvino's markup.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_sources', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique();            // tmpnp
            $table->string('name');                          // TM Pick n Pay
            $table->boolean('enabled')->default(true);
            $table->string('store_name_pattern')->default('Zvino Market {branch}');
            $table->string('markup_type', 10)->default('percent'); // percent | fixed (USD)
            $table->decimal('markup_value', 10, 2)->default(0);
            $table->string('group_by', 12)->default('category');  // category (aisle) | department
            $table->boolean('hide_out_of_stock')->default(true);
            $table->boolean('weekly_sync')->default(true);
            $table->unsignedSmallInteger('shopping_minutes')->default(25);
            $table->unsignedSmallInteger('request_pause_ms')->default(1000); // gentle on the supplier's servers
            $table->timestamp('last_synced_at')->nullable();
            $table->json('sync_status')->nullable();
            $table->timestamps();
        });

        Schema::create('supplier_categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_source_id')->constrained()->cascadeOnDelete();
            $table->string('slug', 120);
            $table->string('name');
            $table->string('parent_slug', 120)->nullable();  // null = department
            $table->unsignedInteger('products_count')->default(0);
            $table->boolean('selected')->default(false);
            $table->string('markup_type', 10)->nullable();
            $table->decimal('markup_value', 10, 2)->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['supplier_source_id', 'slug']);
        });

        Schema::create('supplier_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_source_id')->constrained()->cascadeOnDelete();
            $table->string('external_id', 40);
            $table->string('sku', 64);
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('department')->nullable();
            $table->string('department_slug', 120)->nullable();
            $table->string('category')->nullable();
            $table->string('category_slug', 120)->nullable();
            $table->decimal('price_usd', 10, 2);
            $table->decimal('sale_price_usd', 10, 2)->nullable();
            $table->string('image_url', 500)->nullable();
            $table->string('image_path')->nullable();        // Zvino's own copy
            $table->json('attributes')->nullable();
            $table->json('stock')->nullable();              // {external location id: qty}
            $table->string('markup_type', 10)->nullable();
            $table->decimal('markup_value', 10, 2)->nullable();
            $table->boolean('active')->default(true);         // still in a selected category at the supplier
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
            $table->unique(['supplier_source_id', 'external_id']);
            $table->index(['supplier_source_id', 'category_slug']);
        });

        Schema::create('supplier_locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_source_id')->constrained()->cascadeOnDelete();
            $table->string('external_id', 40);
            $table->string('name');
            $table->string('branch');                       // tidy name, e.g. Cowdray Park
            $table->string('region')->nullable();
            $table->string('city')->nullable();
            $table->string('address')->nullable();
            $table->string('phone')->nullable();
            $table->decimal('lat', 10, 7)->nullable();
            $table->decimal('lng', 10, 7)->nullable();
            $table->time('opens_at')->nullable();
            $table->time('closes_at')->nullable();
            $table->boolean('active')->default(true);
            $table->foreignId('vendor_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
            $table->unique(['supplier_source_id', 'external_id']);
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('supplier_product_id')->nullable()->after('vendor_id')->constrained()->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('items', fn (Blueprint $table) => $table->dropConstrainedForeignId('supplier_product_id'));
        Schema::dropIfExists('supplier_locations');
        Schema::dropIfExists('supplier_products');
        Schema::dropIfExists('supplier_categories');
        Schema::dropIfExists('supplier_sources');
    }
};

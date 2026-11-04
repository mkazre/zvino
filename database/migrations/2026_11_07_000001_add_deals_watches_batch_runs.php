<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** BOGO & happy-hour deals, price-drop alerts, peri-urban batch runs. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promo_codes', function (Blueprint $table) {
            $table->string('type')->default('percent')->change(); // percent | fixed | free_delivery | bogo
            $table->foreignId('item_id')->nullable()->after('vendor_id')->constrained()->nullOnDelete();
            $table->unsignedTinyInteger('buy_qty')->default(1)->after('item_id');   // BOGO: buy N, get 1 free
            $table->json('days')->nullable()->after('ends_at');                     // happy hour: ISO weekdays
            $table->string('start_time', 5)->nullable()->after('days');
            $table->string('end_time', 5)->nullable()->after('start_time');
            $table->boolean('auto_apply')->default(false)->after('end_time');       // no code needed
        });

        Schema::create('item_watches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->decimal('price_zig', 12, 2);
            $table->timestamp('notified_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'item_id']);
        });

        Schema::table('zones', function (Blueprint $table) {
            $table->boolean('batch_mode')->default(false)->after('extra_eta_minutes');
            $table->json('batch_times')->nullable()->after('batch_mode');
            $table->unsignedTinyInteger('batch_max_orders')->default(6)->after('batch_times');
        });
    }

    public function down(): void
    {
        Schema::table('zones', fn (Blueprint $t) => $t->dropColumn(['batch_mode', 'batch_times', 'batch_max_orders']));
        Schema::dropIfExists('item_watches');
        Schema::table('promo_codes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('item_id');
            $table->dropColumn(['buy_qty', 'days', 'start_time', 'end_time', 'auto_apply']);
        });
    }
};

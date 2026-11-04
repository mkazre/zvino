<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Night safety zones, driver earnings goals, fresh-market items sold by weight. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('safety_zones', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('city')->nullable();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->decimal('radius_km', 5, 2)->default(1);
            $table->time('night_from')->default('19:00');
            $table->time('night_to')->default('05:00');
            $table->string('note')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::table('drivers', function (Blueprint $table) {
            $table->boolean('avoid_night_zones')->default(false)->after('tier');
            $table->decimal('daily_goal_zig', 12, 2)->nullable()->after('avoid_night_zones');
            $table->decimal('weekly_goal_zig', 12, 2)->nullable()->after('daily_goal_zig');
        });

        Schema::table('items', function (Blueprint $table) {
            $table->string('sold_by')->default('unit')->after('price_zig'); // unit | kg
            $table->decimal('step_kg', 6, 3)->default(0.5)->after('sold_by');
        });
    }

    public function down(): void
    {
        Schema::table('items', fn (Blueprint $t) => $t->dropColumn(['sold_by', 'step_kg']));
        Schema::table('drivers', fn (Blueprint $t) => $t->dropColumn(['avoid_night_zones', 'daily_goal_zig', 'weekly_goal_zig']));
        Schema::dropIfExists('safety_zones');
    }
};

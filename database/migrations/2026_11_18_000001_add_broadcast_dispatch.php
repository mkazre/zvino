<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * First-come-first-served dispatch: one order is offered to every nearby online driver at once.
 * round: 1st, 2nd... broadcast for the order (pay can rise and the radius widens each round).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dispatch_offers', function (Blueprint $table) {
            $table->boolean('broadcast')->default(false)->after('status');
            $table->unsignedTinyInteger('round')->default(1)->after('broadcast');
            $table->decimal('boost_pct', 5, 2)->default(0)->after('pay_zig');
            $table->decimal('dropoff_km', 6, 2)->nullable()->after('pickup_km');
            $table->index(['order_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('dispatch_offers', function (Blueprint $table) {
            $table->dropIndex(['order_id', 'status']);
            $table->dropColumn(['broadcast', 'round', 'boost_pct', 'dropoff_km']);
        });
    }
};

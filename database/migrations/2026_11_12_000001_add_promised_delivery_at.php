<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The live ETA (estimated_delivery_at) now moves as the order progresses; the time first promised
 * to the customer is kept separately so the hot-meal guarantee stays fair.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->timestamp('promised_delivery_at')->nullable()->after('estimated_delivery_at');
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $table) => $table->dropColumn('promised_delivery_at'));
    }
};

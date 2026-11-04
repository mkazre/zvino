<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Kitchen station routing: each category prints/shows on one station (grill, fryer, drinks…).
        Schema::table('categories', function (Blueprint $table) {
            $table->string('station')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('categories', fn (Blueprint $t) => $t->dropColumn('station'));
    }
};

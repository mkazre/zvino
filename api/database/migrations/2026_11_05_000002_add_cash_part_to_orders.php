<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Split tender: part paid in cash to the driver, the rest by EcoCash/OneMoney/InnBucks/card. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->decimal('cash_part_zig', 12, 2)->default(0)->after('wallet_applied_zig'));
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn('cash_part_zig'));
    }
};

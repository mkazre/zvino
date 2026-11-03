<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Load-shedding mode: stores flag a power cut; items that need power are hidden.
        Schema::table('vendors', function (Blueprint $table) {
            $table->boolean('power_out')->default(false);
            $table->unsignedSmallInteger('power_out_extra_minutes')->default(10);
        });
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('needs_power')->default(false);
        });

        // Landmark addresses with gate photo and voice-note directions.
        Schema::table('addresses', function (Blueprint $table) {
            $table->string('landmark')->nullable()->after('line1');
            $table->string('gate_photo_path')->nullable();
            $table->string('voice_note_path')->nullable();
            $table->foreignId('zone_id')->nullable()->constrained()->nullOnDelete();
        });

        // Wallet top-ups and gift-card purchases reuse payments without an order.
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('order_id')->nullable()->change();
            $table->nullableMorphs('payable');
        });
    }

    public function down(): void
    {
        Schema::table('vendors', fn (Blueprint $t) => $t->dropColumn(['power_out', 'power_out_extra_minutes']));
        Schema::table('items', fn (Blueprint $t) => $t->dropColumn('needs_power'));
        Schema::table('addresses', function (Blueprint $t) {
            $t->dropConstrainedForeignId('zone_id');
            $t->dropColumn(['landmark', 'gate_photo_path', 'voice_note_path']);
        });
        Schema::table('payments', fn (Blueprint $t) => $t->dropMorphs('payable'));
    }
};

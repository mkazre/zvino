<?php

use App\Models\HomeBlock;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Home builder gets 20 more section types: the type column becomes a plain string (it was an enum
 * of the original 8), and the sections that used to be hard-coded at the bottom of the website home
 * become editable blocks.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('home_blocks', function (Blueprint $table) {
            $table->string('type', 40)->change();
        });

        if (! HomeBlock::exists()) {
            return; // fresh install: the seeder builds the home page
        }
        $order = (int) HomeBlock::max('sort_order');
        HomeBlock::addStarterWebBlocks($order);
    }

    public function down(): void
    {
        HomeBlock::whereNotIn('type', HomeBlock::APP_TYPES)->delete();
    }
};

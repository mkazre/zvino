<?php

use App\Models\HomeBlock;
use Illuminate\Database\Migrations\Migration;

/** Location-aware store feeds on the home page (website and app), MrD-style. Editable in the Home builder. */
return new class extends Migration
{
    public function up(): void
    {
        if (! HomeBlock::exists()) {
            return; // fresh install: the seeder adds them
        }
        HomeBlock::addStoreFeedBlocks();
    }

    public function down(): void
    {
        HomeBlock::whereIn('type', ['order_again', 'recommended', 'deals_near_you', 'shops_near_you', 'brand_logos', 'all_stores', 'filter_chips', 'notice_banner'])->delete();
    }
};

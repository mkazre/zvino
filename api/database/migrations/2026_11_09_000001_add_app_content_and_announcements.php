<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Onboarding builder, remote launch screen, announcements to every audience. */
return new class extends Migration
{
    public function up(): void
    {
        // Draft slides edited in the admin; "Publish" snapshots them into app_contents.
        Schema::create('onboarding_slides', function (Blueprint $table) {
            $table->id();
            $table->string('app')->default('customer');       // customer | driver | merchant
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->string('image_path')->nullable();
            $table->string('heading')->nullable();
            $table->text('body')->nullable();
            $table->string('button_label')->nullable();
            $table->string('text_color', 9)->default('#FFFFFF');
            $table->string('text_position')->default('bottom'); // top | middle | bottom
            $table->json('overlay')->nullable();              // {type: solid|gradient|none, from, to, opacity, direction}
            $table->timestamps();
        });

        // What the apps download: published onboarding and launch screen, per app, versioned.
        Schema::create('app_contents', function (Blueprint $table) {
            $table->id();
            $table->string('app');
            $table->string('key');                            // onboarding | launch
            $table->unsignedInteger('version')->default(0);
            $table->json('payload')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->timestamp('published_at')->nullable();
            $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['app', 'key']);
        });

        Schema::table('campaigns', function (Blueprint $table) {
            $table->string('kind')->default('marketing')->after('channel'); // marketing | service
            $table->string('image_path')->nullable()->after('body');
        });
    }

    public function down(): void
    {
        Schema::table('campaigns', fn (Blueprint $t) => $t->dropColumn(['kind', 'image_path']));
        Schema::dropIfExists('app_contents');
        Schema::dropIfExists('onboarding_slides');
    }
};

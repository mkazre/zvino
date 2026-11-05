<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Website sign-up for restaurants/shops, drivers and corporate accounts. Every submission lands as a
 * draft application with its documents (private disk); staff review it and approve it into a store,
 * driver or company.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partner_applications', function (Blueprint $table) {
            $table->id();
            $table->string('reference', 16)->unique();
            $table->string('type', 20)->index();              // restaurant | driver | corporate
            $table->string('status', 20)->default('draft')->index(); // draft | in_review | needs_info | approved | rejected
            $table->string('title');                          // business / driver / company name
            $table->string('contact_name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('city')->nullable();
            $table->json('details');                          // every answer, keyed by field
            $table->text('notes')->nullable();                // internal, staff only
            $table->text('decision_message')->nullable();     // sent to the applicant (reject / needs info)
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->nullableMorphs('approvable');             // the Vendor / Driver / Company created on approval
            $table->string('ip', 45)->nullable();
            $table->string('user_agent')->nullable();
            $table->json('history')->nullable();              // [{at, by, action, message}]
            $table->timestamps();
        });

        Schema::create('application_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('partner_application_id')->constrained()->cascadeOnDelete();
            $table->string('field', 60);
            $table->string('label');
            $table->string('path');                           // local (private) disk
            $table->string('original_name');
            $table->string('mime', 100);
            $table->unsignedInteger('size');
            $table->timestamps();
        });

        Schema::table('vendors', function (Blueprint $table) {
            if (! Schema::hasColumn('vendors', 'payout_method')) {
                $table->string('payout_method')->nullable();
                $table->json('payout_details')->nullable();
            }
            if (! Schema::hasColumn('vendors', 'legal')) {
                $table->json('legal')->nullable();            // registration, tax and licence numbers
            }
        });

        Schema::table('companies', function (Blueprint $table) {
            if (! Schema::hasColumn('companies', 'details')) {
                $table->json('details')->nullable();          // industry, size, address, billing method
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_documents');
        Schema::dropIfExists('partner_applications');
        Schema::table('vendors', fn (Blueprint $t) => $t->dropColumn(['payout_method', 'payout_details', 'legal']));
        Schema::table('companies', fn (Blueprint $t) => $t->dropColumn('details'));
    }
};

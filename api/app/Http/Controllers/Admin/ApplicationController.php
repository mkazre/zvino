<?php

namespace App\Http\Controllers\Admin;

use App\Models\ApplicationDocument;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\Driver;
use App\Models\DriverDocument;
use App\Models\ExchangeRate;
use App\Models\PartnerApplication;
use App\Models\Setting;
use App\Models\User;
use App\Models\Vendor;
use App\Services\ApplicationNotifier;
use App\Support\Applications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

/** Admin → Applications: website sign-ups for stores, drivers and corporate accounts. */
class ApplicationController extends AdminController
{
    public function __construct(private ApplicationNotifier $notifier) {}

    public function index(Request $request)
    {
        $type = in_array($request->query('type'), PartnerApplication::TYPES, true) ? $request->query('type') : null;
        $status = $request->query('status', 'open');
        $q = trim((string) $request->query('q'));

        $base = PartnerApplication::query()->when($type, fn ($w) => $w->where('type', $type));
        $rows = (clone $base)
            ->when($status === 'open', fn ($w) => $w->whereIn('status', PartnerApplication::OPEN))
            ->when(in_array($status, PartnerApplication::STATUSES, true), fn ($w) => $w->where('status', $status))
            ->when($q, fn ($w) => $w->where(fn ($x) => $x->where('reference', 'like', "%$q%")->orWhere('title', 'like', "%$q%")->orWhere('contact_name', 'like', "%$q%")->orWhere('phone', 'like', "%$q%")->orWhere('email', 'like', "%$q%")))
            ->withCount('documents')->latest()->paginate(25)->withQueryString();

        $counts = (clone $base)->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status');

        return Inertia::render('admin/applications', [
            'applications' => $rows->through(fn (PartnerApplication $a) => $a->only('id', 'reference', 'type', 'status', 'title', 'contact_name', 'email', 'phone', 'city', 'created_at', 'reviewed_at', 'documents_count') + ['type_label' => $a->typeLabel()]),
            'filters' => ['type' => $type, 'status' => $status, 'q' => $q],
            'counts' => ['open' => (int) (($counts['draft'] ?? 0) + ($counts['in_review'] ?? 0)), 'all' => (int) $counts->sum()] + collect(PartnerApplication::STATUSES)->mapWithKeys(fn ($s) => [$s => (int) ($counts[$s] ?? 0)])->all(),
            'typeCounts' => PartnerApplication::whereIn('status', PartnerApplication::OPEN)->selectRaw('type, count(*) as n')->groupBy('type')->pluck('n', 'type'),
        ]);
    }

    public function show(PartnerApplication $application)
    {
        $application->load('documents', 'reviewer:id,name');
        $linked = $application->approvable;

        return Inertia::render('admin/application-show', [
            'application' => $application->only('id', 'reference', 'type', 'status', 'title', 'contact_name', 'email', 'phone', 'city', 'details', 'notes', 'decision_message', 'reviewed_at', 'approved_at', 'created_at', 'ip', 'history')
                + ['type_label' => $application->typeLabel(), 'reviewer' => $application->reviewer?->name],
            'schema' => Applications::schema($application->type),
            'documents' => $application->documents->map(fn (ApplicationDocument $d) => $d->only('id', 'field', 'label', 'original_name', 'mime', 'size', 'created_at') + ['url' => "/admin/applications/{$application->id}/documents/{$d->id}", 'is_image' => $d->isImage()]),
            'linked' => $linked ? ['type' => class_basename($linked), 'id' => $linked->getKey(), 'name' => $linked->name ?? $linked->user?->name, 'url' => match (true) {
                $linked instanceof Vendor => "/admin/vendors/{$linked->id}",
                $linked instanceof Driver => "/admin/drivers/{$linked->id}",
                default => '/admin/companies',
            }] : null,
            'approve' => [
                'commission' => (float) Setting::get('fees.default_commission_pct'),
                'zones' => \App\Models\Zone::orderBy('name')->get(['id', 'name']),
            ],
        ]);
    }

    /** Start review / ask for more info / reject. */
    public function status(Request $request, PartnerApplication $application)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['draft', 'in_review', 'needs_info', 'rejected'])],
            'message' => [Rule::requiredIf(in_array($request->input('status'), ['needs_info', 'rejected'], true)), 'nullable', 'string', 'max:1000'],
            'notify' => ['boolean'],
        ]);
        abort_if($application->status === 'approved', 422, 'This application is already approved.');

        $application->fill(['status' => $data['status'], 'decision_message' => $data['message'] ?? $application->decision_message, 'reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
        $application->log($data['status'], $request->user(), $data['message'] ?? null);
        $application->save();
        AuditLog::record('application.'.$data['status'], $application, ['reference' => $application->reference]);
        if ($data['notify'] ?? true) {
            $this->notifier->statusChanged($application);
        }

        return back()->with('success', [
            'draft' => 'Moved back to draft.', 'in_review' => 'Marked as in review.',
            'needs_info' => 'Asked the applicant for more information.', 'rejected' => 'Application rejected.',
        ][$data['status']]);
    }

    public function notes(Request $request, PartnerApplication $application)
    {
        $application->update($request->validate(['notes' => ['nullable', 'string', 'max:5000']]));

        return back()->with('success', 'Notes saved.');
    }

    /** Correct a detail before approving (typo in a phone number, wrong city…). */
    public function updateDetails(Request $request, PartnerApplication $application)
    {
        $answers = (array) $request->input('details', []);
        $schema = Applications::schema($application->type);
        $known = collect($schema['steps'])->flatMap(fn ($s) => $s['fields'])->reject(fn ($f) => $f['type'] === 'file')->keyBy('key');
        $details = $application->details;
        foreach ($answers as $k => $v) {
            if ($known->has($k)) {
                $details[$k] = is_string($v) ? Str::limit(trim($v), 1000, '') : $v;
            }
        }
        $keys = Applications::summaryKeys($application->type);
        $application->details = $details;
        foreach ($keys as $col => $key) {
            if (isset($details[$key])) {
                $application->{$col} = $col === 'email' ? strtolower((string) $details[$key]) : $details[$key];
            }
        }
        $application->log('edited', $request->user(), 'Details corrected');
        $application->save();

        return back()->with('success', 'Details updated.');
    }

    public function approve(Request $request, PartnerApplication $application)
    {
        abort_if($application->status === 'approved', 422, 'Already approved.');
        $opts = $request->validate([
            'commission_pct' => ['nullable', 'numeric', 'between:0,60'],
            'store_status' => ['nullable', 'in:pending,active'],
            'zone_id' => ['nullable', 'exists:zones,id'],
            'message' => ['nullable', 'string', 'max:1000'],
        ]);

        [$entity, $link] = DB::transaction(function () use ($application, $opts) {
            [$entity, $link] = match ($application->type) {
                'restaurant' => $this->approveRestaurant($application, $opts),
                'driver' => $this->approveDriver($application, $opts),
                'corporate' => $this->approveCorporate($application),
            };
            $application->fill(['status' => 'approved', 'approved_at' => now(), 'reviewed_at' => now(), 'reviewed_by' => request()->user()->id, 'decision_message' => $opts['message'] ?? null]);
            $application->approvable()->associate($entity);
            $application->log('approved', request()->user(), $opts['message'] ?? null);
            $application->save();

            return [$entity, $link];
        });
        AuditLog::record('application.approved', $application, ['reference' => $application->reference, 'created' => class_basename($entity).' #'.$entity->getKey()]);
        $this->notifier->statusChanged($application, $link);

        $what = ['restaurant' => 'Store', 'driver' => 'Driver', 'corporate' => 'Company account'][$application->type];

        return back()->with('success', "Approved. $what created".($application->type === 'restaurant' && ($opts['store_status'] ?? 'pending') === 'pending' ? ' as Pending: add the menu, then set it Active.' : '.'));
    }

    public function document(PartnerApplication $application, ApplicationDocument $document)
    {
        abort_unless($document->partner_application_id === $application->id && Storage::disk('local')->exists($document->path), 404);

        return Storage::disk('local')->response($document->path, $document->original_name, ['Content-Type' => $document->mime], request()->boolean('download') ? 'attachment' : 'inline');
    }

    public function destroy(PartnerApplication $application)
    {
        abort_unless(request()->user()->isSuperAdmin(), 403);
        abort_if($application->status === 'approved', 422, 'Approved applications are kept as a record.');
        foreach ($application->documents as $d) {
            Storage::disk('local')->delete($d->path);
        }
        $application->delete();
        AuditLog::record('application.deleted', null, ['reference' => $application->reference]);

        return redirect('/admin/applications')->with('success', "Application {$application->reference} deleted.");
    }

    // ── Approval: turn an application into the real thing ───────────────────────────────────

    private function payout(array $d): array
    {
        $method = $d['payout_method'] ?? null;

        return [$method, $method === 'bank'
            ? array_filter(['bank' => $d['bank_name'] ?? null, 'branch' => $d['bank_branch'] ?? null, 'account_name' => $d['bank_account_name'] ?? null, 'account_number' => $d['bank_account_number'] ?? null, 'currency' => $d['bank_currency'] ?? null, 'swift' => $d['bank_swift'] ?? null])
            : array_filter(['phone' => $d['mm_number'] ?? null, 'name' => $d['mm_name'] ?? null])];
    }

    /** Copy an application photo to the public disk (logo, cover). */
    private function publish(PartnerApplication $app, string $field, string $dir): ?string
    {
        $doc = $app->documents->firstWhere('field', $field) ?? $app->documents()->where('field', $field)->first();
        if (! $doc || ! $doc->isImage() || ! Storage::disk('local')->exists($doc->path)) {
            return null;
        }
        $dest = "$dir/".Str::uuid().'.'.pathinfo($doc->path, PATHINFO_EXTENSION);
        Storage::disk('public')->put($dest, Storage::disk('local')->get($doc->path));

        return '/storage/'.$dest;
    }

    private function approveRestaurant(PartnerApplication $app, array $opts): array
    {
        $d = $app->details;
        $email = strtolower((string) ($d['owner_email'] ?? $app->email));
        $existing = User::where('email', $email)->first();
        if ($existing && ($existing->isPlatformStaff() || ($existing->vendor_id && $existing->isStaff()))) {
            throw ValidationException::withMessages(['approve' => "{$email} already belongs to a staff account. Change the owner email in the details first."]);
        }
        [$method, $payout] = $this->payout($d);
        $services = $d['services'] ?? [];
        $kind = in_array($d['kind'] ?? '', ['restaurant', 'grocery', 'market', 'pharmacy'], true) ? $d['kind'] : 'restaurant';

        $vendor = Vendor::create([
            'name' => $app->title,
            'slug' => Str::slug($app->title).'-'.Str::lower(Str::random(4)),
            'cuisine' => $d['cuisine'] ?? null,
            'kind' => $kind,
            'description' => $d['description'] ?? null,
            'city' => $d['city'] ?? $app->city ?? 'Harare',
            'address' => trim(($d['address'] ?? '').(isset($d['suburb']) ? ', '.$d['suburb'] : ''), ', '),
            'phone' => $d['business_phone'] ?? $d['owner_phone'] ?? null,
            'email' => $d['business_email'] ?? $email,
            'status' => $opts['store_status'] ?? 'pending',
            'commission_pct' => $opts['commission_pct'] ?? Setting::get('fees.default_commission_pct'),
            'prep_minutes' => (int) ($d['prep_minutes'] ?? 20),
            'price_level' => (int) ($d['price_level'] ?? 2),
            'offers_delivery' => in_array('delivery', $services, true),
            'offers_pickup' => in_array('pickup', $services, true),
            'accepts_scheduled' => in_array('scheduled', $services, true),
            'accepts_catering' => in_array('catering', $services, true),
            'zone_id' => $opts['zone_id'] ?? null,
            'logo_path' => $this->publish($app, 'logo', 'vendors'),
            'cover_path' => $this->publish($app, 'cover', 'vendors'),
            'payout_method' => $method,
            'payout_details' => $payout,
            'legal' => array_filter(['legal_name' => $d['legal_name'] ?? null, 'registration_number' => $d['registration_number'] ?? null, 'tin' => $d['tin'] ?? null, 'vat_number' => $d['vat_number'] ?? null, 'licence_number' => $d['licence_number'] ?? null, 'owner_name' => $d['owner_name'] ?? null, 'owner_id_number' => $d['owner_id_number'] ?? null, 'application' => $app->reference]),
        ]);

        $days = ['sun' => 0, 'mon' => 1, 'tue' => 2, 'wed' => 3, 'thu' => 4, 'fri' => 5, 'sat' => 6];
        foreach ($d['open_days'] ?? [] as $day) {
            if (isset($days[$day], $d['opens_at'], $d['closes_at'])) {
                $vendor->hours()->create(['weekday' => $days[$day], 'opens_at' => $d['opens_at'], 'closes_at' => $d['closes_at']]);
            }
        }

        $user = $existing ?? new User(['email' => $email, 'password' => Str::password(24)]);
        $user->fill(['name' => $d['owner_name'] ?? $app->contact_name, 'role' => 'vendor_manager', 'vendor_id' => $vendor->id]);
        if (! $user->phone && ($phone = $d['owner_phone'] ?? null) && ! User::where('phone', $phone)->exists()) {
            $user->phone = $phone;
        }
        $user->save();
        $link = url(route('password.reset', ['token' => Password::broker()->createToken($user), 'email' => $user->email], false));

        return [$vendor, $link];
    }

    private function approveDriver(PartnerApplication $app, array $opts): array
    {
        $d = $app->details;
        $phone = $d['phone'] ?? $app->phone;
        $user = User::where('phone', $phone)->first();
        if ($user?->isStaff()) {
            throw ValidationException::withMessages(['approve' => "{$phone} belongs to a staff account. Staff accounts can’t drive."]);
        }
        $user ??= new User(['phone' => $phone]);
        $user->name = $d['full_name'] ?? $app->title;
        $user->role = 'driver';
        if (! $user->email && ($email = $d['email'] ?? null) && ! User::where('email', strtolower($email))->exists()) {
            $user->email = strtolower($email);
        }
        $user->save();

        [$method, $payout] = $this->payout($d);
        $driver = Driver::updateOrCreate(['user_id' => $user->id], [
            'status' => 'approved', 'approved_at' => now(),
            'vehicle_type' => $d['vehicle_type'] ?? 'motorbike',
            'vehicle_make' => $d['vehicle_make'] ?? null,
            'vehicle_plate' => isset($d['vehicle_plate']) ? strtoupper($d['vehicle_plate']) : null,
            'national_id' => $d['national_id'] ?? null,
            'licence_number' => $d['licence_number'] ?? null,
            'zone_id' => $opts['zone_id'] ?? null,
            'payout_method' => $method,
            'payout_details' => $payout,
        ]);

        // Documents carry over to the driver's profile (already checked as part of this review).
        $map = ['selfie' => 'selfie', 'national_id_doc' => 'national_id', 'licence_doc' => 'licence', 'vehicle_registration_doc' => 'vehicle_registration', 'insurance_doc' => 'insurance', 'police_clearance_doc' => 'police_clearance'];
        foreach ($app->documents()->whereIn('field', array_keys($map))->get() as $doc) {
            $dest = "drivers/{$driver->id}/".basename($doc->path);
            if (Storage::disk('local')->exists($doc->path)) {
                Storage::disk('local')->copy($doc->path, $dest);
                DriverDocument::create(['driver_id' => $driver->id, 'type' => $map[$doc->field], 'path' => $dest, 'status' => 'approved', 'note' => "From application {$app->reference}", 'expires_on' => $map[$doc->field] === 'licence' ? ($d['licence_expiry'] ?? null) : null]);
            }
        }

        return [$driver, Setting::get('apps.android_store_url') ?: null];
    }

    private function approveCorporate(PartnerApplication $app): array
    {
        $d = $app->details;
        $rate = ExchangeRate::current();
        $company = Company::create([
            'name' => $app->title,
            'billing_email' => $d['billing_email'] ?? $app->email,
            'billing_contact' => $d['billing_contact'] ?? $app->contact_name,
            'vat_number' => $d['vat_number'] ?? null,
            'monthly_budget_zig' => isset($d['monthly_budget_usd']) ? round($d['monthly_budget_usd'] * $rate, 2) : null,
            'daily_allowance_zig' => isset($d['daily_allowance_usd']) ? round($d['daily_allowance_usd'] * $rate, 2) : null,
            'allowed_days' => isset($d['order_days']) ? array_map('intval', $d['order_days']) : null,
            'payment_terms_days' => ['invoice_30' => 30, 'invoice_14' => 14, 'prepaid' => 0][$d['payment_terms'] ?? 'invoice_30'] ?? 30,
            'is_active' => true,
            'details' => array_filter(['industry' => $d['industry'] ?? null, 'employees' => $d['employees'] ?? null, 'registration_number' => $d['registration_number'] ?? null, 'address' => $d['address'] ?? null, 'city' => $d['city'] ?? null, 'website' => $d['website'] ?? null, 'billing_method' => $d['billing_method'] ?? null, 'billing_bank' => $d['billing_bank'] ?? null, 'billing_mm_number' => $d['billing_mm_number'] ?? null, 'uses' => $d['uses'] ?? null, 'application' => $app->reference]),
        ]);
        if ($phone = $d['contact_phone'] ?? $app->phone) {
            $company->members()->create(['phone' => $phone, 'name' => $app->contact_name, 'role' => 'admin', 'user_id' => User::where('phone', $phone)->value('id')]);
        }

        return [$company, null];
    }
}

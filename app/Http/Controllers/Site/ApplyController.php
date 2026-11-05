<?php

namespace App\Http\Controllers\Site;

use App\Http\Controllers\Controller;
use App\Models\PartnerApplication;
use App\Models\Setting;
use App\Services\ApplicationNotifier;
use App\Support\Applications;
use App\Support\Phone;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

/**
 * Website sign-up: restaurants & shops (/partners/apply), drivers (/drive/apply) and corporate
 * accounts (/business/apply). Files upload one by one as they are picked (so a slow connection or a
 * small PHP upload limit never loses the whole form); the final submit creates a draft application.
 */
class ApplyController extends Controller
{
    private const SEO = [
        'restaurant' => ['List your restaurant or shop on Zvino', 'Sign up online in 10 minutes: menu, photos, documents and payout details. Weekly payouts to EcoCash or your bank.'],
        'driver' => ['Apply to drive with Zvino', 'Apply online in minutes. Weekly payouts to EcoCash, keep 100% of tips.'],
        'corporate' => ['Open a Zvino corporate account', 'Staff lunches, meetings and client gifts on one monthly invoice.'],
    ];

    public function show(string $type)
    {
        abort_unless(in_array($type, Applications::types(), true), 404);
        $closed = $type === 'driver' && ! Setting::get('drivers.applications_open');

        return Inertia::render('site/apply', [
            'seo' => ['title' => self::SEO[$type][0].' | Zvino', 'description' => self::SEO[$type][1], 'image' => null, 'jsonld' => null],
            'schema' => Applications::schema($type),
            'closed' => $closed,
        ]);
    }

    public function business()
    {
        return Inertia::render('site/business', [
            'seo' => ['title' => 'Zvino for Business: staff meals & corporate accounts | Zvino', 'description' => 'Staff lunches, meeting catering and client gifts on one monthly invoice, with budgets and allowances you control.', 'image' => null, 'jsonld' => null],
        ]);
    }

    /** One file at a time; returns a token the final submit hands back. */
    public function upload(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,heic,pdf', 'max:10240'],
        ], [
            'file.max' => 'That file is bigger than 10 MB. Try a photo instead of a scan, or a smaller PDF.',
            'file.mimes' => 'Please upload a photo (JPG or PNG) or a PDF.',
            'file.uploaded' => 'The upload failed. The file may be too big for this connection; try a smaller photo.',
        ]);
        $file = $request->file('file');
        $path = $file->storeAs('applications/tmp', Str::uuid().'.'.strtolower($file->getClientOriginalExtension() ?: $file->extension()), 'local');

        return response()->json([
            'token' => Crypt::encryptString(json_encode(['path' => $path, 'name' => Str::limit($file->getClientOriginalName(), 120, ''), 'mime' => $file->getMimeType(), 'size' => $file->getSize()])),
            'name' => $file->getClientOriginalName(),
            'size' => $file->getSize(),
            'mime' => $file->getMimeType(),
        ]);
    }

    public function submit(Request $request, string $type, ApplicationNotifier $notifier)
    {
        abort_unless(in_array($type, Applications::types(), true), 404);
        abort_if($type === 'driver' && ! Setting::get('drivers.applications_open'), 422, 'Driver applications are closed right now.');
        $schema = Applications::schema($type);
        $answers = (array) $request->input('answers', []);
        $request->validate(Applications::rules($schema, $answers) + ['accept_terms' => ['accepted']], ['accept_terms.accepted' => 'Please tick the box to confirm your details and accept the terms.'], Applications::attributes($schema));

        // Keep only known, visible fields; tidy phone numbers; separate the files.
        $details = [];
        $files = [];
        foreach ($schema['steps'] as $step) {
            foreach ($step['fields'] as $f) {
                if (! Applications::visible($f, $answers) || ! array_key_exists($f['key'], $answers) || $answers[$f['key']] === null || $answers[$f['key']] === '') {
                    continue;
                }
                $v = $answers[$f['key']];
                if ($f['type'] === 'file') {
                    $files[$f['key']] = ['label' => $f['label'], 'tokens' => (array) $v];

                    continue;
                }
                $details[$f['key']] = match ($f['type']) {
                    'tel' => Phone::normalise($v),
                    'number' => is_numeric($v) ? $v + 0 : null,
                    'bool' => (bool) $v,
                    'chips' => array_values((array) $v),
                    default => is_string($v) ? trim($v) : $v,
                };
            }
        }
        $uploads = $this->resolveUploads($files);

        $keys = Applications::summaryKeys($type);
        $application = DB::transaction(function () use ($type, $details, $keys, $uploads, $request) {
            $app = new PartnerApplication([
                'reference' => PartnerApplication::newReference($type),
                'type' => $type,
                'status' => 'draft',
                'title' => $details[$keys['title']] ?? 'Application',
                'contact_name' => $details[$keys['contact_name']] ?? '',
                'email' => isset($details[$keys['email']]) ? strtolower($details[$keys['email']]) : null,
                'phone' => $details[$keys['phone']] ?? null,
                'city' => $details[$keys['city']] ?? null,
                'details' => $details,
                'ip' => $request->ip(),
                'user_agent' => Str::limit((string) $request->userAgent(), 250, ''),
            ]);
            $app->log('submitted', null, 'Submitted from the website');
            $app->save();

            foreach ($uploads as $field => $u) {
                foreach ($u['files'] as $i => $meta) {
                    $ext = pathinfo($meta['path'], PATHINFO_EXTENSION);
                    $dest = "applications/{$app->reference}/{$field}".($i ? "-$i" : '').'-'.Str::lower(Str::random(6)).".$ext";
                    Storage::disk('local')->move($meta['path'], $dest);
                    $app->documents()->create(['field' => $field, 'label' => $u['label'], 'path' => $dest, 'original_name' => $meta['name'], 'mime' => $meta['mime'] ?: 'application/octet-stream', 'size' => (int) $meta['size']]);
                }
            }

            return $app;
        });

        $notifier->submitted($application);

        return redirect()->route('site.apply.done', $application->reference);
    }

    public function done(string $reference)
    {
        $app = PartnerApplication::where('reference', $reference)->firstOrFail();

        return Inertia::render('site/apply-done', [
            'seo' => ['title' => 'Application received | Zvino', 'description' => null, 'image' => null, 'jsonld' => null],
            'application' => ['reference' => $app->reference, 'type' => $app->type, 'label' => $app->typeLabel(), 'title' => $app->title, 'email' => $app->email ? preg_replace('/(?<=.).(?=[^@]*@)/', '•', $app->email) : null, 'submitted_at' => $app->created_at],
        ]);
    }

    /** Decrypt upload tokens; a missing or tampered file fails validation on that field. */
    private function resolveUploads(array $files): array
    {
        $out = [];
        foreach ($files as $field => $f) {
            foreach ($f['tokens'] as $token) {
                try {
                    $meta = json_decode(Crypt::decryptString((string) $token), true, flags: JSON_THROW_ON_ERROR);
                } catch (\Throwable) {
                    throw ValidationException::withMessages(["answers.$field" => 'Please upload this file again.']);
                }
                if (! str_starts_with($meta['path'] ?? '', 'applications/tmp/') || ! Storage::disk('local')->exists($meta['path'])) {
                    throw ValidationException::withMessages(["answers.$field" => 'That upload expired. Please upload the file again.']);
                }
                $out[$field]['label'] = $f['label'];
                $out[$field]['files'][] = $meta;
            }
        }

        return $out;
    }
}

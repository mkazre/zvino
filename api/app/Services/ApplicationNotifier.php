<?php

namespace App\Services;

use App\Mail\ZvinoMail;
use App\Models\AppNotification;
use App\Models\PartnerApplication;
use App\Models\Setting;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Support\Facades\Mail;

/**
 * Emails and admin notifications for website applications. Mail failures never block the
 * applicant or the reviewer: they are logged and the in-app notification still lands.
 */
class ApplicationNotifier
{
    public function submitted(PartnerApplication $app): void
    {
        $what = strtolower($app->typeLabel());
        $this->mail($app->email, new ZvinoMail(
            subjectLine: "We’ve received your application ({$app->reference})",
            heading: "Thanks, {$this->first($app->contact_name)}! Your application is in.",
            lines: [
                "We’ve received your {$what} application for {$app->title}. Our team checks every application by hand, usually within 1–2 working days.",
                'We’ll email you as soon as there’s news. If we need anything else we’ll contact you on '.($app->phone ?: 'the number you gave us').'.',
            ],
            table: ['Reference' => $app->reference, 'Application' => $app->typeLabel(), 'Name' => $app->title, 'Submitted' => $app->created_at->timezone('Africa/Harare')->format('j M Y, H:i')],
            footnote: 'Keep your reference number handy if you contact us about this application.',
        ));

        $url = url("/admin/applications/{$app->id}");
        foreach ($this->reviewers() as $staff) {
            AppNotification::create([
                'user_id' => $staff->id, 'type' => 'application',
                'title' => "New {$what} application",
                'body' => trim("{$app->title}".($app->city ? " · {$app->city}" : '')),
                'data' => ['url' => "/admin/applications/{$app->id}", 'reference' => $app->reference],
            ]);
        }
        $to = $this->reviewers()->pluck('email')->filter()->push(Setting::get('general.support_email'))->filter()->unique()->values()->all();
        $this->mail($to, new ZvinoMail(
            subjectLine: "New {$what} application: {$app->title} ({$app->reference})",
            heading: "New {$what} application",
            lines: ["{$app->title} applied on the website. It’s waiting in Applications as a draft."],
            table: array_filter(['Reference' => $app->reference, 'Name' => $app->title, 'Contact' => $app->contact_name, 'Phone' => $app->phone, 'Email' => $app->email, 'City' => $app->city, 'Documents' => (string) $app->documents()->count()]),
            buttonLabel: 'Review application', buttonUrl: $url,
        ));
    }

    public function statusChanged(PartnerApplication $app, ?string $extra = null): void
    {
        $name = $this->first($app->contact_name);
        $mail = match ($app->status) {
            'in_review' => new ZvinoMail("Your Zvino application is being reviewed ({$app->reference})", "We’re reviewing your application, {$name}",
                ["A member of our team is now checking {$app->title}. We’ll be in touch soon."], ['Reference' => $app->reference]),
            'needs_info' => new ZvinoMail("We need a little more information ({$app->reference})", "One more thing, {$name}",
                ['We’re almost there with your application for '.$app->title.'. Please send us the following:', $app->decision_message ?: 'Some details were missing.', 'Reply to this email or WhatsApp us with your reference number.'], ['Reference' => $app->reference]),
            'rejected' => new ZvinoMail("Update on your Zvino application ({$app->reference})", "Thank you for applying, {$name}",
                ["Unfortunately we can’t approve the application for {$app->title} right now.", ...array_filter([$app->decision_message]), 'You’re welcome to apply again later.'], ['Reference' => $app->reference]),
            'approved' => $this->approvedMail($app, $extra),
            default => null,
        };
        if ($mail) {
            $this->mail($app->email, $mail);
        }
    }

    private function approvedMail(PartnerApplication $app, ?string $link): ZvinoMail
    {
        $name = $this->first($app->contact_name);

        return match ($app->type) {
            'restaurant' => new ZvinoMail("You’re approved! Welcome to Zvino ({$app->reference})", "Welcome to Zvino, {$name}! 🎉",
                ["{$app->title} is approved. We’re setting up your menu now and will let you know when you’re live.", 'Set a password for your merchant account, then sign in to the Zvino Merchant app or the website dashboard with this email address.'],
                ['Reference' => $app->reference, 'Merchant login' => (string) $app->email], $link ? 'Set my password' : null, $link,
                'The password link expires in 60 minutes. You can always use “Forgot password” on the sign-in page.'),
            'driver' => new ZvinoMail("You’re approved to drive with Zvino ({$app->reference})", "You’re approved, {$name}! 🛵",
                ['Download the Zvino Driver app and sign in with your mobile number '.($app->phone ?? '').'. Go online to start receiving deliveries.'],
                ['Reference' => $app->reference], ...($link ? ['Get the Driver app', $link] : [null, null])),
            default => new ZvinoMail("Your Zvino corporate account is open ({$app->reference})", "Your corporate account is ready, {$name}",
                ["{$app->title} now has a Zvino corporate account. Staff sign in to the Zvino app or website with their mobile number and order on the company account.", 'Reply to this email to add staff, change budgets or ask about invoices.'],
                ['Reference' => $app->reference, 'Account admin' => (string) $app->phone]),
        };
    }

    /** Staff who can review applications. */
    public function reviewers()
    {
        return User::whereIn('role', User::STAFF_ROLES)->get()->filter(fn (User $u) => Permissions::allows($u, 'applications.review'))->values();
    }

    private function first(string $name): string
    {
        return explode(' ', trim($name))[0] ?: 'there';
    }

    private function mail(string|array|null $to, ZvinoMail $mail): void
    {
        if (! $to || $to === []) {
            return;
        }
        try {
            Mail::to($to)->send($mail);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}

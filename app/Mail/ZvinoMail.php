<?php

namespace App\Mail;

use App\Models\Setting;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** A simple branded email: heading, paragraphs, an optional key/value table and one button. */
class ZvinoMail extends Mailable
{
    use Queueable;

    /**
     * @param  string[]  $lines
     * @param  array<string, string>  $table
     */
    public function __construct(
        public string $subjectLine,
        public string $heading,
        public array $lines = [],
        public array $table = [],
        public ?string $buttonLabel = null,
        public ?string $buttonUrl = null,
        public ?string $footnote = null,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(view: 'mail.zvino', with: [
            'brand' => Setting::get('general.business_name') ?: 'Zvino',
            'logo' => url('/brand/logo.png'),
            'support' => Setting::get('general.support_email'),
        ]);
    }
}

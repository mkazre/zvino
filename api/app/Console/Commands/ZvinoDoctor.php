<?php

namespace App\Console\Commands;

use App\Models\Page;
use App\Models\Setting;
use App\Models\User;
use App\Models\Zone;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/** Pre-launch checklist: `php artisan zvino:doctor`. Exit code 1 if anything blocks go-live. */
class ZvinoDoctor extends Command
{
    protected $signature = 'zvino:doctor';
    protected $description = 'Check that Zvino is safe and ready for production';

    public function handle(): int
    {
        $checks = [
            // [blocker?, ok?, label, how to fix]
            [true, ! config('app.debug'), 'APP_DEBUG is off', 'Set APP_DEBUG=false in .env'],
            [true, app()->isProduction(), 'APP_ENV=production', 'Set APP_ENV=production (also disables the 123456 test OTP)'],
            [true, str_starts_with(config('app.url'), 'https://'), 'APP_URL uses https', 'Set APP_URL=https://your-domain'],
            [true, DB::getDriverName() !== 'sqlite', 'Database is MySQL', 'Use the cPanel MySQL database (DB_CONNECTION=mysql)'],
            [true, ! config('zvino.paynow.fake') && config('zvino.paynow.integration_id') && config('zvino.paynow.integration_key'), 'Real Paynow payments', 'Set PAYNOW_FAKE=false, PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY'],
            [true, Setting::get('notifications.sms_provider') !== 'log', 'SMS provider configured', 'Settings → Notifications → SMS provider (login codes depend on it)'],
            [true, ! $this->defaultPasswordsInUse(), 'No demo staff passwords', 'Change or delete the seeded @zvino.co.zw staff accounts (password "password")'],
            [true, Zone::where('is_active', true)->exists(), 'At least one delivery zone', 'Admin → Zones & fees'],
            [false, config('broadcasting.default') === 'pusher' && config('broadcasting.connections.pusher.key'), 'Pusher live updates', 'Set BROADCAST_CONNECTION=pusher and PUSHER_* keys (otherwise apps poll)'],
            [false, (bool) config('sentry.dsn'), 'Error monitoring (Sentry)', 'Set SENTRY_LARAVEL_DSN in .env (and EXPO_PUBLIC_SENTRY_DSN for app builds)'],
            [false, (bool) Setting::get('integrations.google_maps_key'), 'Google Maps key', 'Settings → Integrations (address geocoding & maps)'],
            [false, (bool) Setting::get('branding.logo'), 'Logo uploaded', 'Settings → Branding'],
            [false, ! Page::where('body', 'like', '%content to be supplied%')->exists(), 'Legal pages written', 'Settings → Legal & content pages (terms, privacy…)'],
            [false, config('mail.default') !== 'log', 'Email configured', 'Set MAIL_* in .env for receipts and password resets'],
            [false, Cache::get('zvino.scheduler_heartbeat') && now()->diffInMinutes(Cache::get('zvino.scheduler_heartbeat')) < 3, 'Cron scheduler running', 'Add the cPanel cron: * * * * * php artisan schedule:run'],
            [false, file_exists(public_path('storage')) || config('filesystems.disks.public.root') !== storage_path('app/public'), 'Storage link', 'php artisan storage:link'],
            [false, ($pdf = $this->pdfCheck()) === true, 'PDF receipts', is_string($pdf) ? 'PDF failed: '.$pdf : ''],
        ];

        $blocking = 0;
        foreach ($checks as [$blocker, $ok, $label, $fix]) {
            if ($ok) {
                $this->line("  <fg=green>✓</> {$label}");
            } else {
                $blocking += $blocker ? 1 : 0;
                $this->line('  '.($blocker ? '<fg=red>✗</>' : '<fg=yellow>!</>')." {$label}  <fg=gray>→ {$fix}</>");
            }
        }

        $this->newLine();
        if ($blocking) {
            $this->error("{$blocking} blocker(s) before go-live.");

            return self::FAILURE;
        }
        $this->info('Ready for launch 🚀');

        return self::SUCCESS;
    }

    private function defaultPasswordsInUse(): bool
    {
        return User::where('email', 'like', '%@zvino.co.zw')->whereNotNull('password')->get()
            ->contains(fn ($u) => Hash::check('password', $u->password));
    }

    /** Render a tiny PDF exactly like the receipts do; returns true or the error message. */
    private function pdfCheck(): bool|string
    {
        try {
            $dir = storage_path('app/dompdf');
            if (! is_dir($dir)) {
                @mkdir($dir, 0755, true);
            }
            $missing = array_filter(['gd', 'dom', 'mbstring'], fn ($e) => ! extension_loaded($e));
            \Barryvdh\DomPDF\Facade\Pdf::loadHTML('<p>Zvino PDF check ’ ZiG</p>')
                ->setOption(['isFontSubsettingEnabled' => true, 'defaultFont' => 'DejaVu Sans', 'fontDir' => $dir, 'fontCache' => $dir, 'tempDir' => $dir])
                ->output();

            return $missing ? 'missing PHP extension(s): '.implode(', ', $missing) : true;
        } catch (\Throwable $e) {
            return class_basename($e).': '.$e->getMessage();
        }
    }
}

<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Symfony\Component\Process\Process;

/**
 * Daily database backup to storage/app/backups (kept 14 days). Scheduled in routes/console.php.
 * Also copy these off the server (cPanel → Backup, or a Google Drive/S3 sync) for disaster recovery.
 */
class ZvinoBackup extends Command
{
    protected $signature = 'zvino:backup {--keep=14}';
    protected $description = 'Back up the database';

    public function handle(): int
    {
        $dir = storage_path('app/backups');
        File::ensureDirectoryExists($dir);
        $stamp = now()->format('Y-m-d_His');
        $db = config('database.connections.'.config('database.default'));

        if (config('database.default') === 'sqlite') {
            $file = "$dir/zvino-$stamp.sqlite";
            File::copy($db['database'], $file);
        } else {
            $file = "$dir/zvino-$stamp.sql.gz";
            $cmd = sprintf('mysqldump --single-transaction --quick -h%s -P%s -u%s %s | gzip > %s',
                escapeshellarg($db['host']), escapeshellarg((string) $db['port']), escapeshellarg($db['username']), escapeshellarg($db['database']), escapeshellarg($file));
            $process = Process::fromShellCommandline($cmd, null, ['MYSQL_PWD' => $db['password']], null, 600);
            $process->run();
            if (! $process->isSuccessful() || filesize($file) < 100) {
                $this->error('Backup failed: '.$process->getErrorOutput());

                return self::FAILURE;
            }
        }

        // Retention
        collect(File::files($dir))->sortByDesc(fn ($f) => $f->getMTime())->slice((int) $this->option('keep'))->each(fn ($f) => File::delete($f->getPathname()));
        $this->info('Backup saved: '.basename($file).' ('.round(filesize($file) / 1024).' KB)');

        return self::SUCCESS;
    }
}

<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Validation\Rules\Password;

/** Create the first super admin on a fresh production install (no demo seed). */
class ZvinoAdmin extends Command
{
    protected $signature = 'zvino:admin {email} {--name=Zvino Admin} {--password= : Non-interactive (deploy scripts); otherwise you are prompted}';
    protected $description = 'Create (or reset) a super admin account';

    public function handle(): int
    {
        $password = $this->option('password') ?: $this->secret('Password (min 10 characters, mixed case + numbers)');
        $v = validator(['password' => $password, 'email' => $this->argument('email')], [
            'email' => ['required', 'email'],
            'password' => ['required', Password::min(10)->mixedCase()->numbers()],
        ]);
        if ($v->fails()) {
            $this->error($v->errors()->first());

            return self::FAILURE;
        }

        $user = User::updateOrCreate(['email' => $this->argument('email')], ['name' => $this->option('name'), 'password' => $password, 'role' => 'super_admin', 'banned_at' => null]);
        Setting::put('general.platform_mode', Setting::get('general.platform_mode'));
        $this->info("Super admin ready: {$user->email}. Sign in at ".url('/login'));

        return self::SUCCESS;
    }
}

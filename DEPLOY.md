# Zvino: going live on zvino.online (cPanel + GitHub)

One Laravel app serves the **website** (`https://zvino.online`), the **admin** (`/dashboard`, `/admin/*`)
and the **API** for the three apps (`/api/*`). It needs no long-running processes, only a 1-minute cron.

## How deployment works
```
GitHub main ──(GitHub Action: tests + build)──▶ branch "deploy" ──(cPanel Git: Update + Deploy)──▶ ~/zvino-app
                                                                                           ~/public_html → ~/zvino-app/public
```
- Your host doesn't need Node or Composer: the Action builds `vendor/` and `public/build/` into the `deploy` branch.
- `Deploy HEAD Commit` in cPanel runs `deploy/cpanel-deploy.sh`: copies the code to `~/zvino-app`, runs migrations,
  links uploads, caches config, and (first time only) points `public_html` at the app. Your `.env`, uploaded photos
  and database are never overwritten. Log: `~/zvino-deploy.log`.

## One-time setup (about 20 minutes)

### 1. PHP version
cPanel → **MultiPHP Manager** → set `zvino.online` to **PHP 8.3** (8.2 minimum).
cPanel → **Select PHP Version / PHP Extensions** (if shown): make sure `pdo_mysql`, `mbstring`, `gd`, `intl`,
`fileinfo`, `zip`, `bcmath` are on. In **MultiPHP INI Editor** set `upload_max_filesize` and `post_max_size` to 10M.

### 2. Database
cPanel → **MySQL Database Wizard**: database `zvino`, user `zvino`, a strong password, **All privileges**.
cPanel adds the account prefix, so they become `zvinoonl_zvino` / `zvinoonl_zvino`.

### 3. Let cPanel read the private GitHub repo
1. cPanel → **SSH Access → Manage SSH Keys → Generate a New Key** (no passphrase), then **Manage → Authorize**.
2. **View/Download** the public key (`id_rsa.pub`) and copy it.
3. GitHub → `mkazre/zvino` → **Settings → Deploy keys → Add deploy key** → paste, leave "write access" off.

### 4. Clone the deploy branch
cPanel → **Git Version Control → Create**
- Clone URL: `git@github.com:mkazre/zvino.git`
- Repository Path: `/home/zvinoonl/repositories/zvino`
- Name: `zvino`

Then **Manage → Basic Information**: set **Checked-Out Branch** to `deploy`.

### 5. First deploy (creates your settings file)
**Manage → Pull or Deploy → Update from Remote → Deploy HEAD Commit.**
The first run stops on purpose after creating `~/zvino-app/.env`. Open it in **File Manager** (show hidden files) and set:
- `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` from step 2
- `ZVINO_ADMIN_EMAIL` and `ZVINO_ADMIN_PASSWORD` (10+ characters, upper + lower case and a number)
- keep `ZVINO_SEED_DEMO=true` if you want the demo stores to test with

Save, then **Deploy HEAD Commit** again. The site is live at https://zvino.online and the admin at
https://zvino.online/login. Afterwards delete `ZVINO_ADMIN_PASSWORD` from `.env`.

### 6. Cron (cPanel → Cron Jobs → Add, "Once Per Minute")
```
/opt/cpanel/ea-php83/root/usr/bin/php /home/zvinoonl/zvino-app/artisan schedule:run >> /dev/null 2>&1
```
(Use `ea-php82` if that's the version you picked.) This runs the order engine (scheduled orders, auto-cancel,
driver dispatch), queued jobs, campaigns, payouts, monthly company invoices and a nightly database backup.

## Every update after that
1. Push to `main` on GitHub (or merge a pull request). The **Build cPanel deploy branch** Action runs the tests and
   refreshes `deploy` (GitHub → Actions shows progress, about 4 minutes).
2. cPanel → Git Version Control → **Manage → Pull or Deploy → Update from Remote → Deploy HEAD Commit**.

## Before the real launch
- `APP_ENV=production` in `.env` (turns off demo payments and the `123456` test login code). For real customers
  also start from a clean database (remove `ZVINO_SEED_DEMO` and empty the database **before** the first live deploy).
- Paynow keys (`PAYNOW_*`, `PAYNOW_FAKE=false`); result URL in Paynow: `https://zvino.online/api/payments/webhook/paynow`.
- SMS provider in Admin → Settings → Notifications (login codes depend on it).
- Email: create `orders@zvino.online` in cPanel → Email Accounts and set `MAIL_MAILER=smtp` + `MAIL_PASSWORD`.
- Optional: Pusher (`BROADCAST_CONNECTION=pusher`, `PUSHER_*`) for instant updates; Sentry (`SENTRY_LARAVEL_DSN`).
- Check readiness any time: the last lines of `~/zvino-deploy.log` show `zvino:doctor` (green = ready).

## Mobile apps
`mobile/eas.json` profiles `customer`, `driver`, `merchant` (store builds) and `*-online` (installable test APKs)
all talk to `https://zvino.online`. Build with `npx eas-cli build -p android --profile customer-online`.

## Speed
- Measured locally (code only): API endpoints 2–7 ms, website pages 14–21 ms.
- Load test from your PC once live: `php artisan zvino:benchmark --url=https://zvino.online -c 20 -r 300`.

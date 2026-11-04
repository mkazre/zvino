# Zvino: go-live runbook (cPanel shared hosting)

One Laravel app serves the **website** (`/`), the **admin** (`/dashboard`, `/admin/*`) and the
**API** for the three mobile apps (`/api/*`). It needs no long-running processes, only a 1-minute cron.

## 1. Accounts you need first
| Service | Why | Where it goes |
|---|---|---|
| Paynow merchant integration | EcoCash, OneMoney, InnBucks, Visa/Mastercard | `.env` `PAYNOW_*` |
| SMS provider (Africa's Talking / Twilio / BulkSMS) | Login codes, SMS tracking | `.env` keys + Settings → Notifications |
| Pusher (free tier OK) | Instant live tracking & kitchen screens | `.env` `PUSHER_*` |
| Google Maps Platform | Address search, maps, zones | Settings → Integrations |
| Expo account + Apple ($99/yr) + Google Play ($25) | Publish the 3 apps | `mobile/README.md` |
| Domain + SSL (cPanel AutoSSL) | `https://zvino.co.zw` | cPanel |

## 2. Build & upload
```bash
# on your PC
npm ci && npm run build
composer install --no-dev --optimize-autoloader
```
Upload the whole folder to `/home/USER/zvino` and point the domain's document root at
`/home/USER/zvino/public` (or symlink `public_html → zvino/public`). `public/.user.ini` already raises
upload limits for photos.

## 3. Configure `.env`
```
APP_ENV=production
APP_DEBUG=false
APP_URL=https://zvino.co.zw
DB_CONNECTION=mysql   DB_DATABASE=…   DB_USERNAME=…   DB_PASSWORD=…
QUEUE_CONNECTION=database
BROADCAST_CONNECTION=pusher   PUSHER_APP_ID=…   PUSHER_APP_KEY=…   PUSHER_APP_SECRET=…   PUSHER_APP_CLUSTER=…
PAYNOW_FAKE=false   PAYNOW_INTEGRATION_ID=…   PAYNOW_INTEGRATION_KEY=…   PAYNOW_MERCHANT_EMAIL=…
AFRICASTALKING_USERNAME=…   AFRICASTALKING_KEY=…      (or TWILIO_* / BULKSMSWEB_*)
MAIL_MAILER=smtp   MAIL_HOST=…   MAIL_USERNAME=…   MAIL_PASSWORD=…   MAIL_FROM_ADDRESS=orders@zvino.co.zw
SENTRY_LARAVEL_DSN=…        (sentry.io → new Laravel project; free tier is enough to start)
```

## 4. First run (cPanel Terminal / SSH)
```bash
php artisan key:generate
php artisan migrate --force
php artisan storage:link
php artisan zvino:admin you@zvino.co.zw --name="Your Name"   # first super admin (no demo data)
php artisan optimize
```
Never run `db:seed` in production; it creates demo stores and logins with the password "password".
(For a demo/staging site: `php artisan db:seed && php artisan db:seed --class=DemoActivitySeeder`.)

## 5. Cron (cPanel → Cron Jobs, every minute)
```
* * * * * cd /home/USER/zvino && php artisan schedule:run >> /dev/null 2>&1
```
This runs: the order engine (scheduled orders, auto-cancel, driver dispatch), queued jobs, campaigns,
payouts (06:00), and a **database backup** (02:30, kept 14 days in `storage/app/backups`; also
download or sync these off-server weekly).

## 6. Paynow
Set the result URL in your Paynow integration to `https://zvino.co.zw/api/payments/webhook/paynow`.
Webhooks are hash-verified with your integration key.

## 7. In the admin
Settings: business details, branding/logo, currency & VAT, fees, payments, SMS provider, Google Maps keys,
legal pages, message templates. Then add **zones**, **stores** (with menus, hours, staff logins) and
approve **drivers** as they apply from the Driver app.

## 8. Check readiness
```bash
php artisan zvino:doctor
```
Green = ready. Red items block launch (debug mode, test payments, demo passwords, no SMS…);
yellow items are strongly recommended.

## 9. Speed & load test
- cPanel → *Select PHP Version*: PHP 8.2+, enable **opcache**, `memory_limit` 256M.
- After every deploy: `php artisan optimize` (config, routes, views cached).
- Smoke load test from your PC: `php artisan zvino:benchmark --url=https://zvino.co.zw -c 20 -r 300`
  (target: no errors, p95 under 1.5 s). Sustained lunch-rush test on **staging** with k6:
  `k6 run -e BASE=https://staging.zvino.co.zw -e TOKEN=… loadtest/k6.js`.
- Measured locally (code only, Laravel booted): API endpoints 2–7 ms, website pages 14–21 ms.

## 10. Live updates & monitoring
- **Pusher**: with `BROADCAST_CONNECTION=pusher` the admin, kitchen screen and all three apps update instantly
  (order status, driver on the map, new job offers, new store orders). Without it everything still works by polling.
- **Sentry**: server errors report when `SENTRY_LARAVEL_DSN` is set. For the apps set `EXPO_PUBLIC_SENTRY_DSN`
  (and `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` for readable stack traces) in EAS secrets.

## 11. Mobile apps
See `../mobile/README.md`. Production builds point at `https://zvino.co.zw`.

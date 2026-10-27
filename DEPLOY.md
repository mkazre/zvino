# Zvino API + Admin — deploying to shared hosting (cPanel)

1. **Build locally** (shared hosts usually lack Node): `npm ci && npm run build`, then
   `composer install --no-dev --optimize-autoloader`.
2. **Upload** the whole project to e.g. `/home/USER/zvino`, and point the domain's document
   root at `/home/USER/zvino/public` (or symlink `public_html` → `zvino/public`).
3. **Database**: create a MySQL database in cPanel and set in `.env`:
   `DB_CONNECTION=mysql`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`.
4. **.env essentials**
   - `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://admin.zvino.co.zw`
   - `BROADCAST_CONNECTION=pusher` plus `PUSHER_APP_ID/KEY/SECRET/CLUSTER`
   - `PAYNOW_FAKE=false`, `PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY`, `PAYNOW_MERCHANT_EMAIL`
   - `QUEUE_CONNECTION=database`
5. **First run** (cPanel Terminal or SSH):
   `php artisan key:generate && php artisan migrate --force && php artisan storage:link && php artisan optimize`
   (Only run `db:seed` on a demo environment; it creates demo vendors and logins.)
6. **Cron** (cPanel → Cron Jobs, every minute):
   `cd /home/USER/zvino && php artisan schedule:run >> /dev/null 2>&1`
7. **Paynow**: set the result URL in your Paynow integration to
   `https://YOUR-DOMAIN/api/payments/webhook/paynow`.

Order updates broadcast synchronously to Pusher (`ShouldBroadcastNow`), so live tracking and the
kitchen display need no worker process. Without Pusher keys, the kitchen display falls back to polling.

## Demo logins (seeded)
super admin `admin@zvino.co.zw`, vendor manager `manager@…`, cashier `cashier@…`, kitchen `kitchen@…`. Password for all: `password`.
Customer (mobile app): phone `0771234567`, OTP `123456` outside production.

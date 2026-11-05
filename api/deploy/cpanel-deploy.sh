#!/bin/bash
# Zvino deploy for cPanel shared hosting. Run by .cpanel.yml from the cloned repository.
#   repository (read-only copy from GitHub)  →  ~/zvino-app (the running app)
#   ~/public_html  →  symlink to ~/zvino-app/public
# Safe to run again and again: .env, uploads (storage/) and the database are never overwritten.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$HOME/zvino-app"
WEB="$HOME/public_html"
LOG="$HOME/zvino-deploy.log"
exec > >(tee -a "$LOG") 2>&1
echo "=== Deploy $(date '+%Y-%m-%d %H:%M:%S') from $SRC"

# PHP CLI: prefer cPanel's EasyApache PHP 8.3 / 8.2 (the default "php" on the command line can be older).
PHP=""
for v in 84 83 82; do [ -x "/opt/cpanel/ea-php$v/root/usr/bin/php" ] && PHP="/opt/cpanel/ea-php$v/root/usr/bin/php" && break; done
[ -z "$PHP" ] && PHP="$(command -v php)"
"$PHP" -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' || { echo "PHP 8.2+ is required (found $("$PHP" -r 'echo PHP_VERSION;')). cPanel → MultiPHP Manager."; exit 1; }
echo "Using $PHP ($("$PHP" -r 'echo PHP_VERSION;'))"

mkdir -p "$APP"
# Copy code; keep .env, storage and the public/storage link that live only on the server.
rsync -a --delete \
  --exclude='.git/' --exclude='.env' --exclude='storage/' --exclude='public/storage' \
  --exclude='bootstrap/cache/*.php' --exclude='.cpanel.yml' \
  "$SRC/" "$APP/"
mkdir -p "$APP"/storage/app/public "$APP"/storage/app/private "$APP"/storage/framework/{cache/data,sessions,views} "$APP"/storage/logs "$APP"/bootstrap/cache

cd "$APP"
if [ ! -f .env ]; then
  cp .env.production.example .env
  "$PHP" artisan key:generate --force
  echo
  echo ">>> Created $APP/.env. Open it in cPanel File Manager, fill in DB_DATABASE / DB_USERNAME / DB_PASSWORD"
  echo ">>> (and ZVINO_ADMIN_EMAIL / ZVINO_ADMIN_PASSWORD), save, then click Deploy HEAD Commit again."
  exit 1
fi
grep -q '^APP_KEY=base64' .env || "$PHP" artisan key:generate --force

envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

"$PHP" artisan down --retry=15 || true
trap '"$PHP" artisan up >/dev/null 2>&1 || true' EXIT   # never leave the site in maintenance mode
"$PHP" artisan config:clear
"$PHP" artisan migrate --force

# One-time demo data
if [ "$(envval ZVINO_SEED_DEMO)" = "true" ] && [ ! -f storage/app/.demo-seeded ]; then
  "$PHP" artisan db:seed --force && "$PHP" artisan db:seed --class=DemoActivitySeeder --force && touch storage/app/.demo-seeded
  echo "Demo data loaded (stores, menus, demo logins with password \"password\")."
fi
# First super admin
if [ -n "$(envval ZVINO_ADMIN_EMAIL)" ] && [ -n "$(envval ZVINO_ADMIN_PASSWORD)" ]; then
  "$PHP" artisan zvino:admin "$(envval ZVINO_ADMIN_EMAIL)" --name="Zvino Admin" --password="$(envval ZVINO_ADMIN_PASSWORD)" || echo "Admin not created (check the password rules)."
  echo "Tip: remove ZVINO_ADMIN_PASSWORD from .env now that your admin exists."
fi

[ -L public/storage ] || "$PHP" artisan storage:link
"$PHP" artisan optimize
"$PHP" artisan up

# Serve the site from the app's public folder (first deploy only: the old public_html is kept as a backup).
if [ ! -L "$WEB" ]; then
  if [ -e "$WEB" ]; then mv "$WEB" "$HOME/public_html_backup_$(date +%Y%m%d%H%M%S)"; echo "Old public_html moved to ~/public_html_backup_*"; fi
  ln -s "$APP/public" "$WEB"
  echo "public_html now points to $APP/public"
fi

"$PHP" artisan zvino:doctor || true
echo "=== Deploy finished. Site: $(envval APP_URL)"

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
# Log to ~/zvino-deploy.log as well as cPanel's deploy log. (Plain pipe: shared hosts often have no
# /dev/fd, so bash process substitution like `exec > >(tee …)` fails there.)
if [ -z "${ZVINO_DEPLOY_LOGGED:-}" ]; then
  ZVINO_DEPLOY_LOGGED=1 /bin/bash "${BASH_SOURCE[0]}" "$@" 2>&1 | tee -a "$LOG"
  exit "${PIPESTATUS[0]}"
fi
echo "=== Deploy $(date '+%Y-%m-%d %H:%M:%S') from $SRC"

# PHP CLI: prefer cPanel's EasyApache PHP 8.3 / 8.2 (the default "php" on the command line can be older).
PHP=""
for v in 84 83 82; do [ -x "/opt/cpanel/ea-php$v/root/usr/bin/php" ] && PHP="/opt/cpanel/ea-php$v/root/usr/bin/php" && break; done
[ -z "$PHP" ] && PHP="$(command -v php)"
"$PHP" -r 'exit(version_compare(PHP_VERSION, "8.2.0", ">=") ? 0 : 1);' || { echo "PHP 8.2+ is required (found $("$PHP" -r 'echo PHP_VERSION;')). cPanel → MultiPHP Manager."; exit 1; }
echo "Using $PHP ($("$PHP" -r 'echo PHP_VERSION;'))"

mkdir -p "$APP"
# Copy code; keep .env, storage and the public/storage link that live only on the server.
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude='.git/' --exclude='.env' --exclude='storage/' --exclude='public/storage' \
    --exclude='bootstrap/cache/*.php' --exclude='.cpanel.yml' \
    "$SRC/" "$APP/"
else
  # No rsync on this host: copy with tar (same exclusions; old files aren't removed, which is harmless).
  echo "rsync not found, copying with tar"
  tar -C "$SRC" --exclude='./.git' --exclude='./.env' --exclude='./storage' --exclude='./public/storage' \
    --exclude='./bootstrap/cache/*.php' --exclude='./.cpanel.yml' -cf - . | tar -C "$APP" -xf -
fi
mkdir -p "$APP"/storage/app/public "$APP"/storage/app/private "$APP"/storage/app/dompdf "$APP"/storage/framework/{cache/data,sessions,views} "$APP"/storage/logs "$APP"/bootstrap/cache

cd "$APP"
if [ ! -f .env ]; then
  cp .env.production.example .env
  "$PHP" artisan key:generate --force
  echo
  echo ">>> Created $APP/.env. Open it in cPanel File Manager, fill in DB_DATABASE / DB_USERNAME / DB_PASSWORD"
  echo ">>> (and ZVINO_ADMIN_EMAIL / ZVINO_ADMIN_PASSWORD), save, then click Deploy HEAD Commit again."
  exit 1
fi
# Check .env before touching anything: a typo there (e.g. a value with spaces but no quotes) breaks the whole site.
if ! ENV_ERR="$("$PHP" -r 'require "vendor/autoload.php"; try { Dotenv\Dotenv::createImmutable(getcwd())->load(); } catch (Throwable $e) { echo $e->getMessage(); exit(1); }' 2>&1)"; then
  echo
  echo ">>> Your .env file has a mistake, so nothing was changed:"
  echo ">>> $ENV_ERR"
  echo ">>> Fix it in cPanel File Manager (~/zvino-app/.env). Values with spaces need quotes, e.g. APP_NAME=\"Zvino Food Delivery\""
  echo ">>> Then click Deploy HEAD Commit again."
  exit 1
fi
grep -q '^APP_KEY=base64' .env || "$PHP" artisan key:generate --force

envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# Uploads go straight into public_html/storage (see config/filesystems.php).
grep -q '^PUBLIC_DISK_ROOT=' .env || printf '\nPUBLIC_DISK_ROOT=%s\n' "$WEB/storage" >> .env

"$PHP" artisan down --retry=15 || true
trap '"$PHP" artisan up >/dev/null 2>&1 || true' EXIT   # never leave the site in maintenance mode
"$PHP" artisan config:clear
# The list of installed packages is cached in bootstrap/cache (kept between deploys): rebuild it so
# newly added packages (e.g. the PDF library) are switched on.
rm -f bootstrap/cache/packages.php bootstrap/cache/services.php
"$PHP" artisan package:discover --ansi
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

# ── public_html: a real folder holding the public files (LiteSpeed won't serve a symlinked
#    document root). index.php loads the app from ~/zvino-app; uploads live in public_html/storage.
[ -L "$WEB" ] && rm -f "$WEB"   # undo the earlier symlink setup (removes the link only)
if [ -d "$WEB" ] && [ ! -f "$WEB/.zvino" ] && [ -n "$(ls -A "$WEB" 2>/dev/null)" ]; then
  mv "$WEB" "$HOME/public_html_backup_$(date +%Y%m%d%H%M%S)"; echo "Old public_html moved to ~/public_html_backup_*"
fi
mkdir -p "$WEB/storage"
rm -rf "$WEB/build"             # old hashed JS/CSS from the previous release
tar -C "$APP/public" --exclude='./storage' --exclude='./index.php' -cf - . | tar -C "$WEB" -xf -
cat > "$WEB/index.php" <<'PHPFILE'
<?php
// Zvino front controller for cPanel: the app lives in ~/zvino-app, this folder is the web root.
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));
$app_dir = dirname(__DIR__).'/zvino-app';

if (file_exists($maintenance = $app_dir.'/storage/framework/maintenance.php')) {
    require $maintenance;
}
require $app_dir.'/vendor/autoload.php';

/** @var \Illuminate\Foundation\Application $app */
$app = require_once $app_dir.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);
$app->handleRequest(Request::capture());
PHPFILE
touch "$WEB/.zvino"
# Uploads saved before PUBLIC_DISK_ROOT existed: copy them across once.
if [ -n "$(ls -A "$APP/storage/app/public" 2>/dev/null)" ] && [ ! -f "$WEB/storage/.migrated" ]; then
  cp -a "$APP/storage/app/public/." "$WEB/storage/" && touch "$WEB/storage/.migrated"
fi
echo "public_html updated (index.php → $APP)"

"$PHP" artisan optimize
"$PHP" artisan up

"$PHP" artisan zvino:doctor || true
echo "=== Deploy finished. Site: $(envval APP_URL)"

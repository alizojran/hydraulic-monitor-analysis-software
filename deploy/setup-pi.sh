#!/usr/bin/env bash
#
# HMAS — Raspberry Pi server setup.
#
# Installs nginx, deploys the built SPA to the web root, installs the site
# config, and (optionally) the kiosk service. Run ON the Raspberry Pi.
#
# Build the SPA first (on a PC is faster than on the Pi):
#     cd v2 && npm ci && npm run build:pi      # → v2/dist/  (BASE=/)
# then copy the repo (or just v2/dist + deploy/) to the Pi and run:
#     sudo ./deploy/setup-pi.sh
#
# Env overrides:
#     WEBROOT=/var/www/hmas   DIST=../v2/dist   KIOSK=1   ./deploy/setup-pi.sh
set -euo pipefail

WEBROOT="${WEBROOT:-/var/www/hmas}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="${DIST:-$SCRIPT_DIR/../v2/dist}"
KIOSK="${KIOSK:-0}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root (sudo)." >&2
  exit 1
fi

if [[ ! -f "$DIST/index.html" ]]; then
  echo "ERROR: no build found at: $DIST" >&2
  echo "Run 'npm run build:pi' in v2/ first, or set DIST=/path/to/dist." >&2
  exit 1
fi

echo "==> Installing nginx"
apt-get update -qq
apt-get install -y -qq nginx curl

echo "==> Deploying SPA to $WEBROOT"
mkdir -p "$WEBROOT"
# --delete keeps the web root in sync with the latest build.
rsync -a --delete "$DIST"/ "$WEBROOT"/
chown -R www-data:www-data "$WEBROOT"

echo "==> Installing nginx site config"
cp "$SCRIPT_DIR/nginx-hmas.conf" /etc/nginx/sites-available/hmas
ln -sf /etc/nginx/sites-available/hmas /etc/nginx/sites-enabled/hmas
# Drop the stock default site if present (it also claims default_server :80).
rm -f /etc/nginx/sites-enabled/default

echo "==> Testing and reloading nginx"
nginx -t
systemctl reload nginx

if [[ "$KIOSK" == "1" ]]; then
  echo "==> Installing kiosk service"
  cp "$SCRIPT_DIR/hmas-kiosk.service" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now hmas-kiosk.service
  echo "    Kiosk enabled (Chromium → http://localhost/)."
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "✅ Done."
echo "   Local:  http://localhost/"
[[ -n "${IP:-}" ]] && echo "   LAN:    http://$IP/"
echo
echo "Reminders:"
echo " • WebSerial needs localhost or HTTPS — over a LAN IP it is unavailable."
echo " • AI fault diagnosis needs outbound internet (api.anthropic.com)."
echo " • Device profile / baselines live in the BROWSER localStorage, not on disk."

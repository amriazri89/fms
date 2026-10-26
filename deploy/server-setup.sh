#!/usr/bin/env bash
# One-time setup of the Ubuntu 24.04 VPS for FMS. Run as root from the deploy/ folder:
#
#   DEPLOY_PUBKEY="ssh-ed25519 AAAA... github-actions" bash server-setup.sh
#
# Options (environment variables):
#   DEPLOY_PUBKEY   public key GitHub Actions uses to log in as "deploy" (required)
#   DOMAIN          your domain; leave empty to use the server IP for now
#   TIMEZONE        default Asia/Kuala_Lumpur
#
# Safe to re-run: existing users, database, secrets and swap are left alone.
set -euo pipefail

APP="fms"
DEPLOY_USER="deploy"
APP_ROOT="/var/www/$APP"
DOMAIN="${DOMAIN:-}"
TIMEZONE="${TIMEZONE:-Asia/Kuala_Lumpur}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NEW_LOGINS=""

[ "$(id -u)" -eq 0 ] || { echo "Run as root." >&2; exit 1; }
[ -n "${DEPLOY_PUBKEY:-}" ] || { echo "Set DEPLOY_PUBKEY to the deploy key's public part." >&2; exit 1; }

log() { printf '\n==> %s\n' "$*"; }
rand() { openssl rand -hex "$1"; }

log "Updating system and installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y nginx aspnetcore-runtime-8.0 mysql-server curl ufw fail2ban \
                   unattended-upgrades certbot python3-certbot-nginx openssl
timedatectl set-timezone "$TIMEZONE"

log "Swap (2 GB) if none exists"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Users"
id "$DEPLOY_USER" &>/dev/null || adduser --disabled-password --gecos "" "$DEPLOY_USER"
id "$APP" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "$APP"
usermod -aG systemd-journal "$DEPLOY_USER"   # lets deploy read app logs

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$DEPLOY_PUBKEY" "$AUTH_KEYS" || echo "$DEPLOY_PUBKEY" >> "$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

log "Allow deploy to restart only the app service"
SUDOERS="/etc/sudoers.d/$APP-deploy"
echo "$DEPLOY_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart $APP-api" > "$SUDOERS.tmp"
visudo -cf "$SUDOERS.tmp"
chmod 440 "$SUDOERS.tmp"
mv "$SUDOERS.tmp" "$SUDOERS"

log "Directories"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_ROOT" "$APP_ROOT/releases"
install -d -m 750 -o "$APP" -g "$APP" "/var/lib/$APP" "/var/lib/$APP/uploads"
install -d -m 750 -o root -g "$DEPLOY_USER" "/etc/$APP"

log "Settings file /etc/$APP/api.env"
ENV_FILE="/etc/$APP/api.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$SCRIPT_DIR/api.env.example" "$ENV_FILE"
  MANAGER_PASS="Pg-$(rand 6)"
  CLERK_PASS="Kr-$(rand 6)"
  sed -i -e "s|CHANGE_ME_JWT_KEY|$(rand 32)|" \
         -e "s|CHANGE_ME_MANAGER_PASSWORD|$MANAGER_PASS|" \
         -e "s|CHANGE_ME_CLERK_PASSWORD|$CLERK_PASS|" "$ENV_FILE"
  NEW_LOGINS="  pengurus / $MANAGER_PASS
  kerani   / $CLERK_PASS"
fi
chown root:"$DEPLOY_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

log "MySQL"
install -m 644 /dev/stdin /etc/mysql/mysql.conf.d/zz-$APP.cnf <<'EOF'
# Tuned for a small (2 GB) server running FMS
[mysqld]
bind-address            = 127.0.0.1
mysqlx                  = OFF
performance_schema      = OFF
innodb_buffer_pool_size = 256M
max_connections         = 50
EOF
systemctl enable mysql
systemctl restart mysql
if ! mysql -NBe "SELECT 1 FROM mysql.user WHERE user='$APP' AND host='localhost'" | grep -q 1; then
  DB_PASS="$(rand 16)"
  mysql -e "CREATE DATABASE IF NOT EXISTS \`$APP\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
            CREATE USER '$APP'@'localhost' IDENTIFIED BY '$DB_PASS';
            GRANT ALL PRIVILEGES ON \`$APP\`.* TO '$APP'@'localhost';"
  sed -i "s|CHANGE_ME_DB_PASSWORD|$DB_PASS|" "$ENV_FILE"
fi

log "Daily backup at 02:00 (database + receipts)"
install -m 755 "$SCRIPT_DIR/backup.sh" "/usr/local/bin/$APP-backup.sh"
install -d -m 700 "/var/backups/$APP"
echo "0 2 * * * root /usr/local/bin/$APP-backup.sh" > "/etc/cron.d/$APP-backup"
chmod 644 "/etc/cron.d/$APP-backup"

log "systemd service"
install -m 644 "$SCRIPT_DIR/systemd/$APP-api.service" "/etc/systemd/system/$APP-api.service"
systemctl daemon-reload
systemctl enable "$APP-api"   # starts on first deploy, once current/ exists

log "Nginx"
install -m 644 "$SCRIPT_DIR/nginx/$APP.conf" "/etc/nginx/sites-available/$APP"
if [ -n "$DOMAIN" ]; then
  sed -i "s|server_name _;|server_name $DOMAIN;|" "/etc/nginx/sites-available/$APP"
fi
ln -sfn "/etc/nginx/sites-available/$APP" "/etc/nginx/sites-enabled/$APP"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now fail2ban

log "Done"
echo
echo "Server is ready for the first deploy from GitHub Actions."
if [ -n "$NEW_LOGINS" ]; then
  echo
  echo "First-login passwords for FMS (save these now, change them after logging in):"
  echo "$NEW_LOGINS"
fi
cat <<EOF

Next:
  1. Add the GitHub secrets and push to main (see README).
  2. Later, when a domain points here:
       certbot --nginx -d ${DOMAIN:-your.domain.com} --redirect -m you@example.com --agree-tos
  3. Once key login works for you, disable SSH password login
     (PasswordAuthentication no in /etc/ssh/sshd_config.d/), then: systemctl reload ssh

EOF

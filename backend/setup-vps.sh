#!/bin/bash
# ══════════════════════════════════════════════════
#  QRKulka VPS Setup Script
#  Ubuntu 20.04/22.04
#  Usage: bash setup-vps.sh yourdomain.com your@email.com
# ══════════════════════════════════════════════════

set -e

DOMAIN=${1:-"api.qrkulka.com"}
EMAIL=${2:-"admin@example.com"}
APP_DIR="/var/www/qrkulka-backend"
NODE_VERSION="20"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  QRKulka VPS Setup"
echo "  Domain: $DOMAIN"
echo "  Email:  $EMAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. System update
echo "📦 Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Node.js
echo "📦 Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt-get install -y nodejs -qq

# 3. nginx + certbot
echo "📦 Installing nginx + certbot..."
apt-get install -y nginx certbot python3-certbot-nginx -qq

# 4. PM2
echo "📦 Installing PM2..."
npm install -g pm2 -q

# 5. App directory
echo "📁 Creating app directory..."
mkdir -p $APP_DIR/data
mkdir -p $APP_DIR

# 6. Copy app (assuming you uploaded it already OR clone from git)
# If using git: git clone YOUR_REPO $APP_DIR
# For now, assume files are already in current directory
if [ -f "./server.js" ]; then
  cp -r . $APP_DIR/
else
  echo "⚠️  server.js not found in current directory."
  echo "   Upload your backend files to $APP_DIR manually."
fi

# 7. Install dependencies
echo "📦 Installing npm dependencies..."
cd $APP_DIR && npm install --production

# 8. Create .env if not exists
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚙️  Creating .env..."
  JWT_SECRET=$(openssl rand -hex 32)
  cat > $APP_DIR/.env << ENVEOF
BOT_TOKEN=REPLACE_WITH_YOUR_BOT_TOKEN
BOT_USERNAME=QRKulkaBot
JWT_SECRET=$JWT_SECRET
FRONTEND_URL=https://qrkulka.vercel.app
PORT=3001
DB_PATH=$APP_DIR/data/qrkulka.db
ENVEOF
  echo "⚠️  Edit $APP_DIR/.env and set BOT_TOKEN!"
fi

# 9. PM2 ecosystem
cat > $APP_DIR/ecosystem.config.js << 'PMEOF'
module.exports = {
  apps: [{
    name: 'qrkulka-api',
    script: 'server.js',
    cwd: '/var/www/qrkulka-backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: { NODE_ENV: 'production' },
    error_file: '/var/log/qrkulka/error.log',
    out_file:   '/var/log/qrkulka/out.log',
  }]
};
PMEOF

mkdir -p /var/log/qrkulka

# 10. nginx config
echo "⚙️  Configuring nginx..."
cat > /etc/nginx/sites-available/qrkulka << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/qrkulka /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 11. SSL with certbot
echo "🔒 Getting SSL certificate..."
certbot --nginx -d $DOMAIN --email $EMAIL --agree-tos --non-interactive --redirect

# 12. Start app with PM2
echo "🚀 Starting app..."
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup complete!"
echo ""
echo "  API:      https://$DOMAIN"
echo "  Health:   https://$DOMAIN/health"
echo "  Logs:     pm2 logs qrkulka-api"
echo "  Restart:  pm2 restart qrkulka-api"
echo ""
echo "  ⚠️  Don't forget:"
echo "  1. Edit $APP_DIR/.env — set BOT_TOKEN"
echo "  2. In @BotFather: /setdomain → $DOMAIN"
echo "  3. pm2 restart qrkulka-api"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

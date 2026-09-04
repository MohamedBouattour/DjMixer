#!/bin/bash
set -e

SSH_USER="root"
SSH_HOST="79.137.14.75"
TARGET_DIR="/var/www/dj-mixer"

echo "🚀 Deploying DJ Pro Master to Production (https://dj-mixer.cloud)..."

# 1. Build Flutter Web Application
echo "📦 Building Flutter Web bundle..."
export PATH="/Users/wecraft/development/flutter/bin:$PATH"
cd mobile
flutter build web --no-tree-shake-icons --release
cd ..

# 2. Sync Frontend Web Assets to Nginx Target Root
echo "🌐 Syncing Web assets to VPS..."
rsync -avz --delete mobile/build/web/ $SSH_USER@$SSH_HOST:$TARGET_DIR/web/

# 3. Sync Backend Proxy Files
echo "⚙️ Syncing Backend service..."
rsync -avz backend/proxy.js backend/package.json backend/package-lock.json .env $SSH_USER@$SSH_HOST:$TARGET_DIR/backend/

# 4. Install Dependencies and Restart PM2 Service
echo "🔄 Reloading PM2 Service on VPS..."
ssh $SSH_USER@$SSH_HOST "cd $TARGET_DIR/backend && npm install --omit=dev && pm2 delete dj-mixer-backend 2>/dev/null || true && PORT=5001 NODE_ENV=production pm2 start proxy.js --name dj-mixer-backend && pm2 save"

# 5. Reload Nginx
echo "🔄 Reloading Nginx..."
ssh $SSH_USER@$SSH_HOST "nginx -t && systemctl reload nginx"

echo "✅ Production Deployment completed successfully at https://dj-mixer.cloud"

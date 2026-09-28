#!/bin/bash
# Deploy to the directory nginx ACTUALLY serves (root /var/www/bookstore/out).
set -e
REAL=/var/www/bookstore/out
cd ~

rm -rf /tmp/fe_deploy /tmp/fe_new
mkdir -p /tmp/fe_deploy
tar -xzf ~/deploy.tgz -C /tmp/fe_deploy
test -f /tmp/fe_deploy/index.html

cp -a /tmp/fe_deploy /tmp/fe_new
rm -rf "$REAL".old
mv "$REAL" "$REAL".old
mv /tmp/fe_new "$REAL"

echo "DEPLOYED_TO_REAL_ROOT"
ls -lt "$REAL/_next/static/chunks/" | head -3

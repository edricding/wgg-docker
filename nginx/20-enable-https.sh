#!/usr/bin/env sh
set -eu

certificate=/etc/letsencrypt/live/wagaga.top/fullchain.pem
private_key=/etc/letsencrypt/live/wagaga.top/privkey.pem

rm -f /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/https.conf

if [ -s "$certificate" ] && [ -s "$private_key" ]; then
  cp /etc/nginx/site-templates/http-redirect.conf /etc/nginx/conf.d/default.conf
  cp /etc/nginx/site-templates/https.conf /etc/nginx/conf.d/https.conf
  echo "HTTPS certificate detected; secure sites enabled."
else
  cp /etc/nginx/site-templates/bootstrap.conf /etc/nginx/conf.d/default.conf
  echo "HTTPS certificate not found; API routes remain disabled."
fi

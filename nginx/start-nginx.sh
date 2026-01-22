#!/bin/sh
set -e

DOMAIN=${DOMAIN:-localhost}

# Determine which certificate to use
if [ -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
  KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem
  echo "Using Let's Encrypt certificate"
elif [ -f /etc/nginx/ssl/self-signed/cert.pem ]; then
  CERT_PATH=/etc/nginx/ssl/self-signed/cert.pem
  KEY_PATH=/etc/nginx/ssl/self-signed/key.pem
  echo "Using self-signed certificate"
else
  echo "Error: No SSL certificate found"
  exit 1
fi

# Generate nginx config with proper certificate paths
envsubst '${DOMAIN}' < /etc/nginx/conf.d.template/default.conf > /tmp/default.conf

# Replace certificate paths - handle both Let's Encrypt and self-signed patterns
sed -i "s|ssl_certificate.*fullchain.pem;|ssl_certificate $CERT_PATH;|" /tmp/default.conf
sed -i "s|ssl_certificate_key.*privkey.pem;|ssl_certificate_key $KEY_PATH;|" /tmp/default.conf

# Copy to writable location
cp /tmp/default.conf /etc/nginx/conf.d/default.conf

# Start nginx
exec nginx -g 'daemon off;'

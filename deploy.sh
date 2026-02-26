#!/bin/bash
set -e

DOMAIN=${DOMAIN:-$(hostname -f 2>/dev/null || echo "localhost")}
DB_PASSWORD=${DB_PASSWORD:-coconuts}
TENANT_NAME=${TENANT_NAME:-production}

echo "Deploying Vantage with domain: $DOMAIN"

# Check if we have Let's Encrypt certificates
if [ -d "./nginx/ssl/certbot/conf/live/$DOMAIN" ] || [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "Using existing SSL certificates"
    USE_LETSENCRYPT=true
else
    echo "No Let's Encrypt certificates found. Will use self-signed certificates for initial setup."
    USE_LETSENCRYPT=false
    
    # Create self-signed certificate
    mkdir -p ./nginx/ssl/self-signed
    if [ ! -f "./nginx/ssl/self-signed/cert.pem" ]; then
        echo "Generating self-signed certificate..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ./nginx/ssl/self-signed/key.pem \
            -out ./nginx/ssl/self-signed/cert.pem \
            -subj "/CN=$DOMAIN" \
            -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN,IP:$(curl -s ifconfig.me 2>/dev/null || echo '127.0.0.1')"
    fi
fi

# Export environment variables
export DOMAIN
export DB_PASSWORD
export TENANT_NAME
export USE_LETSENCRYPT

# Build and start services
echo "Building and starting services..."
docker compose -f docker-compose.prod.yaml build app

# Start postgres first
echo "Starting PostgreSQL..."
docker compose -f docker-compose.prod.yaml up -d postgres

# Wait for postgres to be healthy
echo "Waiting for PostgreSQL to be ready..."
timeout=60
while [ $timeout -gt 0 ]; do
    if docker compose -f docker-compose.prod.yaml exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
        echo "PostgreSQL is ready!"
        break
    fi
    sleep 2
    timeout=$((timeout - 2))
done

# Start app
echo "Starting application..."
docker compose -f docker-compose.prod.yaml up -d app

# Wait for app to be healthy
echo "Waiting for application to be ready..."
timeout=120
while [ $timeout -gt 0 ]; do
    if docker compose -f docker-compose.prod.yaml exec -T app curl -f http://localhost:3030/health > /dev/null 2>&1; then
        echo "Application is ready!"
        break
    fi
    sleep 2
    timeout=$((timeout - 2))
done

# Start nginx
echo "Starting Nginx..."
docker compose -f docker-compose.prod.yaml up -d nginx

# Start certbot (for renewal)
echo "Starting Certbot..."
docker compose -f docker-compose.prod.yaml up -d certbot

echo ""
echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
echo "Application is available at:"
if [ "$USE_LETSENCRYPT" = true ]; then
    echo "  https://$DOMAIN"
else
    echo "  https://$DOMAIN (self-signed certificate)"
    echo ""
    echo "Note: You'll see a security warning for self-signed certificates."
    echo "To use Let's Encrypt certificates, set DOMAIN environment variable"
    echo "and ensure DNS points to this server, then run:"
    echo "  DOMAIN=yourdomain.com ./init-letsencrypt.sh"
fi
echo ""
echo "To view logs: docker compose -f docker-compose.prod.yaml logs -f"
echo "To stop: docker compose -f docker-compose.prod.yaml down"

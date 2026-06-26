#!/bin/bash
# Visioryx - Cloudflare SSL Setup Script
# This script configures SSL using Cloudflare's origin server certificates

set -e

echo "🌐 Visioryx - Cloudflare SSL Setup"
echo "=================================="

# Check if running on VPS
if [ ! -f /etc/nginx/nginx.conf ]; then
    echo "❌ Nginx not found. This script should be run on your VPS."
    echo "Install nginx: sudo apt install nginx"
    exit 1
fi

# Get domain name
if [ -z "$1" ]; then
    echo "Usage: $0 your-domain.com"
    echo "Example: $0 visioryx.example.com"
    exit 1
fi

DOMAIN=$1
CERT_DIR="/etc/nginx/ssl"
mkdir -p "$CERT_DIR"

echo "📋 Setting up SSL for: $DOMAIN"

# Generate private key and CSR
echo "🔐 Generating private key and CSR..."
openssl genrsa -out "$CERT_DIR/server.key" 2048
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" -subj "/C=US/ST=State/L=City/O=Visioryx/CN=$DOMAIN"

# Create Cloudflare origin certificate (you'll need to upload CSR to Cloudflare dashboard)
# Cloudflare Dashboard > SSL/TLS > Origin Server > Create Certificate
# Or use the self-signed cert for now

echo "⚠️  For Cloudflare Origin Certificate:"
echo "   1. Go to Cloudflare Dashboard > SSL/TLS > Origin Server"
echo "   2. Click 'Create Certificate'"
echo "   3. Copy the CSR content above or use Cloudflare-generated"
echo "   4. Download the certificate and key"
echo "   5. Save as $CERT_DIR/origin.crt and $CERT_DIR/origin.key"

# For now, create a self-signed cert (will show warning in browser)
echo "📜 Creating self-signed certificate for immediate use..."
openssl x509 -req -in "$CERT_DIR/server.csr" -signkey "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" -days 365

# Create Nginx config
NGINX_CONFIG="/etc/nginx/sites-available/visioryx"

echo "📝 Creating Nginx configuration..."
cat > "$NGINX_CONFIG" <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Redirect to HTTPS (Cloudflare will handle this)
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate $CERT_DIR/server.crt;
    ssl_certificate_key $CERT_DIR/server.key;
    
    # Cloudflare recommended settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    # Your backend is running on port 8000
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Static files (if any)
    location /static {
        alias /var/www/visioryx/static;
    }
}
EOF

# Enable the site
ln -sf "$NGINX_CONFIG" /etc/nginx/sites-enabled/visioryx
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
echo "🧪 Testing Nginx configuration..."
nginx -t

echo "🔄 Reloading Nginx..."
systemctl reload nginx

echo ""
echo "✅ SSL setup complete!"
echo ""
echo "Next steps:"
echo "1. Point your domain to this server's IP in Cloudflare"
echo "2. Set SSL/TLS mode to 'Full' or 'Full (strict)' in Cloudflare"
echo "3. For production SSL, upload origin certificate to Cloudflare"
echo ""
echo "Files created:"
echo "  Certificate: $CERT_DIR/server.crt"
echo "  Private Key: $CERT_DIR/server.key"
echo "  Nginx Config: $NGINX_CONFIG"

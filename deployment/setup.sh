#!/bin/bash
# ==========================================
# AxonDoc Quick Setup Script
# ==========================================
# Usage: ./setup.sh [--generate-keys]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Generate JWT token
generate_jwt() {
    local role=$1
    local secret=$2
    local now=$(date +%s)
    local exp=$((now + 315360000))  # 10 years
    
    local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
    local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$now,\"exp\":$exp}" | base64 -w0 | tr '+/' '-_' | tr -d '=')
    local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64 -w0 | tr '+/' '-_' | tr -d '=')
    
    echo "$header.$payload.$signature"
}

# Generate all secrets
generate_secrets() {
    log "Generating secrets..."
    
    POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
    JWT_SECRET=$(openssl rand -hex 32)
    SECRET_KEY_BASE=$(openssl rand -base64 48 | tr -d '/+=')
    VAULT_ENC_KEY=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    PG_META_CRYPTO_KEY=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-32)
    LOGFLARE_PUBLIC_TOKEN=$(openssl rand -hex 16)
    LOGFLARE_PRIVATE_TOKEN=$(openssl rand -hex 24)
    
    ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
    SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")
    
    log "Secrets generated successfully"
}

# Create .env file
create_env() {
    if [ -f .env ]; then
        warn ".env file already exists. Backup to .env.backup"
        cp .env .env.backup
    fi
    
    generate_secrets
    
    cat > .env << EOF
# ==========================================
# AxonDoc Configuration (Auto-generated)
# ==========================================

# Database
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

# JWT
JWT_SECRET=$JWT_SECRET
JWT_EXPIRY=3600

# Supabase Keys
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

# Encryption
SECRET_KEY_BASE=$SECRET_KEY_BASE
VAULT_ENC_KEY=$VAULT_ENC_KEY
PG_META_CRYPTO_KEY=$PG_META_CRYPTO_KEY

# Analytics
LOGFLARE_PUBLIC_ACCESS_TOKEN=$LOGFLARE_PUBLIC_TOKEN
LOGFLARE_PRIVATE_ACCESS_TOKEN=$LOGFLARE_PRIVATE_TOKEN

# URLs (update for production)
SITE_URL=http://localhost:3001
API_EXTERNAL_URL=http://localhost:8000
PUBLIC_SUPABASE_URL=http://localhost:8000

# Ports
KONG_HTTP_PORT=8000
KONG_HTTPS_PORT=8443
NEXTJS_PORT=3001
CRAWLER_PORT=8001
REDIS_PORT=6379

# Auth
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_ANONYMOUS_USERS=false

# Dashboard
DASHBOARD_USERNAME=supabase
DASHBOARD_PASSWORD=$(openssl rand -base64 12 | tr -d '/+=')

# Pooler
POOLER_TENANT_ID=axon-doc
POOLER_DEFAULT_POOL_SIZE=20
POOLER_MAX_CLIENT_CONN=100

# Other
PGRST_DB_SCHEMAS=public,storage,graphql_public
EOF

    log ".env file created"
    echo ""
    echo "==========================================="
    echo "Important credentials (save these!):"
    echo "==========================================="
    echo "Dashboard: http://localhost:8000"
    echo "  Username: supabase"
    echo "  Password: $(grep DASHBOARD_PASSWORD .env | cut -d= -f2)"
    echo ""
    echo "App: http://localhost:3001"
    echo "  Admin: admin / admin123"
    echo "==========================================="
}

# Main
main() {
    log "AxonDoc Setup"
    
    # Check if .env exists
    if [ ! -f .env ]; then
        log "No .env found, generating..."
        create_env
    elif [ "$1" == "--generate-keys" ]; then
        create_env
    else
        log "Using existing .env file"
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker not found. Please install Docker first."
    fi
    
    if ! docker compose version &> /dev/null; then
        error "Docker Compose not found. Please install Docker Compose."
    fi
    
    log "Starting services..."
    docker compose up -d
    
    log "Waiting for services to be healthy..."
    sleep 30
    
    log "Checking service status..."
    docker compose ps
    
    echo ""
    log "Setup complete!"
    echo ""
    echo "Access points:"
    echo "  - App:       http://localhost:3001"
    echo "  - API:       http://localhost:8000"
    echo "  - Crawler:   http://localhost:8001"
    echo ""
    echo "Default admin login: admin / admin123"
}

main "$@"

#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Anvil — One-liner self-hosted installer
#
# Usage:
#   curl -fsSL https://get.anvil.dev | bash
#
# Or with options:
#   curl -fsSL https://get.anvil.dev | bash -s -- --domain anvil.mycompany.com --email admin@mycompany.com
# ──────────────────────────────────────────────────────────────

set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ANVIL_VERSION="${ANVIL_VERSION:-latest}"
ANVIL_DIR="${ANVIL_DIR:-/opt/anvil}"
ANVIL_DOMAIN="${ANVIL_DOMAIN:-}"
ANVIL_EMAIL="${ANVIL_EMAIL:-}"
ANVIL_PLAN="${ANVIL_PLAN:-free}"

log()   { echo -e "${BLUE}[anvil]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
fail()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }

# ── Preflight Checks ──

preflight() {
  log "Running preflight checks..."

  # Must be root or have sudo
  if [[ $EUID -ne 0 ]]; then
    if ! command -v sudo &>/dev/null; then
      fail "This script requires root access. Run with: sudo curl ... | sudo bash"
    fi
    SUDO="sudo"
  else
    SUDO=""
  fi

  # OS detection
  if [[ -f /etc/os-release ]]; then
    source /etc/os-release
    OS="${ID:-unknown}"
    OS_VERSION="${VERSION_ID:-unknown}"
  else
    OS="unknown"
    OS_VERSION="unknown"
  fi

  log "Detected OS: ${OS} ${OS_VERSION}"

  # Architecture
  ARCH=$(uname -m)
  case "${ARCH}" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    armv7l)  ARCH="armv7" ;;
    *)       fail "Unsupported architecture: ${ARCH}" ;;
  esac

  # Check minimum requirements
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
  if [[ ${TOTAL_RAM_GB} -lt 2 ]]; then
    warn "Minimum 2GB RAM recommended. Detected: ${TOTAL_RAM_GB}GB"
  fi

  # Check available disk
  AVAILABLE_GB=$(df -BG "${ANVIL_DIR%/*}" 2>/dev/null | awk 'NR==2{print $4}' | tr -d 'G' || echo "0")
  if [[ ${AVAILABLE_GB} -lt 10 ]]; then
    warn "Minimum 10GB disk space recommended. Available: ${AVAILABLE_GB}GB"
  fi

  ok "Preflight checks passed"
}

# ── Parse Arguments ──

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)    ANVIL_DOMAIN="$2";    shift 2 ;;
      --email)     ANVIL_EMAIL="$2";     shift 2 ;;
      --dir)       ANVIL_DIR="$2";       shift 2 ;;
      --plan)      ANVIL_PLAN="$2";      shift 2 ;;
      --version)   ANVIL_VERSION="$2";   shift 2 ;;
      --help|-h)
        echo "Usage: curl -fsSL https://get.anvil.dev | bash -s -- [options]"
        echo ""
        echo "Options:"
        echo "  --domain DOMAIN    Your domain (e.g., anvil.company.com)"
        echo "  --email EMAIL      Admin email address"
        echo "  --dir PATH         Installation directory (default: /opt/anvil)"
        echo "  --plan PLAN        Plan: free, starter, business, enterprise"
        echo "  --version VERSION  Specific version to install (default: latest)"
        echo "  --help             Show this help message"
        exit 0
        ;;
      *) warn "Unknown option: $1"; shift ;;
    esac
  done
}

# ── Install Dependencies ──

install_deps() {
  log "Installing dependencies..."

  case "${OS}" in
    ubuntu|debian|pop|linuxmint)
      $SUDO apt-get update -qq
      $SUDO apt-get install -y -qq curl git jq openssl ca-certificates
      ;;
    centos|rhel|rocky|almalinux|fedora)
      $SUDO yum install -y -q curl git jq openssl ca-certificates
      ;;
    arch|manjaro)
      $SUDO pacman -Sy --noconfirm curl git jq openssl ca-certificates
      ;;
    *)
      warn "Unknown OS '${OS}'. Attempting to continue without dependency installation."
      ;;
  esac

  # Install Docker if not present
  if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO systemctl enable --now docker
    ok "Docker installed"
  else
    ok "Docker already installed"
  fi

  # Install Docker Compose (plugin)
  if ! docker compose version &>/dev/null; then
    log "Installing Docker Compose plugin..."
    $SUDO mkdir -p /usr/local/lib/docker/cli-plugins
    $SUDO curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    $SUDO chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    ok "Docker Compose installed"
  else
    ok "Docker Compose already installed"
  fi
}

# ── Download Anvil ──

download_anvil() {
  log "Downloading Anvil ${ANVIL_VERSION}..."

  $SUDO mkdir -p "${ANVIL_DIR}"

  # Clone the repository (or download release archive)
  if command -v git &>/dev/null; then
    if [[ "${ANVIL_VERSION}" == "latest" ]]; then
      $SUDO git clone --depth 1 https://github.com/anvil-org/anvil.git "${ANVIL_DIR}/repo"
    else
      $SUDO git clone --depth 1 --branch "v${ANVIL_VERSION}" https://github.com/anvil-org/anvil.git "${ANVIL_DIR}/repo"
    fi
  else
    $SUDO curl -fsSL "https://github.com/anvil-org/anvil/archive/refs/heads/main.tar.gz" | \
      $SUDO tar xz -C "${ANVIL_DIR}" --strip-components=1
  fi

  ok "Anvil downloaded to ${ANVIL_DIR}"
}

# ── Generate Configuration ──

generate_config() {
  log "Generating configuration..."

  # Generate secrets
  DB_PASSWORD=$(openssl rand -hex 16)
  REDIS_PASSWORD=$(openssl rand -hex 16)
  MINIO_PASSWORD=$(openssl rand -hex 16)
  MEILI_KEY=$(openssl rand -hex 16)
  KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -hex 16)
  SESSION_SECRET=$(openssl rand -hex 32)
  JWT_SECRET=$(openssl rand -hex 32)
  MINIO_KMS_KEY=$(openssl rand -hex 32)

  # Domain setup
  if [[ -z "${ANVIL_DOMAIN}" ]]; then
    ANVIL_DOMAIN="$(hostname -f 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"
    warn "No domain specified. Using: ${ANVIL_DOMAIN}"
  fi

  cat > "${ANVIL_DIR}/.env" <<EOF
# ── Anvil Configuration ──
# Generated by install script on $(date -Iseconds)
# ⚠️  Keep this file secret! Contains passwords and keys.

# Domain
ANVIL_DOMAIN=${ANVIL_DOMAIN}
ANVIL_EMAIL=${ANVIL_EMAIL}

# Database
DB_USER=anvil
DB_PASSWORD=${DB_PASSWORD}
POSTGRES_URL=postgresql://anvil:${DB_PASSWORD}@postgres:5432/anvil

# Redis
REDIS_URL=redis://valkey:${REDIS_PASSWORD}@redis:6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# MinIO
MINIO_USER=anvil_minio
MINIO_PASSWORD=${MINIO_PASSWORD}
MINIO_ENDPOINT=minio:9000
MINIO_KMS_KEY=${MINIO_KMS_KEY}

# Meilisearch
MEILI_KEY=${MEILI_KEY}

# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=anvil
KEYCLOAK_CLIENT_ID=anvil-app
KEYCLOAK_CLIENT_SECRET=$(openssl rand -hex 16)

# Auth
AUTH_SESSION_SECRET=${SESSION_SECRET}
JWT_SECRET=${JWT_SECRET}

# Plan
ANVIL_PLAN=${ANVIL_PLAN}
EOF

  $SUDO chmod 600 "${ANVIL_DIR}/.env"
  ok "Configuration generated at ${ANVIL_DIR}/.env"
}

# ── Start Services ──

start_services() {
  log "Starting Anvil services..."

  cd "${ANVIL_DIR}/repo" 2>/dev/null || cd "${ANVIL_DIR}"

  # Use the appropriate compose file
  COMPOSE_FILE="docker-compose.yml"
  if [[ "${ANVIL_PLAN}" == "enterprise" ]]; then
    COMPOSE_FILE="infra/compliance/soc2/docker-compose.yml"
  fi

  $SUDO docker compose --env-file "${ANVIL_DIR}/.env" -f "${COMPOSE_FILE}" pull 2>/dev/null || true
  $SUDO docker compose --env-file "${ANVIL_DIR}/.env" -f "${COMPOSE_FILE}" up -d

  ok "Services started"
}

# ── Wait for Healthy ──

wait_for_healthy() {
  log "Waiting for services to be healthy..."

  local retries=30
  while [[ $retries -gt 0 ]]; do
    if curl -sf "http://localhost:8080/health/ready" &>/dev/null; then
      ok "All services healthy"
      return 0
    fi
    retries=$((retries - 1))
    sleep 5
  done

  warn "Services may still be starting. Check status with: docker compose ps"
}

# ── Print Summary ──

print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${GREEN}  Anvil is installed and running!${NC}"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  ${BOLD}URL:${NC}         https://${ANVIL_DOMAIN}"
  echo -e "  ${BOLD}Admin Panel:${NC} https://${ANVIL_DOMAIN}/admin"
  echo -e "  ${BOLD}Keycloak:${NC}    https://${ANVIL_DOMAIN}:8080"
  echo ""
  echo -e "  ${BOLD}Admin User:${NC}     admin"
  echo -e "  ${BOLD}Admin Password:${NC} (see ${ANVIL_DIR}/.env)"
  echo ""
  echo -e "  ${YELLOW}Important:${NC}"
  echo -e "  • Save your .env file securely: ${ANVIL_DIR}/.env"
  echo -e "  • Configure DNS to point ${ANVIL_DOMAIN} to this server"
  echo -e "  • Enable TLS with: sudo certbot --nginx -d ${ANVIL_DOMAIN}"
  echo ""
  echo -e "  ${BOLD}Quick commands:${NC}"
  echo -e "  docker compose -f ${ANVIL_DIR}/repo/docker-compose.yml logs -f   # View logs"
  echo -e "  docker compose -f ${ANVIL_DIR}/repo/docker-compose.yml ps          # Status"
  echo -e "  docker compose -f ${ANVIL_DIR}/repo/docker-compose.yml down        # Stop"
  echo ""
  echo -e "  ${BLUE}Docs:${NC} https://docs.anvil.dev  |  ${BLUE}GitHub:${NC} https://github.com/anvil-org/anvil"
  echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Main ──

main() {
  echo -e "${BOLD}"
  echo -e "  🔨 Anvil — Self-Hosted Productivity Suite"
  echo -e "  ${NC}Open source Google Workspace alternative"
  echo ""

  parse_args "$@"
  preflight
  install_deps
  download_anvil
  generate_config
  start_services
  wait_for_healthy
  print_summary
}

main "$@"

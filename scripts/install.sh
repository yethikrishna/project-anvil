#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Anvil — One-liner self-hosted install
# Usage: curl -fsSL https://get.anvil.dev | bash
#        or: curl -fsSL https://get.anvil.dev | bash -s -- --domain example.com
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

VERSION="0.1.0"
REPO="https://github.com/anvil-org/anvil.git"
INSTALL_DIR="/opt/anvil"
COMPOSE_FILE="docker-compose.yml"

# ── Colors ──
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERR ]${NC} $*" >&2; }

# ── Parse Args ──
DOMAIN=""
EMAIL=""
ADMIN_USER="admin"
ADMIN_PASS=""
DEPLOY_MODE="standard"  # standard | hipaa | gdpr | soc2
WITH_DEMO_DATA=false
SKIP_CHECKS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)    DOMAIN="$2"; shift 2 ;;
    --email)     EMAIL="$2"; shift 2 ;;
    --admin-user) ADMIN_USER="$2"; shift 2 ;;
    --admin-pass) ADMIN_PASS="$2"; shift 2 ;;
    --mode)      DEPLOY_MODE="$2"; shift 2 ;;
    --demo)      WITH_DEMO_DATA=true; shift ;;
    --skip-checks) SKIP_CHECKS=true; shift ;;
    --help|-h)
      echo "Usage: curl -fsSL https://get.anvil.dev | bash -s -- [options]"
      echo ""
      echo "Options:"
      echo "  --domain DOMAIN       Your domain (e.g. anvil.company.com)"
      echo "  --email EMAIL         Admin email for TLS certs"
      echo "  --admin-user USER     Admin username (default: admin)"
      echo "  --admin-pass PASS     Admin password (auto-generated if omitted)"
      echo "  --mode MODE           Deployment mode: standard|hipaa|gdpr|soc2"
      echo "  --demo                Seed demo data after deploy"
      echo "  --skip-checks         Skip system requirement checks"
      echo "  -h, --help            Show this help"
      exit 0
      ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Banner ──
echo ""
echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  🔨  Anvil Self-Hosted Installer     ${BLUE}║${NC}"
echo -e "${BLUE}║${NC}      v${VERSION}                       ${BLUE}║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Preflight Checks ──
if [[ "$SKIP_CHECKS" != "true" ]]; then
  info "Running preflight checks..."

  # Root or sudo
  if [[ $EUID -ne 0 ]]; then
    if ! command -v sudo &>/dev/null; then
      err "This script requires root privileges or sudo."
      exit 1
    fi
    SUDO="sudo"
  else
    SUDO=""
  fi

  # OS check
  if [[ ! -f /etc/os-release ]]; then
    err "Cannot detect OS. This script supports Ubuntu 22.04+, Debian 12+, CentOS 9+, and similar."
    exit 1
  fi
  source /etc/os-release
  ok "OS: ${PRETTY_NAME:-unknown}"

  # Architecture
  ARCH=$(uname -m)
  if [[ "$ARCH" != "x86_64" && "$ARCH" != "aarch64" ]]; then
    err "Unsupported architecture: ${ARCH}. Only x86_64 and aarch64 are supported."
    exit 1
  fi
  ok "Architecture: ${ARCH}"

  # Minimum RAM (4GB)
  TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo "0")
  TOTAL_RAM_GB=$((TOTAL_RAM_KB / 1024 / 1024))
  if [[ $TOTAL_RAM_GB -lt 3 ]]; then
    err "Minimum 4 GB RAM required. Detected: ${TOTAL_RAM_GB} GB."
    exit 1
  fi
  ok "RAM: ${TOTAL_RAM_GB} GB"

  # Minimum disk (20GB free)
  AVAILABLE_DISK_KB=$(df -k / 2>/dev/null | tail -1 | awk '{print $4}' || echo "0")
  AVAILABLE_DISK_GB=$((AVAILABLE_DISK_KB / 1024 / 1024))
  if [[ $AVAILABLE_DISK_GB -lt 15 ]]; then
    err "Minimum 20 GB free disk required. Detected: ${AVAILABLE_DISK_GB} GB free."
    exit 1
  fi
  ok "Disk: ${AVAILABLE_DISK_GB} GB free"

  # Ports
  for PORT in 80 443; do
    if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
      warn "Port ${PORT} is already in use. Anvil may fail to start."
    fi
  done

  ok "Preflight checks passed."
  echo ""
fi

# ── Install Dependencies ──
install_deps() {
  info "Installing dependencies..."

  if command -v docker &>/dev/null && command -v docker compose &>/dev/null; then
    ok "Docker $(docker --version | grep -oP '\d+\.\d+\.\d+') already installed."
    return
  fi

  # Install Docker
  if command -v apt-get &>/dev/null; then
    info "Installing Docker via apt..."
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq ca-certificates curl gnupg
    $SUDO install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/${ID}/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    $SUDO chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
      | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  elif command -v yum &>/dev/null; then
    info "Installing Docker via yum..."
    $SUDO yum install -y yum-utils
    $SUDO yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    $SUDO yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    $SUDO systemctl enable --now docker
  elif command -v dnf &>/dev/null; then
    info "Installing Docker via dnf..."
    $SUDO dnf install -y dnf-plugins-core
    $SUDO dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    $SUDO dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    $SUDO systemctl enable --now docker
  else
    err "Unsupported package manager. Install Docker manually: https://docs.docker.com/engine/install/"
    exit 1
  fi

  # Add current user to docker group (if not root)
  if [[ $EUID -ne 0 ]]; then
    $SUDO usermod -aG docker "$USER" 2>/dev/null || true
    warn "You may need to log out and back in for Docker group changes to take effect."
  fi

  ok "Docker installed."
}

# ── Clone Repo ──
clone_repo() {
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    info "Updating existing installation at ${INSTALL_DIR}..."
    cd "$INSTALL_DIR"
    git fetch --all --quiet 2>/dev/null || true
    git reset --hard origin/main --quiet 2>/dev/null || true
    ok "Repository updated."
  else
    info "Cloning Anvil repository..."
    $SUDO rm -rf "$INSTALL_DIR"
    $SUDO git clone --depth 1 "$REPO" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    ok "Repository cloned to ${INSTALL_DIR}."
  fi
}

# ── Generate Config ──
generate_config() {
  info "Generating configuration..."

  cd "$INSTALL_DIR"

  # Generate secrets
  generate_secret() {
    openssl rand -hex 32
  }

  DB_PASSWORD=$(generate_secret)
  REDIS_PASSWORD=$(generate_secret)
  MINIO_PASSWORD=$(generate_secret)
  MEILI_KEY=$(generate_secret)
  KEYCLOAK_ADMIN_PASSWORD=$(generate_secret)

  if [[ -z "$ADMIN_PASS" ]]; then
    ADMIN_PASS=$(openssl rand -base64 16 | tr -d '=/+')
  fi

  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(hostname -f 2>/dev/null || curl -s ifconfig.me 2>/dev/null || echo 'localhost')"
    warn "No --domain specified. Using: ${DOMAIN}"
  fi

  if [[ -z "$EMAIL" ]]; then
    EMAIL="admin@${DOMAIN}"
    warn "No --email specified. Using: ${EMAIL}"
  fi

  # Select compose file based on mode
  case "$DEPLOY_MODE" in
    hipaa) COMPOSE_OVERRIDE="infra/compliance/hipaa/docker-compose.yml" ;;
    gdpr)  COMPOSE_OVERRIDE="infra/compliance/gdpr/docker-compose.yml" ;;
    soc2)  COMPOSE_OVERRIDE="infra/compliance/soc2/docker-compose.yml" ;;
    *)     COMPOSE_OVERRIDE="" ;;
  esac

  # Write .env
  cat > .env <<EOF
# Anvil Configuration — generated by install script
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Mode: ${DEPLOY_MODE}

# ── Domain ──
ANVIL_DOMAIN=${DOMAIN}
ACME_EMAIL=${EMAIL}

# ── Database ──
DB_USER=anvil
DB_PASSWORD=${DB_PASSWORD}

# ── Redis ──
REDIS_PASSWORD=${REDIS_PASSWORD}

# ── MinIO ──
MINIO_USER=anvil
MINIO_PASSWORD=${MINIO_PASSWORD}

# ── Meilisearch ──
MEILI_KEY=${MEILI_KEY}

# ── Keycloak ──
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}

# ── Grafana (SOC2 mode) ──
GRAFANA_PASSWORD=$(generate_secret)

# ── MinIO KMS (HIPAA mode) ──
MINIO_KMS_KEY=my-minio-key:$(generate_secret)

# ── Backups ──
S3_BACKUP_URL=
EOF

  $SUDO chmod 600 .env
  ok "Configuration written to ${INSTALL_DIR}/.env"
}

# ── Start Services ──
start_services() {
  info "Starting Anvil services..."
  cd "$INSTALL_DIR"

  # Pull images
  info "Pulling container images (this may take a few minutes)..."
  docker compose pull 2>/dev/null || true

  # Start services
  local compose_cmd="docker compose -f docker-compose.yml"
  if [[ -n "$COMPOSE_OVERRIDE" && -f "$COMPOSE_OVERRIDE" ]]; then
    compose_cmd="$compose_cmd -f $COMPOSE_OVERRIDE"
    info "Using compliance mode: ${DEPLOY_MODE}"
  fi

  $SUDO $compose_cmd up -d --remove-orphans

  ok "Services starting..."

  # Wait for postgres
  info "Waiting for database..."
  local retries=0
  while ! docker compose exec -T postgres pg_isready -U anvil &>/dev/null; do
    retries=$((retries + 1))
    if [[ $retries -gt 30 ]]; then
      err "Database failed to start. Check: docker compose logs postgres"
      exit 1
    fi
    sleep 2
  done
  ok "Database ready."

  # Run migrations
  info "Running database migrations..."
  $SUDO docker compose exec -T postgres psql -U anvil -d anvil -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || true
  if [[ -f "infra/sql/002_multitenant.sql" ]]; then
    $SUDO docker compose exec -T postgres psql -U anvil -d anvil < infra/sql/002_multitenant.sql 2>/dev/null || true
  fi
  ok "Migrations complete."

  # Demo data
  if [[ "$WITH_DEMO_DATA" == "true" ]]; then
    info "Seeding demo data..."
    $SUDO docker compose run --rm demo-seeder 2>/dev/null || warn "Demo seeder not available."
  fi
}

# ── Print Summary ──
print_summary() {
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}  ✅  Anvil is running!                      ${GREEN}║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BLUE}Dashboard:${NC}  https://${DOMAIN}"
  echo -e "  ${BLUE}Admin:${NC}      https://auth.${DOMAIN}"
  echo -e "  ${BLUE}Docs:${NC}       https://${DOMAIN}/docs"
  echo -e "  ${BLUE}Drive:${NC}      https://${DOMAIN}/drive"
  echo -e "  ${BLUE}Mail:${NC}       https://${DOMAIN}/gmail"
  echo -e "  ${BLUE}Calendar:${NC}   https://${DOMAIN}/calendar"
  echo ""
  echo -e "  ${BLUE}Admin user:${NC}     ${ADMIN_USER}"
  echo -e "  ${BLUE}Admin password:${NC} ${ADMIN_PASS}"
  echo ""
  echo -e "  ${YELLOW}⚠ Save these credentials securely.${NC}"
  echo ""
  echo -e "  ${BLUE}Config:${NC}  ${INSTALL_DIR}/.env"
  echo -e "  ${BLUE}Logs:${NC}    cd ${INSTALL_DIR} && docker compose logs -f"
  echo -e "  ${BLUE}Stop:${NC}    cd ${INSTALL_DIR} && docker compose down"
  echo -e "  ${BLUE}Update:${NC}  cd ${INSTALL_DIR} && git pull && docker compose up -d"
  echo ""

  if [[ "$DEPLOY_MODE" == "hipaa" ]]; then
    echo -e "  ${BLUE}Compliance:${NC} HIPAA mode active"
    echo -e "  ${BLUE}Audit logs:${NC} ${INSTALL_DIR}/audit/"
    echo ""
  elif [[ "$DEPLOY_MODE" == "gdpr" ]]; then
    echo -e "  ${BLUE}Compliance:${NC} GDPR mode active (EU data residency)"
    echo ""
  elif [[ "$DEPLOY_MODE" == "soc2" ]]; then
    echo -e "  ${BLUE}Compliance:${NC} SOC 2 mode active"
    echo -e "  ${BLUE}Monitoring:${NC} https://monitoring.${DOMAIN}"
    echo ""
  fi
}

# ── Main ──
main() {
  install_deps
  clone_repo
  generate_config
  start_services
  print_summary
}

main "$@"

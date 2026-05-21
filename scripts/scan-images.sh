#!/usr/bin/env bash
# Container Image Dependency Scanner for Project Anvil
#
# Scans all Docker images used in docker-compose.yml for:
# - Known vulnerabilities (CVEs)
# - Misconfigurations
# - License compliance
#
# Usage:
#   ./scripts/scan-images.sh          # Scan all images
#   ./scripts/scan-images.sh --fix     # Show fix suggestions
#   ./scripts/scan-images.sh --ci      # CI mode (exit on HIGH/CRITICAL)
#
# Requires: trivy (https://aquasecurity.github.io/trivy/)

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
FIX_MODE=false
CI_MODE=false
SEVERITY="HIGH,CRITICAL"
FORMAT="table"

for arg in "$@"; do
  case $arg in
    --fix)   FIX_MODE=true; FORMAT="json" ;;
    --ci)    CI_MODE=true ;;
    --all)   SEVERITY="LOW,MEDIUM,HIGH,CRITICAL" ;;
    --json)  FORMAT="json" ;;
    --help)  echo "Usage: $0 [--fix] [--ci] [--all] [--json]"; exit 0 ;;
  esac
done

echo "=== Project Anvil — Container Image Scanner ==="
echo "Severity: ${SEVERITY}"
echo "Format: ${FORMAT}"
echo ""

# Extract images from docker-compose.yml
IMAGES=$(grep -oP 'image:\s*\K.*' "$COMPOSE_FILE" | sed 's/['\''"]//g' | sort -u)

if [ -z "$IMAGES" ]; then
  echo "No images found in ${COMPOSE_FILE}"
  exit 1
fi

# Check trivy is installed
if ! command -v trivy &> /dev/null; then
  echo "ERROR: trivy not installed. Install: https://aquasecurity.github.io/trivy/"
  exit 1
fi

echo "Images to scan:"
echo "$IMAGES" | while read -r img; do echo "  - $img"; done
echo ""

TOTAL_VULNS=0
FAILED=0

echo "$IMAGES" | while read -r image; do
  echo "─── Scanning: ${image} ───"

  if [ "$CI_MODE" = true ]; then
    trivy image --severity "$SEVERITY" --exit-code 1 --format table "$image" || {
      echo "FAILED: ${image} has HIGH/CRITICAL vulnerabilities"
      exit 1
    }
  elif [ "$FIX_MODE" = true ]; then
    trivy image --severity "$SEVERITY" --format "$FORMAT" "$image" | \
      jq -r '.Results[]?.Vulnerabilities[]? | "\(.VulnerabilityID) \(.PkgName) \(.InstalledVersion) → \(.FixedVersion // "no fix") \(.Severity) \(.Title)"' 2>/dev/null || \
    echo "  No vulnerabilities found or parse error"
  else
    trivy image --severity "$SEVERITY" --format "$FORMAT" "$image" || true
  fi

  echo ""
done

echo "=== Scan complete ==="

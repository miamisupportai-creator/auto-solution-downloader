#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env"

echo ""
echo "=== ai-system credentials setup ==="
echo ""

# ─── load existing values as defaults ────────────────────────────────────────
CURRENT_GITHUB=""
CURRENT_N8N_URL="http://localhost:5678/rest/workflows"
CURRENT_N8N_KEY=""

if [[ -f "$ENV_FILE" ]]; then
  CURRENT_GITHUB=$(grep -E '^GITHUB_TOKEN=' "$ENV_FILE" | cut -d'=' -f2 || true)
  CURRENT_N8N_URL=$(grep -E '^N8N_API_URL=' "$ENV_FILE" | cut -d'=' -f2 || echo "http://localhost:5678/rest/workflows")
  CURRENT_N8N_KEY=$(grep -E '^N8N_API_KEY=' "$ENV_FILE" | cut -d'=' -f2 || true)
fi

# ─── prompts ─────────────────────────────────────────────────────────────────
prompt_value() {
  local label="$1"
  local current="$2"
  local secret="${3:-false}"

  if [[ -n "$current" ]]; then
    local display
    if [[ "$secret" == "true" ]]; then
      display="${current:0:8}..."
    else
      display="$current"
    fi
    echo -n "${label} [${display}]: "
  else
    echo -n "${label}: "
  fi

  if [[ "$secret" == "true" ]]; then
    read -rs INPUT
    echo ""
  else
    read -r INPUT
  fi

  if [[ -z "$INPUT" && -n "$current" ]]; then
    INPUT="$current"
  fi

  echo "$INPUT"
}

GITHUB_TOKEN=$(prompt_value "GITHUB_TOKEN (ghp_...)" "$CURRENT_GITHUB" true)
N8N_API_URL=$(prompt_value  "N8N_API_URL" "$CURRENT_N8N_URL" false)
N8N_API_KEY=$(prompt_value  "N8N_API_KEY" "$CURRENT_N8N_KEY" true)

# ─── validate GITHUB token ───────────────────────────────────────────────────
echo ""
echo -n "Validating GITHUB_TOKEN... "

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/user")

if [[ "$STATUS" == "200" ]]; then
  LOGIN=$(curl -s \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/user" | node -e "process.stdin.setEncoding('utf-8'); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).login))")
  echo "OK (${LOGIN})"
else
  echo "FAILED (HTTP ${STATUS})"
  echo "  → Check token at: https://github.com/settings/tokens"
  echo "  → Minimum scope required: public_repo"
  exit 1
fi

# ─── validate n8n (optional — may not be running locally) ────────────────────
echo -n "Validating N8N_API_KEY... "

N8N_BASE=$(echo "$N8N_API_URL" | sed 's|/rest/workflows||')
N8N_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  "${N8N_BASE}/rest/workflows" 2>/dev/null || echo "000")

if [[ "$N8N_STATUS" == "200" ]]; then
  echo "OK"
elif [[ "$N8N_STATUS" == "000" ]]; then
  echo "UNREACHABLE (n8n not running locally — OK if running on VPS)"
else
  echo "FAILED (HTTP ${N8N_STATUS}) — check API key in n8n Settings → API"
fi

# ─── write .env ───────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
GITHUB_TOKEN=${GITHUB_TOKEN}
N8N_API_URL=${N8N_API_URL}
N8N_API_KEY=${N8N_API_KEY}
EOF

chmod 600 "$ENV_FILE"
echo ""
echo ".env saved → ${ENV_FILE}"
echo ""
echo "Next: npm install && npm start"
echo ""

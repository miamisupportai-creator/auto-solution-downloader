#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/logs/cron.log"
NODE_BIN="$(which node)"
CRON_JOB="0 */6 * * * cd \"${SCRIPT_DIR}\" && ${NODE_BIN} agent-runner.js >> \"${LOG_FILE}\" 2>&1"

mkdir -p "${SCRIPT_DIR}/logs"

# Remove old ai-system cron entry if exists, then add new one
EXISTING=$(crontab -l 2>/dev/null || true)
CLEANED=$(echo "$EXISTING" | grep -v "ai-system\|agent-runner" || true)
printf "%s\n%s\n" "$CLEANED" "$CRON_JOB" | crontab -

echo ""
echo "=== cron configured ==="
echo ""
echo "Schedule : every 6h (00:00 / 06:00 / 12:00 / 18:00)"
echo "Command  : node agent-runner.js"
echo "Log      : ${LOG_FILE}"
echo ""
echo "Active cron entries:"
crontab -l 2>/dev/null | grep -v "^#" || echo "  (none besides ai-system)"
echo ""
echo "Done. System runs automatically."

#!/usr/bin/env bash
set -euo pipefail

# Usage: claude-analyzer.sh <filtered_file> <output_file>

FILTERED_FILE="$1"
OUTPUT_FILE="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/claude-task.txt"
MAX_ATTEMPTS=3

if [[ ! -f "$FILTERED_FILE" ]]; then
  echo "ERROR: filtered file not found: $FILTERED_FILE" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "ERROR: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

PROMPT=$(cat "$PROMPT_FILE")
CONTENT=$(cat "$FILTERED_FILE")

FULL_PROMPT="${PROMPT}

---

${CONTENT}

---

Return ONLY a valid n8n workflow JSON object. No markdown fences. No explanation. No extra text. Raw JSON only."

# ─── JSON extractor / validator ───────────────────────────────────────────────
validate_json() {
  local file="$1"
  node -e "
    const raw = require('fs').readFileSync('$file', 'utf-8').trim();

    // Direct parse
    try { JSON.parse(raw); process.exit(0); } catch (_) {}

    // Strip markdown fences
    const fenced = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/);
    if (fenced) {
      try {
        JSON.parse(fenced[1]);
        require('fs').writeFileSync('$file', fenced[1].trim());
        process.exit(0);
      } catch (_) {}
    }

    // Extract first top-level JSON object
    const obj = raw.match(/(\{[\s\S]*\})/);
    if (obj) {
      try {
        JSON.parse(obj[1]);
        require('fs').writeFileSync('$file', obj[1].trim());
        process.exit(0);
      } catch (_) {}
    }

    process.exit(1);
  " 2>/dev/null
}

# ─── retry loop ──────────────────────────────────────────────────────────────
for attempt in $(seq 1 $MAX_ATTEMPTS); do
  echo "  attempt ${attempt}/${MAX_ATTEMPTS}..."

  echo "$FULL_PROMPT" | claude -p --output-format text > "$OUTPUT_FILE" 2>/dev/null || true

  if validate_json "$OUTPUT_FILE"; then
    echo "OK: $OUTPUT_FILE"
    exit 0
  fi

  echo "  invalid JSON on attempt ${attempt}" >&2

  # On retries, reinforce the instruction
  FULL_PROMPT="${FULL_PROMPT}

IMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object. No text before or after."
done

echo "ERROR: failed after ${MAX_ATTEMPTS} attempts" >&2
rm -f "$OUTPUT_FILE"
exit 1

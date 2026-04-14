#!/usr/bin/env bash
# ============================================================
# run-migration.sh — Ejecutar migración SQL en Cloud SQL
# AI50M — Jarvis v3
# Usage: bash scripts/run-migration.sh
# ============================================================

set -e

PROJECT_ID="project-5ce986c0-b74f-47fa-bed"
INSTANCE="leads-db"
DB_USER="leads_user"
MIGRATION_FILE="db/migrations/001-jarvis-enhancements.sql"

echo "🚀 AI50M — Jarvis v3 Database Migration"
echo "─────────────────────────────────────────"

# Check gcloud is installed
if ! command -v gcloud &>/dev/null; then
  echo "❌ gcloud not installed. Run: brew install google-cloud-sdk"
  exit 1
fi

echo "✅ gcloud found"
echo "📦 Connecting to Cloud SQL instance: $INSTANCE"
echo "📄 Running migration: $MIGRATION_FILE"
echo ""

# Run the migration
gcloud sql connect "$INSTANCE" \
  --user="$DB_USER" \
  --project="$PROJECT_ID" \
  < "$MIGRATION_FILE"

echo ""
echo "✅ Migration complete!"
echo "   Tables created:"
echo "   • jarvis_config"
echo "   • audio_messages"
echo "   • image_messages"
echo "   • conversation_memory"
echo "   • llm_calls"

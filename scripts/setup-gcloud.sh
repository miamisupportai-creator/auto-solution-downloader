#!/bin/bash
# setup-gcloud.sh — Run this once locally after installing gcloud CLI
# https://cloud.google.com/sdk/docs/install-sdk

set -e

PROJECT_ID="project-5ce986c0-b74f-47fa-bed"
REGION="us-central1"
REGISTRY="n8n-workflows"

echo "═══════════════════════════════════════════"
echo "  ai50m — GCP Setup Script"
echo "  Project: $PROJECT_ID"
echo "═══════════════════════════════════════════"

# Set project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "▶ Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

# Create Artifact Registry
echo "▶ Creating Artifact Registry..."
gcloud artifacts repositories create $REGISTRY \
  --repository-format=docker \
  --location=$REGION \
  --description="ai50m containers" 2>/dev/null || echo "Registry already exists"

# Create service account for GitHub Actions
echo "▶ Creating service account..."
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions SA" 2>/dev/null || echo "SA already exists"

SA_EMAIL="github-actions-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" --quiet

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudscheduler.admin" --quiet

# Create and download key
echo "▶ Creating SA key..."
gcloud iam service-accounts keys create /tmp/gcp-sa-key.json \
  --iam-account=$SA_EMAIL

echo ""
echo "✅ GCP setup complete!"
echo ""
echo "Next step: Add GCP_SA_KEY to GitHub Secrets"
echo "Run this command and paste the output as the GCP_SA_KEY secret:"
echo ""
echo "  cat /tmp/gcp-sa-key.json | base64 | pbcopy"
echo ""
echo "Then paste in: https://github.com/miamisupportai-creator/auto-solution-downloader/settings/secrets/actions"

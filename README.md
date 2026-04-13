# 🤖 auto-solution-downloader

Sistema 24/7 que descarga e instala soluciones de automatización para clientes

![Status](https://img.shields.io/badge/status-production-brightgreen)
![Node](https://img.shields.io/badge/node-20+-blue)
![Zero deps](https://img.shields.io/badge/dependencies-zero-green)

---

## What It Does

1. **Receives client data** — via `CLIENT_DATA` env var (JSON) or GitHub Actions trigger
2. **Maps needs to repos** — looks up each client need in the solutions registry
3. **Downloads workflows** — fetches `workflow.json` from GitHub raw (with fallback template on 404)
4. **Personalizes** — replaces `${CLIENT_ID}`, `${CLIENT_NAME}`, etc. in every workflow
5. **Saves locally** — creates `clients/{id}/{need}/workflow.json` + `DEPLOYMENT_SUMMARY.md`
6. **Deploys to n8n** — POSTs to n8n cloud API (if configured)
7. **Commits & pushes** — auto-commits the `clients/` directory to this repo

---

## Features

✅ Zero npm dependencies — only Node.js built-ins (fs, path, https, child_process)
✅ Runs every hour via GitHub Actions cron (24/7)
✅ Triggered on demand via `repository_dispatch` from Zoho/Zapier/n8n
✅ Fallback template when source repo does not exist yet
✅ Variable injection per client (CLIENT_ID, CLIENT_NAME, CLIENT_EMAIL, CLIENT_PHONE, BUDGET)
✅ Auto-deploys to n8n Cloud API when credentials are configured
✅ Generates `DEPLOYMENT_SUMMARY.md` with activation steps per solution
✅ Redirect-following HTTPS client (no external deps needed)
✅ Git auto-commit with descriptive message per client
✅ Graceful error handling — warnings do not stop the full run

---

## Cost

| Item | Cost |
|------|------|
| GitHub Actions (2000 min/month free) | $0.00 |
| Node.js execution | $0.00 |
| Per client processed | **~$0.02** |

---

## Quick Setup

**Step 1: Fork or clone this repo**
```bash
git clone https://github.com/miamisupportai-creator/auto-solution-downloader
cd auto-solution-downloader
```

**Step 2: Copy env file**
```bash
cp .env.example .env
# Edit .env with your values
```

**Step 3: Add GitHub Secrets** (Settings → Secrets → Actions)
```
GH_TOKEN          → your GitHub PAT
ANTHROPIC_API_KEY → your Anthropic key
N8N_API_URL       → https://ai50m.app.n8n.cloud/api/v1/workflows
N8N_API_KEY       → your n8n JWT key
```

**Step 4: Test locally**
```bash
export GITHUB_TOKEN=ghp_xxx
export CLIENT_DATA='{"id":"client_001","name":"Test Co","email":"test@test.com","phone":"+13055550000","needs":["lead-qualification"],"budget":5000}'
node auto-solution-downloader.js
```

**Step 5: Enable GitHub Actions**
The workflow runs automatically every hour. Trigger manually: Actions → Auto-Download Solutions 24/7 → Run workflow.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        TRIGGER SOURCES                       │
├──────────────┬──────────────────┬───────────────────────────┤
│  Zoho CRM    │  Manual trigger  │   GitHub Actions cron     │
│  webhook     │  (workflow_disp) │   (every hour)            │
└──────┬───────┴────────┬─────────┴──────────┬────────────────┘
       │                │                    │
       ▼                ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│              GitHub Actions: auto-download job               │
│                  (ubuntu-latest, Node 20)                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              auto-solution-downloader.js                     │
│                                                             │
│  1. Parse CLIENT_DATA                                       │
│  2. For each need:                                          │
│     a. Fetch workflow.json from GitHub raw                  │
│     b. Fallback to template if 404                          │
│     c. Replace CLIENT_* variables                           │
│     d. Save to clients/{id}/{need}/                         │
│     e. Generate DEPLOYMENT_SUMMARY.md                       │
│     f. POST to n8n Cloud API                                │
│  3. git add + commit + push                                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   ┌──────────────────┐       ┌──────────────────────┐
   │   n8n Cloud      │       │  GitHub Repo          │
   │  (workflow live) │       │  clients/ directory   │
   └──────────────────┘       └──────────────────────┘
```

---

## Available Solutions

| Solution Key | Repo | Description |
|---|---|---|
| `lead-qualification` | n8n-lead-qualification | WhatsApp + AI lead scoring |
| `email-automation` | n8n-email-automation | Drip email sequences |
| `crm-sync` | n8n-crm-sync | Zoho CRM synchronization |
| `order-processing` | n8n-order-processing | Automated order fulfillment |
| `customer-support` | n8n-customer-support | AI-powered support bot |
| `reporting` | n8n-reporting | Automated analytics reports |

---

## Documentation

- [Setup Guide (ES)](docs/SETUP_GUIDE.md)
- [Architecture (ES)](docs/ARCHITECTURE.md)
- [Cost Analysis (ES)](docs/COST_ANALYSIS.md)
- [Configuration Reference](CLAUDE.md)

---

Made with Claude Code | [ai50m.com](https://ai50m.com)
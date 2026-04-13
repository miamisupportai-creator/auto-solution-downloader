# Auto-Solution-Downloader — Claude Reference

## What This Repo Does

Automatically fetches n8n workflow templates from GitHub, personalizes them with client data, saves them locally, and optionally imports them to n8n via API. Triggered by GitHub Actions (manual or scheduled every 6h).

## Stack

- **Runtime**: Node.js 18+ (zero npm dependencies)
- **CI/CD**: GitHub Actions
- **Storage**: GitHub repo (clients/ directory)
- **Automation engine**: n8n Cloud

## Key Files

| File | Purpose |
|------|---------|
| `auto-solution-downloader.js` | Main script — fetch, substitute, save, push |
| `.github/workflows/claude-auto-download.yml` | GitHub Actions workflow |
| `docs/SETUP_GUIDE.md` | Setup instructions (Spanish) |
| `docs/ARCHITECTURE.md` | System architecture (Spanish) |
| `docs/COST_ANALYSIS.md` | Cost breakdown (Spanish) |

## Solutions Map

```
lead-qualification   → miamisupportai-creator/n8n-lead-qualification
email-automation     → miamisupportai-creator/n8n-email-automation
crm-sync             → miamisupportai-creator/n8n-crm-sync
order-processing     → miamisupportai-creator/n8n-order-processing
customer-support     → miamisupportai-creator/n8n-customer-support
reporting            → miamisupportai-creator/n8n-reporting
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | ✅ | GitHub PAT with repo + workflow scope |
| `CLIENT_DATA` | ✅ | JSON string with client info |
| `N8N_API_URL` | ❌ | n8n workflows API endpoint |
| `N8N_API_KEY` | ❌ | n8n API key |
| `ANTHROPIC_API_KEY` | ❌ | For future Claude integrations |

## CLIENT_DATA Schema

```json
{
  "id": "client_001",
  "name": "Client Name",
  "email": "client@example.com",
  "phone": "+13055550000",
  "needs": ["lead-qualification", "email-automation"],
  "budget": 2500
}
```

## Output Structure

```
clients/
  {client_id}/
    {solution}/
      workflow.json          ← personalized n8n workflow
      DEPLOYMENT_SUMMARY.md  ← deployment steps
```

## Dev Notes

- Script uses only Node.js built-ins: `https`, `fs`, `path`, `child_process`, `process`
- All HTTP via `https.request` / `https.get` — no fetch, no axios
- Git operations via `execSync`
- The `clients/` directory is git-tracked (included in commits)
- `.env` is gitignored — never commit real tokens

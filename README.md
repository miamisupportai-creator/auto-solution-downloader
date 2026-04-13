# ai-system — Auto Pipeline 24/7

Busca repos de GitHub → analiza con Claude → genera workflows n8n → importa automáticamente.

## Stack
- GitHub Actions (scheduler 24/7)
- Anthropic API (análisis)  
- n8n cloud (destino de workflows)

## Setup

```bash
npm install
cp .env.example .env
# Completar .env con tus keys
npm start
```

## GitHub Secrets requeridos

| Secret | Descripción |
|--------|-------------|
| `GH_TOKEN` | GitHub PAT con scopes: repo + workflow |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `N8N_API_URL` | https://ai50m.app.n8n.cloud/api/v1/workflows |
| `N8N_API_KEY` | n8n → Settings → API → Create key |

## Comandos

```bash
npm start          # pipeline manual
npm run status     # dashboard
npm run versions   # historial de versiones
```

## Cron automático
GitHub Actions: 00:00 / 06:00 / 12:00 / 18:00 UTC

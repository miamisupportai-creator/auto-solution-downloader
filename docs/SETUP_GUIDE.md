# Guía de Setup — auto-solution-downloader

## Prerrequisitos

- Node.js 20 o superior
- Git configurado localmente
- Cuenta GitHub con acceso al repo `miamisupportai-creator/auto-solution-downloader`
- (Opcional) Cuenta n8n Cloud activa

---

## Instalación

**Paso 1: Clonar el repositorio**
```bash
git clone https://github.com/miamisupportai-creator/auto-solution-downloader
cd auto-solution-downloader
```

**Paso 2: Copiar el archivo de variables de entorno**
```bash
cp .env.example .env
```

**Paso 3: Editar `.env` con tus credenciales reales**
```bash
nano .env
# o con VS Code:
code .env
```

**Paso 4: Verificar Node.js**
```bash
node --version
# Debe ser v20.x.x o superior
```

**Paso 5: Probar la ejecución local**
```bash
node auto-solution-downloader.js
```

---

## Configuración de Secrets

Ir a: GitHub → Settings → Secrets and variables → Actions → New repository secret

| Secret | Requerido | Cómo obtenerlo |
|--------|-----------|----------------|
| `GH_TOKEN` | ✅ | github.com → Settings → Developer settings → Personal access tokens → Tokens (classic) → scopes: `repo` + `workflow` |
| `ANTHROPIC_API_KEY` | ✅ | console.anthropic.com → API Keys |
| `N8N_API_URL` | ⚙️ Opcional | `https://tu-instancia.app.n8n.cloud/api/v1/workflows` |
| `N8N_API_KEY` | ⚙️ Opcional | n8n → Settings → n8n API → Create an API key |

---

## Testing Manual

Ejecutar con un cliente de prueba:

```bash
export GITHUB_TOKEN=ghp_tu_token_aqui
export CLIENT_DATA='{"id":"test_001","name":"Empresa Test","email":"test@empresa.com","phone":"+13055550000","needs":["lead-qualification","crm-sync"],"budget":5000}'

node auto-solution-downloader.js
```

**Resultado esperado:**
```
🤖 auto-solution-downloader starting
⚙️  Client: test_001 — Empresa Test
⚙️  Needs: lead-qualification, crm-sync

🤖 Processing solution: lead-qualification for client test_001
📥 Fetching: https://raw.githubusercontent.com/...
⚙️  Repo ... returned 404 — using fallback template
📋 Saved: clients/test_001/lead-qualification/workflow.json
📋 Saved: clients/test_001/lead-qualification/DEPLOYMENT_SUMMARY.md

✅ auto-solution-downloader completed successfully
```

---

## GitHub Actions Automático

El workflow `.github/workflows/claude-auto-download.yml` se ejecuta:

- **Cada hora** (cron `0 * * * *`)
- **On demand** desde la pestaña Actions → Run workflow
- **Por trigger externo** via `repository_dispatch` con event type `client-qualified`

### Trigger desde Zoho/n8n/Zapier

Enviar un POST a la GitHub API:

```bash
curl -X POST \
  -H "Authorization: Bearer GH_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/miamisupportai-creator/auto-solution-downloader/dispatches \
  -d '{"event_type":"client-qualified","client_payload":{"id":"cliente_123","name":"Empresa ABC","email":"abc@empresa.com","phone":"+13055550000","needs":["lead-qualification"],"budget":3000}}'
```

---

## Monitoreo

- Ver ejecuciones: GitHub → Actions → Auto-Download Solutions 24/7
- Ver archivos generados: GitHub → Code → `clients/` directory
- Logs de n8n: n8n Cloud → Executions

---

## Troubleshooting

### ❌ Error: GITHUB_TOKEN is required
**Causa:** La variable de entorno no está seteada.
**Solución:**
```bash
export GITHUB_TOKEN=ghp_tu_token
# o agregar al archivo .env
```

### ❌ Git push authentication failed
**Causa:** El token no tiene scope `repo` o `workflow`.
**Solución:** Regenerar token en GitHub con los scopes correctos: `repo` (full control) + `workflow`.

### ❌ n8n deploy failed: 401 Unauthorized
**Causa:** La `N8N_API_KEY` es incorrecta o expiró.
**Solución:** n8n → Settings → n8n API → revocar y crear nueva API key. Actualizar el secret en GitHub.

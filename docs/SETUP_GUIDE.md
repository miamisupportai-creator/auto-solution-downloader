# Guía de Configuración — Auto-Solution-Downloader

## Prerrequisitos

- Node.js >= 18 instalado localmente
- Cuenta de GitHub con acceso al repositorio
- Instancia de n8n (cloud o self-hosted) — **opcional para import automático**
- Token de GitHub con permisos `repo` y `workflow`

---

## Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/miamisupportai-creator/auto-solution-downloader.git
cd auto-solution-downloader

# 2. Copiar las variables de entorno
cp .env.example .env

# 3. Editar .env con tus valores reales
nano .env
```

---

## Configuración de Secrets

Para que **GitHub Actions** funcione, añade estos 4 secrets en:
`Settings → Secrets and variables → Actions → New repository secret`

| Secret            | Descripción                                           | Ejemplo                                      |
|-------------------|-------------------------------------------------------|----------------------------------------------|
| `GH_TOKEN`        | Token de GitHub con permisos repo + workflow          | `ghp_xxxxxxxxxxxx`                          |
| `ANTHROPIC_API_KEY`| Clave de API de Anthropic (Claude)                   | `sk-ant-xxxxxxxxxxxx`                       |
| `N8N_API_URL`     | URL del endpoint de workflows de n8n                 | `https://ai50m.app.n8n.cloud/api/v1/workflows`|
| `N8N_API_KEY`     | Clave de API de n8n                                   | `eyJ0eXAiOiJKV1QiLCJhbGci...`              |

> **Nota:** `N8N_API_URL` y `N8N_API_KEY` son opcionales. Si no se configuran, el sistema guarda los archivos localmente sin hacer import a n8n.

---

## Uso Manual

### Ejecución local

```bash
# Exportar variables de entorno
export GITHUB_TOKEN=ghp_xxxx
export CLIENT_DATA='{"id":"cliente_001","name":"Miami Dental","email":"info@miamidental.com","phone":"+13055550101","needs":["lead-qualification","email-automation"],"budget":2500}'

# Ejecutar
node auto-solution-downloader.js
```

### Resultado esperado

```
🤖  Processing client: Miami Dental (cliente_001)
📋  Needs: lead-qualification, email-automation

⚙️   Processing solution: lead-qualification
📥  Fetching workflow from https://raw.githubusercontent.com/...
✅  Saved clients/cliente_001/lead-qualification/workflow.json
📋  Saved clients/cliente_001/lead-qualification/DEPLOYMENT_SUMMARY.md

⚙️   Processing solution: email-automation
📥  Fetching workflow from https://raw.githubusercontent.com/...
✅  Saved clients/cliente_001/email-automation/workflow.json
📋  Saved clients/cliente_001/email-automation/DEPLOYMENT_SUMMARY.md

✅  Git push complete for client cliente_001
```

---

## Uso Automático (GitHub Actions)

### Ejecución manual desde GitHub

1. Ve a tu repositorio en GitHub
2. Haz clic en la pestaña **Actions**
3. Selecciona **"Auto-Download Solutions 24/7"**
4. Haz clic en **"Run workflow"**
5. Opcionalmente ingresa un `client_id` para filtrar
6. Haz clic en **"Run workflow"** (botón verde)

### Ejecución automática

El workflow se ejecuta automáticamente **cada 6 horas** gracias al schedule:

```yaml
schedule:
  - cron: "0 */6 * * *"
```

---

## Monitoreo

### Ver logs en GitHub Actions

1. Ve a **Actions** → selecciona el workflow run
2. Haz clic en el job `download-solutions`
3. Expande el paso **"Run auto-solution-downloader"**

### Revisar archivos generados

Los archivos se guardan en:

```
clients/
  {client_id}/
    {solution}/
      workflow.json          ← workflow listo para importar a n8n
      DEPLOYMENT_SUMMARY.md  ← resumen con pasos de deployment
```

### Alertas de error

Si un workflow falla, GitHub te notificará por email automáticamente (configurado en tu perfil de GitHub bajo **Notifications**).

# CLAUDE.md - Guía de Configuración

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| GITHUB_TOKEN | ✅ | GitHub PAT con scopes: repo + workflow |
| ANTHROPIC_API_KEY | ✅ | API key de console.anthropic.com |
| N8N_API_URL | ⚙️ | https://ai50m.app.n8n.cloud/api/v1/workflows |
| N8N_API_KEY | ⚙️ | JWT key de n8n Settings → API |
| CLIENT_DATA | ✅ | JSON con datos del cliente |

## Estructura CLIENT_DATA

```json
{
  "id": "client_123",
  "name": "Empresa ABC",
  "email": "contact@empresa.com",
  "phone": "+13055550000",
  "needs": ["lead-qualification", "crm-sync"],
  "budget": 5000
}
```

## Soluciones Disponibles

| Solución | Repo | Descripción |
|----------|------|-------------|
| lead-qualification | n8n-lead-qualification | WhatsApp + scoring |
| email-automation | n8n-email-automation | Secuencias de email |
| crm-sync | n8n-crm-sync | Sincronización CRM |
| order-processing | n8n-order-processing | Procesamiento de órdenes |
| customer-support | n8n-customer-support | Soporte con IA |
| reporting | n8n-reporting | Reportes automáticos |

## Variables Reemplazadas en Workflows

| Variable | Reemplazada por |
|----------|----------------|
| ${CLIENT_ID} | client.id |
| ${CLIENT_NAME} | client.name |
| ${CLIENT_EMAIL} | client.email |
| ${CLIENT_PHONE} | client.phone |
| ${BUDGET} | client.budget |

## Logging

| Emoji | Significado |
|-------|-------------|
| ✅ | Éxito |
| ❌ | Error |
| 🤖 | Operación con IA |
| 📥 | Descarga |
| ⚙️ | Configuración |
| 📋 | Documentación |

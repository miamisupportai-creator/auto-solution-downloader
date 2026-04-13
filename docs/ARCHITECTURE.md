# Arquitectura — auto-solution-downloader

## Descripción General

Sistema de descarga e instalación automatizada de workflows n8n para clientes de ai50m.
Corre 24/7 en GitHub Actions sin infraestructura propia. Costo mensual: $0.

---

## Diagrama Completo

```
                        ┌──────────────────┐
                        │    Zoho CRM      │
                        │  (nuevo lead)    │
                        └────────┬─────────┘
                                 │ repository_dispatch
                                 ▼
┌────────────────┐    ┌──────────────────────┐    ┌────────────────┐
│  Manual run    │───▶│   GitHub Actions     │◀───│  Cron: 0 * * * │
│ (workflow_disp)│    │  (ubuntu-latest)     │    │  (cada hora)   │
└────────────────┘    └──────────┬───────────┘    └────────────────┘
                                 │
                                 │ node auto-solution-downloader.js
                                 ▼
                    ┌────────────────────────────┐
                    │   auto-solution-downloader  │
                    │                            │
                    │  ┌──────────────────────┐  │
                    │  │  1. Parse CLIENT_DATA │  │
                    │  └──────────┬───────────┘  │
                    │             ▼              │
                    │  ┌──────────────────────┐  │
                    │  │  2. For each need:   │  │
                    │  │   • Lookup SOLUTIONS │  │
                    │  │   • Fetch from GitHub│  │
                    │  │   • Fallback template│  │
                    │  │   • Replace vars     │  │
                    │  │   • Save files       │  │
                    │  └──────────┬───────────┘  │
                    │             ▼              │
                    │  ┌──────────────────────┐  │
                    │  │  3. Deploy to n8n    │  │
                    │  │     (if configured)  │  │
                    │  └──────────┬───────────┘  │
                    │             ▼              │
                    │  ┌──────────────────────┐  │
                    │  │  4. git commit+push  │  │
                    │  └──────────────────────┘  │
                    └─────────────┬──────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               ▼                  ▼                  ▼
  ┌────────────────┐  ┌─────────────────┐  ┌──────────────────┐
  │   n8n Cloud    │  │  GitHub Repo    │  │  DEPLOYMENT      │
  │  (workflow     │  │  clients/       │  │  SUMMARY.md      │
  │   activo)      │  │  {id}/{need}/   │  │  (instrucciones) │
  └────────────────┘  └─────────────────┘  └──────────────────┘
```

---

## Componentes

### 1. auto-solution-downloader.js
Script principal en Node.js (ESM). Sin dependencias externas. Orquesta todo el proceso.

### 2. SOLUTIONS_MAP
Diccionario interno que mapea cada necesidad del cliente a un repo de GitHub con el workflow template.

### 3. HTTPS Client
Implementación manual con seguimiento de redirects. No usa axios ni node-fetch.

### 4. Variable Injector
Reemplaza placeholders en el JSON del workflow: CLIENT_ID, CLIENT_NAME, CLIENT_EMAIL, CLIENT_PHONE, BUDGET.

### 5. Fallback Template Generator
Si el repo de solución no existe (404), genera un workflow funcional mínimo con un webhook, un nodo de código y un responder.

### 6. GitHub Actions Workflow
Archivo YAML que define los triggers, el entorno de ejecución y los pasos. Maneja el git commit final.

---

## Flujo de Datos

1. **Entrada:** `CLIENT_DATA` llega como JSON via env var o `client_payload` en el dispatch
2. **Validación:** Se verifica `GITHUB_TOKEN` (requerido) y se parsea el JSON
3. **Iteración:** Para cada item en `client.needs`, se busca en `SOLUTIONS_MAP`
4. **Descarga:** GET a `https://raw.githubusercontent.com/{repo}/main/workflow.json` con auth
5. **Transformación:** Se reemplazan variables en el JSON string con datos del cliente
6. **Persistencia:** Se escriben archivos en `clients/{id}/{need}/`
7. **Deploy:** Si `N8N_API_URL` y `N8N_API_KEY` están seteados, POST al API de n8n
8. **Git:** `git add`, `git commit`, `git push` con token en la URL remota

---

## Integraciones

### Zoho CRM
Trigger externo via `repository_dispatch`. Un webhook en n8n o Zoho puede hacer un POST a la GitHub API para iniciar el proceso cuando un lead se califica.

### n8n Cloud
El script hace POST a `/api/v1/workflows` con el workflow personalizado. Antes de enviar, se eliminan campos de solo lectura: `active`, `id`, `createdAt`, `updatedAt`, `versionId`, `tags`, `shared`.

### GitHub
- Fuente de templates de workflows (repos separados por solución)
- Almacén de archivos generados (directorio `clients/`)
- Runtime de ejecución (GitHub Actions)
- Autenticación via PAT (`GH_TOKEN`)

---

## Escalabilidad

| Escenario | Comportamiento |
|-----------|----------------|
| 1 cliente/hora | Cron natural, sin cambios |
| 50 clientes simultáneos | Múltiples dispatches paralelos — GitHub Actions crea un job por dispatch |
| 500 clientes/mes | ~500 runs × 2min = ~17 horas de compute. GitHub Free: 2000 min/mes — costo $0 |
| Nuevo tipo de solución | Agregar entrada a SOLUTIONS_MAP y crear repo con workflow.json |
| Nuevo campo de cliente | Agregar a replaceVars() y al DEPLOYMENT_SUMMARY.md template |

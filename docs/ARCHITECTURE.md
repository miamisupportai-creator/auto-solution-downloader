# Arquitectura del Sistema — Auto-Solution-Downloader

## Diagrama General

```
┌─────────────┐    trigger     ┌──────────────────────┐
│   Zoho CRM  │ ─────────────► │   GitHub Actions      │
│  (lead data)│                │  (schedule / manual)  │
└─────────────┘                └──────────┬───────────┘
                                          │  CLIENT_DATA (env)
                                          ▼
                               ┌──────────────────────────────┐
                               │  auto-solution-downloader.js  │
                               │  ─────────────────────────── │
                               │  1. Parse CLIENT_DATA         │
                               │  2. For each need:            │
                               │     - Fetch workflow.json     │
                               │     - Substitute placeholders │
                               │     - Save to clients/        │
                               │     - Import to n8n (opt)     │
                               │  3. Git commit + push         │
                               └──────────┬───────────────────┘
                                          │
                     ┌────────────────────┼────────────────────┐
                     │                    │                     │
                     ▼                    ▼                     ▼
          ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐
          │  GitHub Repos    │  │   Local clients/ │  │   n8n Cloud    │
          │  (source repos)  │  │   (git-tracked)  │  │   (activated)  │
          │  n8n-*-solution  │  │  workflow.json   │  │   workflows    │
          └──────────────────┘  └──────────────────┘  └────────────────┘
```

---

## Componentes

### 1. Zoho CRM

**Rol:** Fuente de datos del cliente.

Cuando un lead avanza a una etapa específica en Zoho CRM (ej. "Propuesta Aceptada"), un webhook o trigger dispara el GitHub Actions workflow con los datos del cliente como payload `CLIENT_DATA`.

**Datos que envía:**
- `id`: identificador único del cliente
- `name`, `email`, `phone`: datos de contacto
- `needs`: array de soluciones requeridas
- `budget`: presupuesto del cliente

---

### 2. GitHub Actions

**Rol:** Orquestador de ejecución serverless.

El workflow `.github/workflows/claude-auto-download.yml` se ejecuta:
- **Automáticamente** cada 6 horas (cron schedule)
- **Manualmente** desde la UI de GitHub (workflow_dispatch)
- **Programáticamente** via GitHub API (integración Zoho)

Beneficios:
- Sin servidor que mantener
- Logs automáticos
- Reintentos nativos
- Secrets management integrado

---

### 3. auto-solution-downloader.js

**Rol:** Motor principal de descarga y personalización.

Pasos que ejecuta por cada solución requerida:

1. **Fetch**: Descarga `workflow.json` desde el repo fuente usando `https` nativo
2. **Substitute**: Reemplaza todos los placeholders `${CLIENT_ID}`, `${CLIENT_NAME}`, etc. con datos reales
3. **Save**: Guarda archivos en `clients/{id}/{solution}/`
4. **Import** *(opcional)*: POST a la API de n8n para crear el workflow
5. **Git push**: Commitea y pushea los archivos generados

Sin dependencias externas — solo módulos built-in de Node.js.

---

### 4. GitHub Repos (Soluciones)

**Rol:** Catálogo de workflows n8n pre-construidos.

Cada repo contiene un `workflow.json` plantilla con variables:
- `${CLIENT_ID}`
- `${CLIENT_NAME}`
- `${CLIENT_EMAIL}`
- `${CLIENT_PHONE}`
- `${BUDGET}`

Repos disponibles:

| Clave                 | Repositorio                                        |
|-----------------------|----------------------------------------------------|
| `lead-qualification`  | miamisupportai-creator/n8n-lead-qualification      |
| `email-automation`    | miamisupportai-creator/n8n-email-automation        |
| `crm-sync`            | miamisupportai-creator/n8n-crm-sync                |
| `order-processing`    | miamisupportai-creator/n8n-order-processing        |
| `customer-support`    | miamisupportai-creator/n8n-customer-support        |
| `reporting`           | miamisupportai-creator/n8n-reporting               |

---

### 5. n8n Cloud

**Rol:** Motor de ejecución de automatizaciones.

Los workflows importados se activan en n8n y empiezan a procesar datos del cliente automáticamente. La plataforma maneja:
- Ejecución en tiempo real
- Reintentos en caso de error
- Logs de ejecución
- Integraciones con terceros (CRM, email, etc.)

---

## Flujo de Datos

```
CLIENT_DATA (JSON) → parse → validar campos requeridos
                              ↓
               por cada need en client.needs:
                              ↓
               SOLUTIONS_MAP[need] → repo URL
                              ↓
               GET raw.githubusercontent.com/{repo}/main/workflow.json
                              ↓
               substituteVars() → reemplazar ${CLIENT_*} con datos reales
                              ↓
               fs.writeFileSync() → clients/{id}/{solution}/workflow.json
               fs.writeFileSync() → clients/{id}/{solution}/DEPLOYMENT_SUMMARY.md
                              ↓
               [opcional] POST n8n API → crear workflow
                              ↓
               git add + commit + push → GitHub
```

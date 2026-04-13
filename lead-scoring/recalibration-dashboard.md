---
titulo: Dashboard de Recalibración Mensual — Lead Scoring
fecha: 2026-04-13
etiquetas: [lead-scoring, recalibración, métricas]
---

# Dashboard de Recalibración Mensual — Lead Scoring

> [!info] Instrucciones
> Completar esta plantilla al final de cada mes. Requiere datos del CRM (Zoho) y del engine de scoring. Ver `scoring-config.json` para pesos actuales.

---

## Resumen del Mes

| Métrica | Valor Real | Meta |
|---|---|---|
| Leads scored | _ej: 143_ | — |
| HOT leads | _ej: 12_ | — |
| WARM leads | _ej: 47_ | — |
| COLD leads | _ej: 84_ | — |
| Leads enviados a ventas | _ej: 38_ | — |
| Leads convertidos | _ej: 9_ | — |
| Tasa de conversión general | _ej: 6.3%_ | >8% |
| Valor total cerrado (ACV) | _ej: $14,400_ | — |
| Días promedio para cerrar | _ej: 18_ | <21 |

---

## Accuracy Metrics

| Métrica | Valor Real | Target |
|---|---|---|
| False Positive Rate (FPR) | _ej: 0.13_ | ≤ 0.10 |
| False Negative Rate (FNR) | _ej: 0.04_ | ≤ 0.05 |
| Sales Acceptance Rate (SAR) | _ej: 0.68_ | ≥ 0.70 |
| HOT leads convertidos | _ej: 7/12 = 58%_ | ≥ 60% |
| WARM leads escalados a HOT | _ej: 8_ | — |
| Overrides solicitados | _ej: 3_ | — |

> [!warning] Acción requerida
> Si FPR > 0.10 o SAR < 0.70, revisar pesos en la sección de Ajustes Recomendados.

---

## Top Señales que Convirtieron

Lista de señales con mayor correlación con deals cerrados este mes.

| Señal | Veces presente | % conversión asociada | Score actual |
|---|---|---|---|
| demo_request | _ej: 11_ | _ej: 82%_ | 50 pts |
| pricing_page_visit (3+) | _ej: 9_ | _ej: 67%_ | 25 pts |
| email_reply | _ej: 14_ | _ej: 57%_ | 15 pts |
| whitepaper_download | _ej: 7_ | _ej: 43%_ | 15 pts |
| competitor_comparison_page | _ej: 5_ | _ej: 40%_ | 18 pts |

---

## Señales con Bajo Rendimiento

Señales con bajo poder predictivo real este mes.

| Señal | Veces presente | % conversión real | Score actual | ¿Ajustar? |
|---|---|---|---|---|
| blog_read | _ej: 42_ | _ej: 9%_ | 3 pts/read | Evaluar |
| email_open | _ej: 87_ | _ej: 6%_ | 3 pts | Reducir |
| forum_discussion | _ej: 3_ | _ej: 0%_ | 5 pts | Revisar |
| return_visit_week | _ej: 28_ | _ej: 11%_ | 8 pts | Mantener |

---

## Ajustes Recomendados

> [!tip] Proceso
> Solo modificar `scoring-config.json`. No tocar el engine JS a menos que sea un bug estructural.

| Componente | Cambio propuesto | Razón | Impacto estimado |
|---|---|---|---|
| `behavioral.emailEngagement.open` | 3 → 1 | Muy bajo poder predictivo | Reduce FPR |
| `behavioral.contentEngagement.demoRequest` | 50 → 60 | Alta correlación con cierre | Mejora SAR |
| `intent.competitorResearch.competitor_comparison_page` | 18 → 22 | Señal fuerte este mes | Mejor detección HOT |
| `weights.behavioral` | 0.40 → 0.35 | Señales de intent más predictivas | Ajuste de capas |
| `weights.intent` | 0.30 → 0.35 | Señales de intent más predictivas | Ajuste de capas |

> [!warning] Validar
> Suma de weights debe ser siempre exactamente 1.00

---

## Leads Anómalos

### Ganadores inesperados (score bajo, cerraron igual)

| Lead ID | Score al cerrar | Tier | Deal size | ¿Qué faltó detectar? |
|---|---|---|---|---|
| _ej: lead_0042_ | _ej: 41_ | COLD | _ej: $1,200_ | Referido directo — señal no capturada |
| _ej: lead_0078_ | _ej: 55_ | WARM | _ej: $2,400_ | Budget real mayor al declarado |

### Falsos positivos (score alto, no cerraron)

| Lead ID | Score | Tier | ¿Por qué no cerró? | Señal engañosa |
|---|---|---|---|---|
| _ej: lead_0031_ | _ej: 88_ | HOT | Competidor directo investigando | competitor_comparison_page |
| _ej: lead_0055_ | _ej: 82_ | HOT | Sin presupuesto real | recent_funding (falso) |

---

## Decisión de Recalibración

| Ajuste | ¿Aprobar? | Aprobado por | Fecha |
|---|---|---|---|
| Reducir email_open 3→1 | ☐ Sí / ☐ No | _nombre_ | _fecha_ |
| Aumentar demoRequest 50→60 | ☐ Sí / ☐ No | _nombre_ | _fecha_ |
| Aumentar competitor_comparison 18→22 | ☐ Sí / ☐ No | _nombre_ | _fecha_ |
| Ajustar weights behavioral/intent | ☐ Sí / ☐ No | _nombre_ | _fecha_ |

> [!note] Recuerda
> Todo cambio aprobado debe registrarse como evento `model_recalibration` en el audit log, con `oldWeights`, `newWeights`, `reason` y `approvedBy`.

---

## Próxima Revisión

| Campo | Valor |
|---|---|
| Fecha próxima revisión | _YYYY-MM-DD_ |
| Responsable | _nombre_ |
| Herramienta | `scoring-config.json` + Zoho CRM export |
| Recordatorio | Crear nota en Obsidian al inicio del mes |

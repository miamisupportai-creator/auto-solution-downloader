---
titulo: Documentacion -- Sistema de Lead Scoring Multi-Capa
fecha: 2026-04-13
etiquetas: [lead-scoring, documentacion, ai50m]
---

# Sistema de Lead Scoring Multi-Capa -- ai50m

## 1. Que hace este sistema?

Este sistema califica automaticamente cada lead en una escala de 0 a 100 combinando datos firmograficos, comportamiento digital e intencion de compra detectada. Aplica decaimiento temporal a las senales antiguas y requiere aprobacion humana antes de cualquier despliegue. El resultado es una priorizacion objetiva de leads con trazabilidad completa de cada decision.

---

## 2. Arquitectura de 4 Capas

```
+-----------------------------------------------------+
|  CAPA 1: FIRMOGRAFICA (30%)                         |
|  Tamano empresa  Industria  Geografia               |
|  Presupuesto  Tech stack compatible                 |
+-----------------------------------------------------+
|  CAPA 2: COMPORTAMENTAL (40%)                       |
|  Visitas pricing  Descargas  Webinars               |
|  Email engagement  Sesiones  Demo requests          |
+-----------------------------------------------------+
|  CAPA 3: INTENCION (30%)                            |
|  Senales de contratacion  Funding events            |
|  Investigacion de competidores  Publicaciones       |
+-----------------------------------------------------+
|  CAPA 4: SYNERGY BONUS (hasta +30)                  |
|  Multiples canales  Multiples contactos             |
|  Actividad progresiva creciente                     |
+-----------------------------------------------------+
         v Decaimiento temporal por senal
         v Normalizacion 0-100
         v Gates de validacion
         v Control de despliegue (4 modos)
```

**Capa 1 Firmografica:** Evalua si el perfil de la empresa encaja con el ICP de ai50m (salud, restaurantes, retail, servicios en Miami/EE.UU.).

**Capa 2 Comportamental:** Mide el nivel de interes demostrado a traves de acciones digitales. Tiene el mayor peso porque el comportamiento es el predictor mas directo de intencion real.

**Capa 3 Intencion:** Senales externas que indican que la empresa esta en modo de compra activo (financiamiento reciente, contrataciones, comparando competidores).

**Capa 4 Synergy:** Bonus por senales combinadas que demuestran intencion coordinada de multiples canales o personas en la misma cuenta.

---

## 3. Como funciona el scoring

### Formula

```
Score = (Firm x 0.30) + (Behav x 0.40) + (Intent x 0.30) + SynergyBonus
```

Cada capa se normaliza a 0-100 antes de aplicar el peso. El decaimiento temporal reduce el valor de senales segun su antiguedad.

### Decaimiento temporal

| Antiguedad   | Multiplicador |
|---|---|
| 0-7 dias     | 100% (sin descuento) |
| 8-14 dias    | 80% |
| 15-30 dias   | 50% |
| 31-60 dias   | 25% |
| Mas de 60 dias | 0% (ignorada) |

### Ejemplo de calculo

| Componente | Score raw | Normalizado | Peso | Contribucion |
|---|---|---|---|---|
| Firmografico   | 55/80  | 69 | 0.30 | 20.7 |
| Comportamental | 90/150 | 60 | 0.40 | 24.0 |
| Intent         | 35/100 | 35 | 0.30 | 10.5 |
| Synergy        | --     | -- | --   | +10  |
| **TOTAL**      |        |    |      | **65** |

---

## 4. Tiers de calificacion

| Tier | Rango | Accion | SLA |
|---|---|---|---|
| HOT  | 80-100 | SDR contacta de inmediato | 24 horas |
| WARM | 50-79  | Secuencia de nurturing | Escalar si +15 pts |
| COLD | 0-49   | Contenido educativo | Re-score semanal |

---

## 5. Gates de validacion

| Gate | Condicion | Umbral |
|---|---|---|
| ICP Fit | Score firmografico minimo | >= 35 |
| Signal Diversity | Tipos distintos de senales | >= 2 |
| Signal Freshness | Senal mas reciente | <= 14 dias |
| Decision Maker | Titulo del contacto | owner/founder/ceo/director/etc. |
| Score Total | No en tier COLD | >= 50 |
| Pattern Match | Similitud con leads historicos que cerraron | >= 70% |

---

## 6. Control de despliegue

| Modo | Comportamiento |
|---|---|
| per_lead | Requiere aprobacion humana para cada lead individualmente |
| auto_hot_daily_summary | HOT leads se despliegan solos; el resto va a resumen diario |
| weekly_batch | Todos los leads se acumulan para revision los lunes |
| scoring_only | Solo puntua -- nunca despliega nada |

El modo por defecto es per_lead. Cambiar en validation-rules.json deploymentGates.defaultMode.

---

## 7. Audit trail

| Evento | Que registra |
|---|---|
| lead_scored | Score completo, tier, senales, version del engine |
| validation_run | Que gates pasaron/fallaron |
| approval_requested | Quien solicito aprobacion y con que score |
| approval_decision | Quien aprobo/rechazo, decision y razon |
| deployment_initiated | Que soluciones, en que entorno |
| staging_confirmed | Resultado del staging |
| production_deployed | IDs de workflows n8n desplegados |
| conversion_outcome | Si el deal cerro, ACV, dias para cerrar |
| model_recalibration | Cambio de pesos old/new, razon, aprobador |
| override | Score manual overrideado: razon y quien |

---

## 8. Recalibracion mensual

**Cuando:** Primer lunes de cada mes.
**Herramienta:** recalibration-dashboard.md + export de Zoho CRM.

Proceso:
1. Exportar todos los leads del mes con score + outcome
2. Calcular FPR, FNR y SAR reales vs. targets
3. Identificar senales con bajo poder predictivo
4. Proponer ajustes de pesos en el dashboard
5. Aprobar cambios -> actualizar scoring-config.json
6. Registrar evento model_recalibration en audit log

---

## 9. Integracion con Zoho CRM

| Campo del engine | Campo en Zoho | Tipo |
|---|---|---|
| scores.total | Lead_Score | Number |
| tier.name | Lead_Tier | Picklist HOT/WARM/COLD |
| tier.action | Recommended_Action | Text |
| signals.count | Signal_Count | Number |
| signals.mostRecentDate | Last_Signal_Date | Date |
| reasoning | Score_Reasoning | Long Text |
| validation.passedSalesGates | Sales_Ready | Checkbox |
| timestamp | Scored_At | DateTime |

Para integrar con n8n: usar el nodo Zoho CRM Create/Update Lead despues de llamar a scoreLead().

---

## 10. Metricas de exito

| KPI | Target | Como medir |
|---|---|---|
| Sales Acceptance Rate (SAR) | >= 70% | Leads aceptados por SDR / leads enviados |
| False Positive Rate (FPR) | <= 10% | HOT leads que no convierten en 90 dias |
| False Negative Rate (FNR) | <= 5% | Deals cerrados que estaban en COLD |
| Tiempo de respuesta a HOT | < 24h | Timestamp scored vs. contactado |
| Conversion HOT a Deal | >= 60% | HOT leads que cierran |
| Cobertura de senales | >= 2 tipos por lead | signals.types.length >= 2 |

---

## 11. Uso rapido

```js
import { scoreLead, validateForSalesRouting } from './lead-scoring-engine.js';
import config from './scoring-config.json' assert { type: 'json' };
import rules  from './validation-rules.json' assert { type: 'json' };

const leadData = {
  id: 'lead_001', name: 'Maria Gonzalez',
  email: 'maria@restaurantemiami.com', company: 'Restaurante Miami',
  industry: 'restaurant', employees: 25,
  location: 'Miami, FL', budget: 800,
  techStack: ['whatsapp', 'gmail'], jobTitle: 'Owner'
};

const signals = {
  behavioral: { events: [
    { type: 'demo_request',       date: '2026-04-10' },
    { type: 'pricing_page_visit', date: '2026-04-09', durationSeconds: 210 },
    { type: 'email_reply',        date: '2026-04-08' }
  ]},
  intent: { events: [{ type: 'g2_capterra_view', date: '2026-04-07' }] },
  synergy: { multipleChannelsSamePerson: true }
};

const result = scoreLead(leadData, signals, config);
console.log(result.scores.total);  // -> 85 (HOT)
console.log(result.tier.name);     // -> 'hot'

const validation = validateForSalesRouting(result, rules);
console.log(validation.valid);     // -> true
```

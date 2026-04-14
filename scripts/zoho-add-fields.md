# Zoho CRM — Add Custom Fields (Manual)

## Why manual?
The Zoho OAuth token needs `ZohoCRM.settings.fields.ALL` scope to create fields via API.
Your current token only has data scopes (leads/contacts). Add fields manually in 5 min.

## Steps

1. Go to: https://crm.zoho.com
2. Click ⚙️ Settings (top right)
3. Customization → Modules and Fields
4. Click **Leads** → Fields
5. Click **+ New Field** for each field below:

## Fields to Create

| Label | Type | Notes |
|-------|------|-------|
| Audio Transcriptions | Long Text (32,000 chars) | All voice message transcriptions |
| Image Analysis | Long Text (5,000 chars) | AI analysis of images sent |
| Conversation Summary | Long Text (10,000 chars) | Auto-summary of conversation |
| Last Interaction Type | Picklist | Values: text, audio, image |
| Jarvis Confidence Score | Decimal (1 decimal) | 0.0–100.0 qualification score |

## After creating fields

The n8n workflow "Jarvis — Zoho Media Enrichment" (ID: JTSY8TFlxpVP79T7) is already set up
and will auto-populate these fields when triggered.

Webhook endpoint:
`POST https://ai50m.app.n8n.cloud/webhook/jarvis-enrich-zoho`

## To regenerate token with field scope

1. Go to: https://api-console.zoho.com/
2. Select your OAuth client
3. Add scope: `ZohoCRM.settings.fields.ALL`
4. Generate new refresh token
5. Run: `node scripts/refresh-zoho-token.js` (coming soon)

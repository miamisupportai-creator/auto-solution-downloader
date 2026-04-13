/**
 * apify-webhook-receiver.js — Cloud Run container
 * Receives Apify webhooks → stores leads → enriches via Clearbit free API
 * ESM compatible, no external npm deps except express
 */
import express from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '10mb' }));

// ── Storage (JSON files, no PostgreSQL dep for MVP) ──────────────────────────
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '../../logs');
const LEADS_FILE = join(DATA_DIR, 'webhook-leads.json');

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(readFileSync(LEADS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveLead(lead) {
  ensureDir();
  const leads = loadLeads();
  leads.push(lead);
  writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  return leads.length;
}

// ── Clearbit Autocomplete (FREE — no API key needed) ─────────────────────────
async function enrichWithClearbit(companyName) {
  const { default: https } = await import('https');
  const encoded = encodeURIComponent(companyName);
  const url = `https://autocomplete.clearbit.com/v1/companies?query=${encoded}`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results?.length > 0) {
            const c = results[0];
            resolve({
              domain: c.domain,
              logo: c.logo,
              type: c.type,
              enriched: true,
              enrichedBy: 'clearbit-autocomplete',
            });
          } else {
            resolve({ enriched: false });
          }
        } catch { resolve({ enriched: false }); }
      });
    }).on('error', () => resolve({ enriched: false }));
  });
}

// ── n8n notification ──────────────────────────────────────────────────────────
async function notifyN8n(leadId) {
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) return;

  const { default: https } = await import('https');
  const { URL } = await import('url');
  const url = new URL(`${n8nUrl}/apify-lead-received`);
  const payload = JSON.stringify({ lead_id: leadId, ts: Date.now() });

  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, resolve);
    req.on('error', resolve);
    req.write(payload);
    req.end();
  });
}

// ── Verify Apify signature ────────────────────────────────────────────────────
function verifySignature(req) {
  const secret = process.env.APIFY_WEBHOOK_SECRET;
  if (!secret) return true; // skip if not set

  const sig = req.headers['x-apify-signature-256'] || req.headers['x-apify-signature'];
  if (!sig) return false;

  const hash = 'sha256=' + createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  try {
    return timingSafeEqual(Buffer.from(sig), Buffer.from(hash));
  } catch { return false; }
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', ts: new Date() }));

app.get('/leads', (req, res) => {
  const leads = loadLeads();
  res.json({ count: leads.length, leads: leads.slice(-20) }); // last 20
});

app.post('/webhooks/apify', async (req, res) => {
  try {
    if (!verifySignature(req)) {
      console.warn('⚠️ Invalid Apify signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = req.body;
    // Apify sends { resource: {...}, eventType: "ACTOR.RUN.SUCCEEDED", ... }
    // Dataset items arrive in body.data or we fetch them
    const items = payload?.data || payload?.resource?.defaultDatasetId
      ? [] // would need to fetch dataset — handled by polling pipeline
      : Array.isArray(payload) ? payload : [payload];

    let processed = 0;
    for (const item of items) {
      const company = item.organizationName || item.companyName || item.company;
      if (!company) continue;

      const clearbitData = await enrichWithClearbit(company);
      const lead = {
        id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        company,
        jobTitle: item.title || item.positionName || item.job_title,
        location: item.location || 'Miami, FL',
        jobUrl: item.url || item.jobUrl,
        source: 'apify-webhook',
        receivedAt: new Date().toISOString(),
        ...clearbitData,
      };

      const total = saveLead(lead);
      console.log(`✅ Lead #${total}: ${company} (clearbit: ${clearbitData.enriched})`);
      notifyN8n(lead.id).catch(() => {});
      processed++;
    }

    res.json({ processed, ts: new Date() });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => console.log(`✅ Apify receiver on :${PORT}`));

process.on('SIGTERM', () => process.exit(0));

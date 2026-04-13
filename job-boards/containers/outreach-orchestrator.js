/**
 * outreach-orchestrator.js — Cloud Run container
 * Fetches scored leads → creates Smartlead campaigns → analytics
 * Smartlead API: server.smartlead.ai/api/v1 (confirmed correct)
 */
import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const SMARTLEAD_KEY = process.env.SMARTLEAD_API_KEY;
const LEADS_FILE = join(__dirname, '../../logs/job-boards-results.json');
const SENT_FILE  = join(__dirname, '../../logs/outreach-sent.json');

// ── API helper ────────────────────────────────────────────────────────────────
async function slFetch(path, options = {}) {
  const { default: https } = await import('https');
  const { URL } = await import('url');
  const url = new URL(`https://server.smartlead.ai/api/v1${path}`);
  url.searchParams.set('api_key', SMARTLEAD_KEY);

  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── State helpers ─────────────────────────────────────────────────────────────
function loadSent() {
  if (!existsSync(SENT_FILE)) return new Set();
  try { return new Set(JSON.parse(readFileSync(SENT_FILE, 'utf-8')).sent || []); }
  catch { return new Set(); }
}

function loadScoredLeads() {
  if (!existsSync(LEADS_FILE)) return [];
  try { return JSON.parse(readFileSync(LEADS_FILE, 'utf-8')); }
  catch { return []; }
}

// ── Smartlead helpers ─────────────────────────────────────────────────────────
let _campaignId = null;

async function getOrCreateCampaign() {
  if (_campaignId) return _campaignId;

  const listRes = await slFetch('/campaigns/');
  const campaigns = Array.isArray(listRes.body) ? listRes.body
    : (listRes.body?.data || []);
  const existing = campaigns.find(c => c.name?.includes('ai50m — Miami 360'));
  if (existing) { _campaignId = existing.id; return _campaignId; }

  const createRes = await slFetch('/campaigns/create', {
    method: 'POST',
    body: { name: 'ai50m — Miami 360 MVP', track_settings: { track_open: true, track_click: false } },
  });

  const id = createRes.body?.data?.id || createRes.body?.id;
  if (id) {
    await slFetch(`/campaigns/${id}/schedule`, {
      method: 'POST',
      body: {
        timezone: 'America/New_York',
        days_of_the_week: [1, 2, 3, 4, 5],
        start_hour: '09:00', end_hour: '17:00',
        min_time_btw_emails: 15, max_new_leads_per_day: 15,
      },
    });
    _campaignId = id;
    console.log(`📧 Campaign created: ${id}`);
  }
  return _campaignId;
}

function buildEmail(lead) {
  const name = lead.contactName?.split(' ')[0] || 'there';
  const job = lead.jobTitle || 'the role';
  return {
    subject: `Quick question about ${lead.company}'s ${job.toLowerCase()} role`,
    body: `Hi ${name},\n\nI noticed ${lead.company} is hiring for a ${job.toLowerCase()} — that usually means this type of work is growing fast.\n\nWe're an AI automation agency in Miami (ai50m.com) and we help businesses automate exactly those workflows. Most clients save 15-20 hours/week and reduce costs by 30-40%.\n\nWould a 15-minute call make sense? I can show you a quick demo.\n\nBest,\nRey | ai50m.com\nWe Automate. You Grow.`,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', ts: new Date() }));

// POST /campaigns — trigger outreach for hot/warm leads
app.post('/campaigns', async (req, res) => {
  try {
    const minScore = parseInt(req.body?.min_score || process.env.MIN_OUTREACH_SCORE || '45');
    const leads = loadScoredLeads();
    const sent = loadSent();

    const toSend = leads.filter(l =>
      (l.leadScore || 0) >= minScore &&
      !sent.has((l.company || '').toLowerCase().replace(/\s+/g, '-'))
    );

    console.log(`📧 Outreach: ${toSend.length} leads qualify (≥${minScore})`);
    if (toSend.length === 0) return res.json({ sent: 0, message: 'No new qualified leads' });

    const campaignId = await getOrCreateCampaign();
    if (!campaignId) return res.status(500).json({ error: 'Could not get campaign ID' });

    let sentCount = 0;
    const results = [];

    for (const lead of toSend.slice(0, 20)) { // max 20/run
      const email = lead.contactEmail ||
        `info@${lead.website || lead.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'}`;

      const addRes = await slFetch(`/campaigns/${campaignId}/leads`, {
        method: 'POST',
        body: {
          lead_list: [{
            email,
            first_name: lead.contactName?.split(' ')[0] || '',
            last_name: lead.contactName?.split(' ').slice(1).join(' ') || '',
            company_name: lead.company,
            custom_fields: {
              job_found: lead.jobTitle || '',
              score: String(lead.leadScore || 0),
              tier: lead.tier || 'WARM',
            },
          }],
        },
      });

      const ok = addRes.status === 200 || addRes.status === 201;
      results.push({ company: lead.company, email, ok, status: addRes.status });
      if (ok) { sent.add((lead.company || '').toLowerCase().replace(/\s+/g, '-')); sentCount++; }

      await new Promise(r => setTimeout(r, 600)); // rate limit
    }

    // Persist sent state
    const { writeFileSync } = await import('fs');
    writeFileSync(SENT_FILE, JSON.stringify({ sent: [...sent], lastRun: new Date().toISOString() }, null, 2));

    res.json({ sent: sentCount, total: toSend.length, results });
  } catch (err) {
    console.error('Outreach error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /analytics — pipeline metrics
app.get('/analytics', (req, res) => {
  const leads = loadScoredLeads();
  const sent = loadSent();
  res.json({
    total_leads: leads.length,
    hot: leads.filter(l => l.tier === 'HOT').length,
    warm: leads.filter(l => l.tier === 'WARM').length,
    cold: leads.filter(l => l.tier === 'COLD').length,
    sent_to_smartlead: sent.size,
    avg_score: leads.length
      ? Math.round(leads.reduce((s, l) => s + (l.leadScore || 0), 0) / leads.length)
      : 0,
    ts: new Date(),
  });
});

const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, () => console.log(`✅ Outreach orchestrator on :${PORT}`));
process.on('SIGTERM', () => process.exit(0));

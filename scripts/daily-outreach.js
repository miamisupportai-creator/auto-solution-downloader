/**
 * daily-outreach.js — AI50M Outreach Engine v2
 *
 * Strategy:
 *   1. Find businesses via Claude web_search
 *   2. Validate contact BEFORE sending (WhatsApp > Email > Skip)
 *   3. Only send if a valid channel exists
 *   4. Dedup via data/searched-businesses.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WASENDER_API_KEY  = process.env.WASENDER_API_KEY;
const SMARTLEAD_KEY     = process.env.SMARTLEAD_API_KEY || '';
const DRY_RUN           = process.env.DRY_RUN === 'true';
const DEDUP_PATH        = 'data/searched-businesses.json';

// Miami-area valid codes (mobile and landline)
const MIAMI_AREA_CODES = ['305', '786', '954', '561', '321', '407', '689', '754'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url, timeout = 8000) {
  return new Promise(resolve => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { timeout }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch { resolve(''); }
  });
}

function httpPost(url, headers, body) {
  return new Promise(resolve => {
    try {
      const data = JSON.stringify(body);
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request({
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
        timeout: 30000
      }, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', e => resolve({ status: 0, body: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
      req.write(data);
      req.end();
    } catch (e) { resolve({ status: 0, body: e.message }); }
  });
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function loadDedup() {
  try { return existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH, 'utf8')) : {}; }
  catch { return {}; }
}
function saveDedup(d) {
  if (!existsSync('data')) mkdirSync('data', { recursive: true });
  writeFileSync(DEDUP_PATH, JSON.stringify(d, null, 2), 'utf8');
}

// ── STEP 1: Validate phone ────────────────────────────────────────────────────
// Returns cleaned 11-digit US number or null if invalid

function validatePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // Must be 10 or 11 digits
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    if (MIAMI_AREA_CODES.includes(area)) return '1' + digits;
    return null; // Not Miami/FL
  }
  if (digits.length === 11 && digits[0] === '1') {
    const area = digits.slice(1, 4);
    if (MIAMI_AREA_CODES.includes(area)) return digits;
    return null;
  }
  return null;
}

// ── STEP 2: Check if number has WhatsApp ─────────────────────────────────────
// Returns true/false — sends a 0-byte probe and checks the API response

async function checkWhatsApp(phone11) {
  if (DRY_RUN) return true; // assume valid in dry run
  const jid = `${phone11}@s.whatsapp.net`;
  const res = await httpPost('https://www.wasenderapi.com/api/send-message',
    { Authorization: `Bearer ${WASENDER_API_KEY}` },
    { to: jid, text: '__probe__' }
  );
  try {
    const b = JSON.parse(res.body);
    if (b?.message?.includes('does not exist on WhatsApp')) return false;
    return true; // success or any other error means number exists
  } catch { return false; }
}

// ── STEP 3: Validate email ────────────────────────────────────────────────────

function validateEmail(email) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return clean;
  return null;
}

// ── STEP 4: Find email via Claude if not in original data ─────────────────────

async function findEmailForBusiness(company, website) {
  const prompt = `Find the public contact email for this business. Search their website and Google.

Company: ${company}
Website: ${website || 'unknown'}

Return ONLY the email address (e.g. info@company.com) or the word "none" if not found.`;

  const res = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    {
      model: 'claude-haiku-4-5',
      max_tokens: 100,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: prompt }]
    }
  );
  if (res.status !== 200) return null;
  try {
    const parsed = JSON.parse(res.body);
    const text = (parsed.content || []).find(b => b.type === 'text')?.text || '';
    const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return match ? match[0].toLowerCase() : null;
  } catch { return null; }
}

// ── STEP 5: Find businesses ───────────────────────────────────────────────────

async function findBusinesses(alreadySearched) {
  const skipList = Object.keys(alreadySearched).slice(0, 80).join(', ') || 'none';

  const prompt = `Search Google to find 50 real Miami FL businesses for outreach.

Find:
- 17 independent dental clinics in Miami FL (NOT Aspen, ClearChoice, Bright Now chains)
- 17 independent auto dealers in Miami FL (NOT CarMax, AutoNation)
- 16 boutique hotels in Miami FL under 100 rooms (NOT major chains)

SKIP these (already contacted): ${skipList}

For each business find:
1. Business name
2. Website URL
3. Phone number — PREFER mobile/WhatsApp-capable numbers. Include area code.
4. Owner or manager first name (from website/Google/LinkedIn)
5. Public email address (info@, contact@, owner@, etc.)

Return ONLY a valid JSON array, no text before or after:
[{
  "company": "Name",
  "website": "https://...",
  "phone": "+1XXXXXXXXXX",
  "owner_name": "Full Name or empty",
  "first_name": "First or empty",
  "email": "email@domain.com or empty",
  "niche": "dental|auto_dealer|boutique_hotel"
}]`;

  const res = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    {
      model: 'claude-opus-4-5',
      max_tokens: 5000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
      messages: [{ role: 'user', content: prompt }]
    }
  );

  if (res.status !== 200) {
    console.error('Claude search error:', res.status, String(res.body).slice(0, 300));
    return [];
  }

  try {
    const parsed = JSON.parse(res.body);
    for (const block of (parsed.content || []).filter(b => b.type === 'text')) {
      const match = block.text.match(/\[[\s\S]*?\]/);
      if (match) {
        try { return JSON.parse(match[0]); } catch { continue; }
      }
    }
  } catch (e) { console.error('Parse error:', e.message); }
  return [];
}

// ── STEP 6: Generate personalized message ────────────────────────────────────

async function generateMessage(biz, websiteText) {
  const greeting = biz.first_name ? `Hola ${biz.first_name} 👋` : 'Hola 👋';

  const prompt = `You are a B2B sales expert for AI50M (Miami AI automation agency).

Business:
- Company: ${biz.company}
- Niche: ${biz.niche}
- Website content: ${websiteText || '(not available)'}

Write a SHORT WhatsApp outreach message in SPANISH using EXACTLY this structure:

${greeting}

Vi que ${biz.company} [1 specific operational bottleneck — be precise, not generic].

Automatizamos eso:
✓ [Benefit 1 with specific number — e.g. "Ahorras 15h/semana en confirmaciones de citas"]
✓ [Benefit 2 with $ amount — e.g. "$18,000+ anuales en eficiencia operacional"]
✓ [Benefit 3 specific to ${biz.niche}]

¿Nos damos una llamada de 15 min?

Rey Martinez
AI50M | Miami, FL
rey@ai50m.com | 786-969-3419

RULES:
- NO URLs or links ever
- Under 180 words
- Be specific to their business, not generic
- Sound human

After the message, on a new line, add this JSON (no markdown):
{"weeklyHours":N,"annualSavings":N,"painPoint":"short description"}`;

  const res = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    { model: 'claude-haiku-4-5', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }
  );

  if (res.status !== 200) return { message: null, meta: {} };
  try {
    const parsed = JSON.parse(res.body);
    const text = (parsed.content || []).find(b => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\{"weeklyHours"[\s\S]*?\}/);
    const meta = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    const message = text.replace(/\{"weeklyHours"[\s\S]*?\}/, '').trim();
    return { message, meta };
  } catch { return { message: null, meta: {} }; }
}

// ── STEP 7: Send WhatsApp ─────────────────────────────────────────────────────

async function sendWhatsApp(phone11, message) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] WhatsApp → ${phone11}\n${message}\n`);
    return 'dry_run';
  }
  const res = await httpPost('https://www.wasenderapi.com/api/send-message',
    { Authorization: `Bearer ${WASENDER_API_KEY}` },
    { to: `${phone11}@s.whatsapp.net`, text: message }
  );
  try {
    const b = JSON.parse(res.body);
    if (b?.success) return 'sent';
    return 'failed';
  } catch { return 'failed'; }
}

// ── STEP 8: Send Email via Smartlead ─────────────────────────────────────────

async function sendEmail(email, company, message) {
  if (!SMARTLEAD_KEY) { console.log('  ⚠️  No Smartlead key — skip email'); return 'no_key'; }
  if (DRY_RUN) { console.log(`  [DRY RUN] Email → ${email}`); return 'dry_run'; }

  // Convert WA message to email format
  const subject = `Automatización IA para ${company} — AI50M`;
  const body = message.replace(/✓/g, '•');

  const res = await httpPost(`https://server.smartlead.ai/api/v1/campaigns/create?api_key=${SMARTLEAD_KEY}`,
    {},
    { name: `${company} — Outreach ${new Date().toISOString().split('T')[0]}` }
  );

  try {
    const camp = JSON.parse(res.body);
    if (!camp?.id) return 'failed';

    // Add lead
    await httpPost(`https://server.smartlead.ai/api/v1/campaigns/${camp.id}/leads?api_key=${SMARTLEAD_KEY}`,
      {},
      { lead_list: [{ email, company_name: company, custom_fields: { message: body } }] }
    );

    // Add sequence
    await httpPost(`https://server.smartlead.ai/api/v1/campaigns/${camp.id}/sequences?api_key=${SMARTLEAD_KEY}`,
      {},
      { sequences: [{ seq_number: 1, seq_delay_details: { delay_in_days: 0 }, subject, email_body: `<p>${body.replace(/\n/g, '<br>')}</p>` }] }
    );

    return 'sent';
  } catch { return 'failed'; }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function runDailyOutreach() {
  console.log(`\n🚀 AI50M Daily Outreach v2 — ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('⚠️  DRY RUN — no real messages sent\n');

  const dedup = loadDedup();
  console.log(`📋 Dedup: ${Object.keys(dedup).length} already contacted\n`);

  // Find businesses
  console.log('🔍 Finding businesses via Claude web_search...');
  const businesses = await findBusinesses(dedup);
  console.log(`Found ${businesses.length} candidates\n`);

  const stats = { sent_wa: 0, sent_email: 0, no_whatsapp: 0, no_contact: 0, skipped: 0, errors: 0 };

  for (let i = 0; i < businesses.length && i < 50; i++) {
    const biz = businesses[i];
    const slug = slugify(biz.company);

    if (dedup[slug]) { stats.skipped++; continue; }

    console.log(`\n[${i+1}/${businesses.length}] ${biz.company} (${biz.niche})`);

    // ── VALIDATE CONTACT ──────────────────────────────────────────────────────
    const phone = validatePhone(biz.phone);
    let email   = validateEmail(biz.email);
    let channel = null;
    let validPhone = null;

    if (phone) {
      console.log(`  📱 Phone validated: +${phone}`);
      console.log(`  🔍 Checking WhatsApp...`);
      const hasWA = await checkWhatsApp(phone);
      if (hasWA) {
        channel = 'whatsapp';
        validPhone = phone;
        console.log(`  ✅ WhatsApp confirmed`);
      } else {
        console.log(`  ❌ Not on WhatsApp`);
        stats.no_whatsapp++;
      }
    } else if (biz.phone) {
      console.log(`  ⚠️  Phone invalid or non-Miami: ${biz.phone}`);
    }

    // Fallback to email if no WhatsApp
    if (!channel) {
      if (!email) {
        console.log(`  🔍 Searching for email...`);
        email = await findEmailForBusiness(biz.company, biz.website);
      }
      if (email) {
        channel = 'email';
        console.log(`  📧 Email found: ${email}`);
      } else {
        console.log(`  ⛔ No valid contact → SKIP`);
        stats.no_contact++;
        dedup[slug] = new Date().toISOString().split('T')[0];
        saveDedup(dedup);
        continue;
      }
    }

    // ── SCRAPE WEBSITE ────────────────────────────────────────────────────────
    let websiteText = '';
    if (biz.website) {
      const html = await httpGet(biz.website);
      websiteText = stripHtml(html);
    }

    // ── GENERATE MESSAGE ──────────────────────────────────────────────────────
    console.log(`  ✍️  Generating message...`);
    const { message, meta } = await generateMessage(biz, websiteText);
    if (!message) {
      console.log(`  ❌ Message generation failed`);
      stats.errors++;
      dedup[slug] = new Date().toISOString().split('T')[0];
      saveDedup(dedup);
      continue;
    }

    console.log(`  💡 ${meta.painPoint || 'Pain point analyzed'} | ${meta.weeklyHours || '?'}h/wk | $${(meta.annualSavings || 0).toLocaleString()}/yr`);

    // ── SEND ──────────────────────────────────────────────────────────────────
    if (channel === 'whatsapp') {
      const result = await sendWhatsApp(validPhone, message);
      console.log(`  📤 WhatsApp: ${result}`);
      if (result === 'sent' || result === 'dry_run') stats.sent_wa++;
      else stats.errors++;
    } else {
      const result = await sendEmail(email, biz.company, message);
      console.log(`  📤 Email: ${result}`);
      if (result === 'sent' || result === 'dry_run') stats.sent_email++;
      else stats.errors++;
    }

    dedup[slug] = new Date().toISOString().split('T')[0];
    saveDedup(dedup);
    await sleep(2500);
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 DAILY OUTREACH SUMMARY');
  console.log('═'.repeat(50));
  console.log(`  WhatsApp sent:  ${stats.sent_wa}`);
  console.log(`  Email sent:     ${stats.sent_email}`);
  console.log(`  No WhatsApp:    ${stats.no_whatsapp}`);
  console.log(`  No contact:     ${stats.no_contact}`);
  console.log(`  Skipped (dup):  ${stats.skipped}`);
  console.log(`  Errors:         ${stats.errors}`);
  console.log('═'.repeat(50) + '\n');
  saveDedup(dedup);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) runDailyOutreach().catch(e => { console.error('Fatal:', e); process.exit(1); });

export { runDailyOutreach };

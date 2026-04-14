import { readFileSync, writeFileSync, existsSync } from 'fs';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WASENDER_API_KEY = process.env.WASENDER_API_KEY;
const DRY_RUN = process.env.DRY_RUN === 'true';
const DEDUP_PATH = 'data/searched-businesses.json';

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function httpGet(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function httpPost(url, headers, body) {
  return new Promise((resolve) => {
    const bodyStr = JSON.stringify(body);
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
      timeout: 30000,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.write(bodyStr);
    req.end();
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Dedup ─────────────────────────────────────────────────────────────────────

function loadDedup() {
  if (existsSync(DEDUP_PATH)) {
    try {
      return JSON.parse(readFileSync(DEDUP_PATH, 'utf8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveDedup(data) {
  if (!existsSync('data')) mkdirSync('data', { recursive: true });
  writeFileSync(DEDUP_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── Claude: find businesses ───────────────────────────────────────────────────

async function findBusinesses(alreadySearched) {
  const skipList = Object.keys(alreadySearched).join(', ') || 'ninguno';
  const prompt = `Find the following Miami FL businesses for an outreach campaign. For each, return a JSON array.

Find:
- 17 independent dental clinics in Miami FL (NOT chains like Aspen, Bright Now, Ideal Dental, ClearChoice)
- 17 used/independent auto dealers in Miami FL (NOT CarMax, AutoNation franchises)
- 16 boutique hotels in Miami FL under 100 rooms (NOT major chains)

Already searched (SKIP these completely): ${skipList}

Return ONLY a valid JSON array. Each object must have exactly these fields:
{
  "company": "Business Name",
  "website": "https://...",
  "phone": "+13055551234",
  "owner_name": "Full Name or empty string",
  "first_name": "First name or empty string",
  "niche": "dental|auto_dealer|boutique_hotel"
}

Rules:
- Real businesses only, verifiable online
- Phone in E.164 format (+1XXXXXXXXXX)
- If owner unknown, use empty strings
- Do NOT include businesses from the skip list
- Return exactly 50 entries total (17+17+16)`;

  const res = await httpPost(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05',
    },
    {
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 15 }],
      messages: [{ role: 'user', content: prompt }],
    }
  );

  if (res.status !== 200) {
    console.error('Claude find-businesses error:', res.status, res.body.slice(0, 500));
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    console.error('Failed to parse Claude response JSON');
    return [];
  }

  // Extract text from content blocks
  const textBlocks = (parsed.content || []).filter((b) => b.type === 'text');
  for (const block of textBlocks) {
    const match = block.text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        continue;
      }
    }
  }
  console.error('No JSON array found in Claude response');
  return [];
}

// ── Claude: generate message ──────────────────────────────────────────────────

async function generateMessage(business, websiteText) {
  const prompt = `You are an AI automation sales expert for AI50M, a Miami-based AI automation agency.

Business info:
- Company: ${business.company}
- Niche: ${business.niche}
- First name: ${business.first_name || '(unknown)'}
- Website text: ${websiteText || '(not available)'}

Generate a personalized WhatsApp outreach message in SPANISH. Use EXACTLY this format:

Hola ${business.first_name ? business.first_name : ''}${business.first_name ? ' 👋' : '👋'}

Vi que ${business.company} [specific bottleneck detected from website or common to this niche].

Automatizamos eso:
✓ [Benefit 1 quantified - hours saved per week]
✓ [Benefit 2 quantified - $ saved per month]
✓ [Benefit 3 - specific to ${business.niche} niche]

¿Nos damos una llamada de 15 min?

Rey Martinez
AI50M | Miami, FL
rey@ai50m.com | 786-969-3419

Rules:
- NO links ever
- Keep it under 200 words
- Be specific to their niche
- Sound human, not robotic

Also return a JSON object on a new line after the message with this exact format:
{"weeklyHours": <number>, "annualSavings": <number>, "painPoint": "<string>"}`;

  const res = await httpPost(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }
  );

  if (res.status !== 200) {
    console.error('Claude generate-message error:', res.status);
    return { message: null, meta: {} };
  }

  let parsed;
  try {
    parsed = JSON.parse(res.body);
  } catch {
    return { message: null, meta: {} };
  }

  const text = (parsed.content || []).find((b) => b.type === 'text')?.text || '';

  // Split message from meta JSON
  const jsonMatch = text.match(/\{[\s\S]*"weeklyHours"[\s\S]*\}/);
  let meta = {};
  if (jsonMatch) {
    try {
      meta = JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Remove the JSON line from the message
  const message = text.replace(/\{[\s\S]*"weeklyHours"[\s\S]*\}/, '').trim();

  return { message, meta };
}

// ── WhatsApp send ─────────────────────────────────────────────────────────────

async function sendWhatsApp(phone, message) {
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would send to ${phone}:\n${message}\n`);
    return 'dry_run';
  }

  const to = phone.replace(/\D/g, '');
  const jid = `${to}@s.whatsapp.net`;

  const res = await httpPost(
    'https://www.wasenderapi.com/api/send-message',
    { Authorization: `Bearer ${WASENDER_API_KEY}` },
    { to: jid, text: message }
  );

  let body;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = { success: false, message: res.body };
  }

  if (body?.success === false && body?.message?.includes('does not exist on WhatsApp')) {
    return 'no_whatsapp';
  }
  if (res.status >= 200 && res.status < 300 && body?.success !== false) {
    return 'sent';
  }
  console.error(`WhatsApp send error (${res.status}):`, JSON.stringify(body).slice(0, 200));
  return 'failed';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runDailyOutreach() {
  console.log(`\n🚀 AI50M Daily Outreach — ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('⚠️  DRY RUN MODE — no WhatsApp messages will be sent\n');

  const searchedBusinesses = loadDedup();
  console.log(`📋 Dedup loaded: ${Object.keys(searchedBusinesses).length} already searched\n`);

  // Step 1: Find businesses
  console.log('🔍 Searching for new businesses via Claude...');
  const businesses = await findBusinesses(searchedBusinesses);
  console.log(`✅ Found ${businesses.length} businesses\n`);

  const stats = { found: businesses.length, sent: 0, no_whatsapp: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < businesses.length && i < 50; i++) {
    const biz = businesses[i];
    const slug = slugify(biz.company);

    if (searchedBusinesses[slug]) {
      console.log(`⏭️  Skip (dedup): ${biz.company}`);
      stats.skipped++;
      continue;
    }

    console.log(`\n[${i + 1}/${businesses.length}] ${biz.company} (${biz.niche})`);

    // Scrape website
    let websiteText = '';
    if (biz.website) {
      console.log(`  🌐 Scraping ${biz.website}`);
      const html = await httpGet(biz.website);
      websiteText = stripHtml(html);
    }

    // Generate message
    console.log(`  ✍️  Generating message...`);
    const { message, meta } = await generateMessage(biz, websiteText);

    if (!message) {
      console.log(`  ❌ Failed to generate message`);
      stats.failed++;
      searchedBusinesses[slug] = new Date().toISOString().split('T')[0];
      continue;
    }

    console.log(`  📊 Pain point: ${meta.painPoint || 'N/A'} | Hours/wk: ${meta.weeklyHours || 'N/A'} | Savings/yr: $${meta.annualSavings || 'N/A'}`);

    // Send WhatsApp
    if (biz.phone) {
      console.log(`  📱 Sending to ${biz.phone}...`);
      const result = await sendWhatsApp(biz.phone, message);
      console.log(`  ${result === 'sent' || result === 'dry_run' ? '✅' : '❌'} Status: ${result}`);

      if (result === 'sent' || result === 'dry_run') stats.sent++;
      else if (result === 'no_whatsapp') stats.no_whatsapp++;
      else stats.failed++;
    } else {
      console.log(`  ⚠️  No phone number available`);
      stats.failed++;
    }

    // Dedup
    searchedBusinesses[slug] = new Date().toISOString().split('T')[0];
    saveDedup(searchedBusinesses);

    // Rate limit
    if (i < businesses.length - 1) await sleep(2000);
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 OUTREACH SUMMARY');
  console.log('═'.repeat(50));
  console.log(`  Found:       ${stats.found}`);
  console.log(`  Sent:        ${stats.sent}`);
  console.log(`  No WhatsApp: ${stats.no_whatsapp}`);
  console.log(`  Failed:      ${stats.failed}`);
  console.log(`  Skipped:     ${stats.skipped}`);
  console.log('═'.repeat(50) + '\n');

  saveDedup(searchedBusinesses);
}

// CLI entry
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runDailyOutreach().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runDailyOutreach };

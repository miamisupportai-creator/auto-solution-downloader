/**
 * daily-outreach.js — AI50M Outreach Engine v3
 * Full system: find → validate → WhatsApp|Email → Zoho CRM → follow-up → report
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import https from 'https';

// ── Config ────────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;
const WASENDER_KEY   = '972438be02d23af9024060ff42ff6158d7e343c9761798480f8efd7fd38135d2';
const ZOHO_CLIENT_ID = '1000.DYYL424GSI55AVFLZX4ESJL8RHY16W';
const ZOHO_SECRET    = 'b38de78f420b0d6afd29410c188ae083e8efb12b21';
const ZOHO_REFRESH   = '1000.6af4abd9bd81a45f0ba993ff4e7c8772.a88538043f0298eefe1e90c3ccb11230';
const SMTP_HOST      = 'smtppro.zoho.com';
const SMTP_PORT      = 465;
const SMTP_USER      = 'rey@ai50m.com';
const SMTP_PASS      = 'nyskyg-vadxy8-fucqYz';
const DRY_RUN        = process.env.DRY_RUN === 'true';
const DEDUP_PATH     = 'data/searched-businesses.json';
const MIAMI_AREAS    = ['305','786','954','561','321','407','689','754'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url, timeout = 8000) {
  return new Promise(resolve => {
    try {
      const req = https.get(url, { timeout }, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
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
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
        timeout: 30000
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve({ status: res.statusCode, body: d }));
      });
      req.on('error', e => resolve({ status: 0, body: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
      req.write(data); req.end();
    } catch (e) { resolve({ status: 0, body: e.message }); }
  });
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi,'')
    .replace(/<style[\s\S]*?<\/style>/gi,'')
    .replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0, 2000);
}

// ── Dedup ─────────────────────────────────────────────────────────────────────
function loadDedup() {
  try { return existsSync(DEDUP_PATH) ? JSON.parse(readFileSync(DEDUP_PATH,'utf8')) : {}; }
  catch { return {}; }
}
function saveDedup(d) {
  if (!existsSync('data')) mkdirSync('data', { recursive: true });
  writeFileSync(DEDUP_PATH, JSON.stringify(d, null, 2), 'utf8');
}

// ── Phone validation ──────────────────────────────────────────────────────────
function validatePhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g,'');
  if (d.length === 10 && MIAMI_AREAS.includes(d.slice(0,3))) return '1'+d;
  if (d.length === 11 && d[0]==='1' && MIAMI_AREAS.includes(d.slice(1,4))) return d;
  return null;
}

function validateEmail(e) {
  if (!e) return null;
  const c = String(e).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? c : null;
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────
async function checkWhatsApp(phone11) {
  if (DRY_RUN) return true;
  const r = await httpPost('https://www.wasenderapi.com/api/send-message',
    { Authorization: `Bearer ${WASENDER_KEY}` },
    { to: `${phone11}@s.whatsapp.net`, text: '.' }
  );
  try { const b = JSON.parse(r.body); return !(b?.message?.includes('does not exist on WhatsApp')); }
  catch { return false; }
}

async function sendWhatsApp(phone11, message) {
  if (DRY_RUN) { console.log(`  [DRY] WA → ${phone11}`); return 'dry_run'; }
  const r = await httpPost('https://www.wasenderapi.com/api/send-message',
    { Authorization: `Bearer ${WASENDER_KEY}` },
    { to: `${phone11}@s.whatsapp.net`, text: message }
  );
  try { return JSON.parse(r.body)?.success ? 'sent' : 'failed'; }
  catch { return 'failed'; }
}

// ── Email (Zoho SMTP via Python) ──────────────────────────────────────────────
function sendEmail(toEmail, company, message) {
  if (DRY_RUN) { console.log(`  [DRY] Email → ${toEmail}`); return 'dry_run'; }
  const subject = `Propuesta - ${company}`;
  const py = `
import smtplib, sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
m = MIMEMultipart('alternative')
m['Subject'] = """${subject.replace(/"/g,'\\"')}"""
m['From']    = 'Rey Martinez <rey@ai50m.com>'
m['To']      = '${toEmail}'
m.attach(MIMEText("""${message.replace(/"/g,'\\"').replace(/\\/g,'\\\\')}""", 'plain'))
try:
    with smtplib.SMTP_SSL('${SMTP_HOST}', ${SMTP_PORT}) as s:
        s.login('${SMTP_USER}', '${SMTP_PASS}')
        s.sendmail('${SMTP_USER}', '${toEmail}', m.as_string())
    print('sent')
except Exception as e:
    print('failed:', e, file=sys.stderr)
    sys.exit(1)
`;
  try {
    const out = execSync(`python3 << 'PYEOF'\n${py}\nPYEOF`, { timeout: 15000 }).toString().trim();
    return out.includes('sent') ? 'sent' : 'failed';
  } catch { return 'failed'; }
}

// ── Zoho CRM ──────────────────────────────────────────────────────────────────
async function getZohoToken() {
  const r = await httpPost('https://accounts.zoho.com/oauth/v2/token', {},
    { grant_type: 'refresh_token', client_id: ZOHO_CLIENT_ID, client_secret: ZOHO_SECRET, refresh_token: ZOHO_REFRESH }
  );
  // Zoho token endpoint uses form data, not JSON — use URL params instead
  return new Promise(resolve => {
    const params = `grant_type=refresh_token&client_id=${ZOHO_CLIENT_ID}&client_secret=${ZOHO_SECRET}&refresh_token=${ZOHO_REFRESH}`;
    const req = https.request({
      hostname: 'accounts.zoho.com', path: '/oauth/v2/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params) }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).access_token || null); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(params); req.end();
  });
}

async function upsertZohoLead(biz, channel) {
  try {
    const token = await getZohoToken();
    if (!token) return;
    const nicheTag = biz.niche === 'dental' ? 'Dental Miami' : biz.niche === 'auto_dealer' ? 'Auto Dealer Miami' : 'Hotel Miami';
    await httpPost('https://www.zohoapis.com/crm/v2/Leads',
      { Authorization: `Zoho-oauthtoken ${token}` },
      {
        data: [{
          Last_Name: biz.owner_name || biz.company,
          First_Name: biz.first_name || '',
          Company: biz.company,
          Email: biz.email || '',
          Phone: biz.phone || '',
          Lead_Source: 'Web Research',
          Lead_Status: 'Not Contacted',
          Description: `AI50M Outreach — ${biz.niche} — ${channel} — ${new Date().toISOString().split('T')[0]}`,
          Website: biz.website || ''
        }],
        duplicate_check_fields: ['Email', 'Phone']
      }
    );
  } catch (e) { console.warn('  ⚠️ Zoho CRM log failed (non-fatal):', e.message?.slice(0,50)); }
}

// ── Find email via Claude ─────────────────────────────────────────────────────
async function findEmail(company, website) {
  const r = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    {
      model: 'claude-haiku-4-5', max_tokens: 100,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      messages: [{ role: 'user', content: `Find public contact email for ${company} in Miami. Website: ${website||'?'}. Return ONLY the email address or the word "none".` }]
    }
  );
  try {
    const text = (JSON.parse(r.body).content||[]).find(b=>b.type==='text')?.text||'';
    const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0].toLowerCase() : null;
  } catch { return null; }
}

// ── Find businesses via Claude web_search ─────────────────────────────────────
async function findBusinesses(searched) {
  const skip = Object.keys(searched).slice(0,100).join(', ') || 'none';
  const r = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'web-search-2025-03-05' },
    {
      model: 'claude-opus-4-5', max_tokens: 5000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 20 }],
      messages: [{
        role: 'user',
        content: `Find 50 real Miami FL businesses: 17 independent dental clinics, 17 independent auto dealers, 16 boutique hotels (<100 rooms). NOT chains. Skip: ${skip}. For each find name, website, phone (+1XXXXXXXXXX), owner first name, public email. Return ONLY JSON array: [{"company":"","website":"","phone":"","owner_name":"","first_name":"","email":"","niche":"dental|auto_dealer|boutique_hotel"}]`
      }]
    }
  );
  try {
    const parsed = JSON.parse(r.body);
    for (const b of (parsed.content||[]).filter(x=>x.type==='text')) {
      const m = b.text.match(/\[[\s\S]*?\]/);
      if (m) try { return JSON.parse(m[0]); } catch {}
    }
  } catch (e) { console.error('findBusinesses parse error:', e.message); }
  return [];
}

// ── Generate personalized message ─────────────────────────────────────────────
async function generateMessage(biz, siteText) {
  const greeting = biz.first_name ? `Hola ${biz.first_name} 👋` : 'Hola 👋';
  const r = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    {
      model: 'claude-haiku-4-5', max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Write Spanish WhatsApp outreach for AI50M (Miami AI automation agency).
Business: ${biz.company} (${biz.niche})
Website content: ${siteText?.slice(0,500)||'N/A'}

Use EXACTLY this format:
${greeting}

Vi que ${biz.company} [1 specific operational bottleneck].

Automatizamos eso:
✓ [Specific hours saved/week]
✓ [$X annual savings]
✓ [Niche-specific benefit]

¿Nos damos una llamada de 15 min?

Rey Martinez
AI50M | Miami, FL
rey@ai50m.com | 786-969-3419

Rules: NO links. Under 160 words. Specific, not generic.
After message on new line add: {"weeklyHours":N,"annualSavings":N,"painPoint":"..."}`
      }]
    }
  );
  try {
    const text = (JSON.parse(r.body).content||[]).find(b=>b.type==='text')?.text||'';
    const jm = text.match(/\{"weeklyHours"[\s\S]*?\}/);
    const meta = jm ? JSON.parse(jm[0]) : {};
    return { message: text.replace(/\{"weeklyHours"[\s\S]*?\}/,'').trim(), meta };
  } catch { return { message: null, meta: {} }; }
}

// ── Generate follow-up message ────────────────────────────────────────────────
async function generateFollowUp(biz) {
  const greeting = biz.first_name ? `Hola ${biz.first_name} 👋` : 'Hola 👋';
  const r = await httpPost('https://api.anthropic.com/v1/messages',
    { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    {
      model: 'claude-haiku-4-5', max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Write a SHORT Spanish follow-up WhatsApp (under 80 words) for ${biz.company} (${biz.niche}) in Miami. Different angle from initial message. Start: "${greeting}\n\nSolo quería saber si tuviste oportunidad de ver mi mensaje anterior." Include a specific stat for ${biz.niche}. End with "¿5 minutos esta semana?\n\nRey Martinez\nAI50M | Miami, FL\nrey@ai50m.com | 786-969-3419". NO links.`
      }]
    }
  );
  try {
    return (JSON.parse(r.body).content||[]).find(b=>b.type==='text')?.text?.trim() || null;
  } catch { return null; }
}

// ── Check and send follow-ups (48h rule) ──────────────────────────────────────
async function checkFollowUps(dedup) {
  const now = Date.now();
  let count = 0;
  for (const [slug, entry] of Object.entries(dedup)) {
    if (typeof entry !== 'object' || entry.status !== 'in_cadence' || entry.followup_sent) continue;
    const age = now - new Date(entry.contacted_at || entry.date).getTime();
    if (age < 48 * 3600 * 1000) continue;

    console.log(`  📬 Follow-up: ${entry.company}`);
    const msg = await generateFollowUp(entry);
    if (!msg) continue;

    let result = 'failed';
    if (entry.channel === 'whatsapp' && entry.phone) {
      result = await sendWhatsApp(entry.phone, msg);
    } else if (entry.channel === 'email' && entry.email) {
      result = sendEmail(entry.email, entry.company, msg);
    }

    if (result === 'sent' || result === 'dry_run') {
      entry.followup_sent = true;
      entry.followup_at = new Date().toISOString();
      entry.status = 'followup_sent';
      count++;
    }
    await sleep(2000);
  }
  return count;
}

// ── Daily report ──────────────────────────────────────────────────────────────
function sendDailyReport(stats, totalInDedup) {
  const date = new Date().toISOString().split('T')[0];
  const body = `AI50M Outreach Report — ${date}

WhatsApp enviados:  ${stats.wa}
Emails enviados:    ${stats.email}
Follow-ups:         ${stats.followup}
Skipped (dup):      ${stats.skip}
Sin contacto:       ${stats.no_contact}
Errores:            ${stats.err}

Total en dedup:     ${totalInDedup}
────────────────────
Total contactados hoy: ${stats.wa + stats.email}

— AI50M Outreach Engine`;

  sendEmail('rey@ai50m.com', 'AI50M Daily Report', body);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function runDailyOutreach() {
  console.log(`\n🚀 AI50M Daily Outreach v3 — ${new Date().toISOString()}`);
  if (DRY_RUN) console.log('⚠️  DRY RUN\n');

  const dedup = loadDedup();
  console.log(`📋 Dedup: ${Object.keys(dedup).length} entries\n`);

  const stats = { wa: 0, email: 0, followup: 0, skip: 0, no_contact: 0, err: 0 };

  // 1. Send pending follow-ups first
  console.log('📬 Checking follow-ups (48h rule)...');
  stats.followup = await checkFollowUps(dedup);
  saveDedup(dedup);
  console.log(`   ${stats.followup} follow-ups sent\n`);

  // 2. Find new businesses
  console.log('🔍 Finding 50 new businesses via Claude...');
  const businesses = await findBusinesses(dedup);
  console.log(`   Found ${businesses.length} candidates\n`);

  // 3. Process each business
  for (let i = 0; i < Math.min(businesses.length, 50); i++) {
    const biz = businesses[i];
    const slug = slugify(biz.company);

    if (dedup[slug]) { stats.skip++; continue; }

    console.log(`\n[${i+1}/${businesses.length}] ${biz.company} (${biz.niche})`);

    // Validate phone
    const phone = validatePhone(biz.phone);
    let email = validateEmail(biz.email);
    let channel = null, validPhone = null;

    if (phone) {
      console.log(`  📱 Phone: +${phone} — checking WhatsApp...`);
      const hasWA = await checkWhatsApp(phone);
      if (hasWA) { channel = 'whatsapp'; validPhone = phone; console.log(`  ✅ WhatsApp confirmed`); }
      else console.log(`  ❌ Not on WhatsApp`);
    }

    // Email fallback
    if (!channel) {
      if (!email) {
        console.log(`  🔍 Searching email...`);
        email = await findEmail(biz.company, biz.website);
      }
      if (email) { channel = 'email'; console.log(`  📧 Email: ${email}`); }
      else { console.log(`  ⛔ No contact found — skip`); stats.no_contact++; dedup[slug] = { date: new Date().toISOString().split('T')[0], status: 'skipped', company: biz.company, niche: biz.niche }; saveDedup(dedup); continue; }
    }

    // Scrape website
    let siteText = '';
    if (biz.website) {
      const html = await httpGet(biz.website);
      siteText = stripHtml(html);
    }

    // Generate message
    console.log(`  ✍️  Generating message...`);
    const { message, meta } = await generateMessage(biz, siteText);
    if (!message) { console.log(`  ❌ Message failed`); stats.err++; continue; }
    console.log(`  💡 ${meta.painPoint||'—'} | ${meta.weeklyHours||'?'}h/wk | $${(meta.annualSavings||0).toLocaleString()}/yr`);

    // Send
    let result;
    if (channel === 'whatsapp') {
      result = await sendWhatsApp(validPhone, message);
      if (result === 'sent' || result === 'dry_run') stats.wa++; else stats.err++;
    } else {
      result = sendEmail(email, biz.company, message);
      if (result === 'sent' || result === 'dry_run') stats.email++; else stats.err++;
    }
    console.log(`  📤 ${channel.toUpperCase()}: ${result}`);

    // Zoho CRM (non-fatal)
    await upsertZohoLead({ ...biz, phone: validPhone, email }, channel);

    // Save to dedup
    dedup[slug] = {
      date: new Date().toISOString().split('T')[0],
      channel, phone: validPhone, email,
      contacted_at: new Date().toISOString(),
      followup_sent: false, followup_at: null,
      responded: false, status: (result==='sent'||result==='dry_run') ? 'in_cadence' : 'error',
      company: biz.company, niche: biz.niche
    };
    saveDedup(dedup);
    await sleep(2500);
  }

  // 4. Daily report
  sendDailyReport(stats, Object.keys(dedup).length);

  console.log('\n' + '═'.repeat(50));
  console.log('📊 SUMMARY');
  console.log('═'.repeat(50));
  console.log(`  WhatsApp:    ${stats.wa}`);
  console.log(`  Email:       ${stats.email}`);
  console.log(`  Follow-ups:  ${stats.followup}`);
  console.log(`  Skipped:     ${stats.skip}`);
  console.log(`  No contact:  ${stats.no_contact}`);
  console.log(`  Errors:      ${stats.err}`);
  console.log(`  Dedup total: ${Object.keys(dedup).length}`);
  console.log('═'.repeat(50) + '\n');
}

// CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) runDailyOutreach().catch(e => { console.error('Fatal:', e); process.exit(1); });

export { runDailyOutreach };

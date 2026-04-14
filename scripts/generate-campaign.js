/**
 * generate-campaign.js
 * AI50M — Campaign Generator
 * 
 * Usage:
 *   node scripts/generate-campaign.js \
 *     --company "Super Dentist Miami" \
 *     --website "https://superdentist.com" \
 *     --phone "17861234567" \
 *     --email "owner@superdentist.com" \
 *     --name "Carlos" \
 *     --industry "healthcare" \
 *     [--send-whatsapp] [--dry-run]
 * 
 * WhatsApp Strategy (v2 — No Links):
 *   Initial message = direct value prop + CTA "llamada 15 min"
 *   No links until prospect responds and requests more info
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const GH_TOKEN      = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const GH_REPO       = 'miamisupportai-creator/auto-solution-downloader';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const WASENDER_KEY  = process.env.WASENDER_API_KEY || '972438be02d23af9024060ff42ff6158d7e343c9761798480f8efd7fd38135d2';
const BASE_URL      = process.env.BASE_URL || 'https://miamisupportai-creator.github.io/auto-solution-downloader';

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpGet(url, timeout = 8000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve(buf.substring(0, 3000)));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpPut(url, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Slugify ───────────────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Step 1: Scrape website ────────────────────────────────────────────────────
async function scrapeWebsite(website) {
  if (!website) return '';
  const url = website.startsWith('http') ? website : `https://${website}`;
  console.log(`  🌐 Scraping ${url}...`);
  const html = await httpGet(url);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.substring(0, 2000);
}

// ── Step 2: Claude AI analysis ────────────────────────────────────────────────
async function analyzeWithClaude(company, industry, websiteText) {
  console.log(`  🤖 Analyzing with Claude AI...`);
  
  const prompt = `Analyze this business and return a JSON campaign data object for an AI automation proposal.

Company: ${company}
Industry: ${industry || 'unknown'}
Website content: ${websiteText || 'Not available'}

Return ONLY valid JSON with this exact structure:
{
  "heroSubtitle": "1 sentence describing their main operational pain point",
  "problemTitle": "Short title (5-7 words) for their problem section",
  "problemSub": "1 sentence elaborating the problem",
  "problems": [
    {"icon": "emoji", "title": "Problem name", "desc": "1-2 sentences"},
    {"icon": "emoji", "title": "Problem name", "desc": "1-2 sentences"},
    {"icon": "emoji", "title": "Problem name", "desc": "1-2 sentences"}
  ],
  "costNum": "Xh",
  "costLabel": "description of what those hours mean",
  "before": ["manual task 1", "manual task 2", "manual task 3"],
  "after": ["automated version 1", "automated version 2", "automated version 3"],
  "metrics": [
    {"num": "Xh", "label": "Hours saved per week"},
    {"num": "$X,XXX", "label": "Monthly value recovered"},
    {"num": "Xd", "label": "Payback period"},
    {"num": "24/7", "label": "Automated operation"}
  ],
  "features": [
    {"icon": "emoji", "title": "Feature name", "desc": "1-2 sentences specific to this business"},
    {"icon": "emoji", "title": "Feature name", "desc": "1-2 sentences specific to this business"},
    {"icon": "emoji", "title": "Feature name", "desc": "1-2 sentences specific to this business"}
  ],
  "waMessage": "WhatsApp outreach message in Spanish. NO LINKS. Format exactly:

Hola [NAME] 👋

[1 specific insight about their business — show you did research]

Automatizamos [specific pain point]:
✓ [Quantified benefit 1]
✓ [Quantified benefit 2]
✓ [Quantified benefit 3]

¿Nos damos una llamada de 15 min?

Rey Martinez
AI50M | Miami, FL
rey@ai50m.com | 786-969-3419",
  "weeklyHours": 35,
  "annualSavings": 60000
}`;

  const res = await httpPost('https://api.anthropic.com/v1/messages', {
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01'
  }, {
    model: 'claude-haiku-4-5',
    max_tokens: 1200,
    system: 'You are a B2B sales intelligence engine for AI50M, a Miami-based automation agency. Always return valid JSON only. WhatsApp messages must NEVER contain URLs or links.',
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const raw = res.body.content[0].text;
    const cleaned = raw.replace(/```json
?|
?```/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      heroSubtitle: `${company} pierde horas cada semana en procesos manuales que podemos automatizar.`,
      problemTitle: 'El costo del trabajo manual',
      problemSub: 'Tareas repetitivas que drenan tiempo y dinero cada día.',
      problems: [
        { icon: '⏱', title: 'Tiempo perdido', desc: 'Horas semanales en tareas que una IA puede hacer en segundos.' },
        { icon: '❌', title: 'Respuesta lenta', desc: 'Clientes esperando cuando deberían recibir respuesta inmediata.' },
        { icon: '📉', title: 'Sin escalabilidad', desc: 'El negocio no puede crecer sin contratar más personal.' }
      ],
      costNum: '35h', costLabel: 'horas/semana perdidas en trabajo manual',
      before: ['Respuestas manuales a clientes', 'Seguimientos por WhatsApp uno a uno', 'Reportes hechos a mano'],
      after: ['IA responde en <60 seg, 24/7', 'Secuencias automáticas y personalizadas', 'Dashboards en tiempo real'],
      metrics: [
        { num: '35h', label: 'Horas ahorradas por semana' },
        { num: '$4,200', label: 'Valor recuperado mensualmente' },
        { num: '21d', label: 'Tiempo de payback' },
        { num: '24/7', label: 'Operación automatizada' }
      ],
      features: [
        { icon: '🤖', title: 'Agente de IA', desc: 'Maneja consultas entrantes y califica leads 24/7 sin intervención humana.' },
        { icon: '⚡', title: 'Automatización de procesos', desc: 'Los flujos repetitivos corren solos: recordatorios, seguimientos, reportes.' },
        { icon: '📊', title: 'Dashboard unificado', desc: 'Todos tus canales y métricas en un solo lugar, en tiempo real.' }
      ],
      waMessage: `Hola [NAME] 👋

Analizamos las operaciones de ${company} y detectamos oportunidades claras de automatización.

Podemos ayudarte a:
✓ Ahorrar 35+ horas/semana en procesos manuales
✓ Responder a clientes en <60 segundos, 24/7
✓ Recuperar $50,000+ anuales en eficiencia operacional

¿Nos damos una llamada de 15 min?

Rey Martinez
AI50M | Miami, FL
rey@ai50m.com | 786-969-3419`,
      weeklyHours: 35,
      annualSavings: 50000
    };
  }
}

// ── Step 3: Build landing page ────────────────────────────────────────────────
function buildLandingPage(slug, company, analysis, pdfUrl) {
  const templatePath = path.join(__dirname, '../templates/landing-page.html');
  let template = fs.readFileSync(templatePath, 'utf-8');

  const landingUrl = `${BASE_URL}/campaigns/${slug}/`;
  
  const data = {
    company,
    badge: `Propuesta personalizada · AI50M`,
    heroSubtitle: analysis.heroSubtitle,
    pdfUrl,
    problemTitle: analysis.problemTitle,
    problemSub: analysis.problemSub,
    problems: analysis.problems,
    costNum: analysis.costNum,
    costLabel: analysis.costLabel,
    before: analysis.before,
    after: analysis.after,
    metrics: analysis.metrics,
    features: analysis.features,
    timeline: [
      { phase: 'Semana 1', name: 'Discovery & Setup', desc: `Auditoría de procesos de ${company}. Conexión de sistemas existentes. Mapa de automatización.` },
      { phase: 'Semanas 2–3', name: 'Construcción', desc: 'Desarrollo de agentes IA. Integración con herramientas actuales. Testing con datos reales.' },
      { phase: 'Semana 4+', name: 'Lanzamiento', desc: 'Go live. Monitoreo en tiempo real. Optimización basada en resultados.' }
    ],
    ctaSub: `15 minutos. Plan concreto para ${company}. Sin compromiso.`,
    investmentRange: '$800 – $1,600/mes'
  };

  const dataScript = `<script>window.CAMPAIGN_DATA = ${JSON.stringify(data, null, 2)};</script>`;
  template = template.replace('<script>', dataScript + '
<script>');

  return template;
}

// ── Step 4: Save to GitHub ────────────────────────────────────────────────────
async function saveToGitHub(filePath, content, message) {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${filePath}`;
  const headers = { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'ai50m-campaign-generator' };
  
  let sha;
  try {
    const check = await new Promise((resolve) => {
      https.get(url, { headers }, res => {
        let buf = ''; res.on('data', c => buf += c); res.on('end', () => resolve(JSON.parse(buf)));
      }).on('error', () => resolve({}));
    });
    sha = check.sha;
  } catch {}

  const encoded = Buffer.from(content).toString('base64');
  const payload = { message, content: encoded, committer: { name: 'AI50M', email: 'rey@ai50m.com' } };
  if (sha) payload.sha = sha;

  const res = await httpPut(url, headers, payload);
  return res.status === 200 || res.status === 201;
}

// ── Step 5: Send WhatsApp (no-link format) ────────────────────────────────────
async function sendWhatsApp(phone, message) {
  const cleaned = phone.replace(/\D/g, '');
  const jid = (cleaned.startsWith('1') ? cleaned : '1' + cleaned) + '@s.whatsapp.net';
  
  const res = await httpPost('https://www.wasenderapi.com/api/send-message', {
    'Authorization': `Bearer ${WASENDER_KEY}`
  }, { to: jid, text: message });

  return res.body?.success;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generateCampaign({ company, website, phone, email, name, industry, sendWhatsapp = false, dryRun = false }) {
  console.log(`
🚀 AI50M Campaign Generator v2 (No-Link Strategy)`);
  console.log(`─────────────────────────────`);
  console.log(`📋 Company: ${company}`);
  console.log(`🌐 Website: ${website || 'none'}`);
  console.log(`📱 Phone:   ${phone || 'none'}`);

  const slug = slugify(company);
  
  // 1. Scrape
  console.log('
[1/5] Scraping website...');
  const siteText = await scrapeWebsite(website);

  // 2. Analyze
  console.log('[2/5] Analyzing with Claude AI...');
  const analysis = await analyzeWithClaude(company, industry, siteText);

  const pdfPath = `campaigns/${slug}/propuesta-${slug}.pdf`;
  const landingPath = `campaigns/${slug}/index.html`;
  const pdfUrl = `${BASE_URL}/${pdfPath}`;

  // 3. Build landing page (saved but NOT sent in initial WhatsApp)
  console.log('[3/5] Building landing page...');
  const landingHtml = buildLandingPage(slug, company, analysis, pdfUrl);

  if (!dryRun) {
    // 4. Save landing page to GitHub (for when prospect asks for more info)
    console.log('[4/5] Saving landing page to GitHub...');
    await saveToGitHub(landingPath, landingHtml, `campaign: ${company} — landing page`);
    console.log(`  ✅ Landing page ready (for follow-up use)`);
  }

  // 5. Send WhatsApp — NO LINK, direct value prop
  if (sendWhatsapp && phone && !dryRun) {
    console.log('[5/5] Sending WhatsApp (no-link format)...');
    const firstName = name?.split(' ')[0] || name || '';
    
    // Replace [NAME] with actual name or remove it gracefully
    let waMessage = analysis.waMessage;
    if (firstName) {
      waMessage = waMessage.replace('[NAME]', firstName);
    } else {
      waMessage = waMessage.replace('Hola [NAME] 👋', 'Hola 👋');
    }
    
    // Ensure no links slipped through
    waMessage = waMessage.replace(/\{URL\}/g, '').replace(/https?:\/\/\S+/g, '').trim();
    
    console.log('
📱 WhatsApp message preview:');
    console.log('─'.repeat(40));
    console.log(waMessage);
    console.log('─'.repeat(40));
    
    const sent = await sendWhatsApp(phone, waMessage);
    console.log(`
  ${sent ? '✅' : '❌'} WhatsApp to ${phone}: ${sent ? 'sent' : 'failed'}`);
  }

  const landingUrl = `${BASE_URL}/campaigns/${slug}/`;
  
  console.log('
─────────────────────────────');
  console.log(`✅ Campaign ready:`);
  console.log(`   Landing (for follow-up): ${landingUrl}`);
  console.log(`   Slug:    ${slug}`);
  console.log(`   Hours/week saved: ${analysis.weeklyHours}`);
  console.log(`   Annual savings:   $${(analysis.annualSavings || 0).toLocaleString()}`);

  return { slug, landingUrl, pdfUrl, analysis };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(name) { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; }

if (argv.includes('--company')) {
  generateCampaign({
    company:    arg('company'),
    website:    arg('website'),
    phone:      arg('phone'),
    email:      arg('email'),
    name:       arg('name'),
    industry:   arg('industry'),
    sendWhatsapp: argv.includes('--send-whatsapp'),
    dryRun:     argv.includes('--dry-run')
  }).catch(err => { console.error('Error:', err.message); process.exit(1); });
}

export { generateCampaign };

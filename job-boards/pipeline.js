#!/usr/bin/env node
/**
 * ai50m — Job Board Pipeline (v2)
 * Full lead routing: Scrape → Enrich (Clay + Claude AI) → Score → Route
 * COLD: Smartlead long-nurture | WARM: Smartlead immediate | HOT: WhatsApp + Smartlead
 * Run: node job-boards/pipeline.js [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config({ override: true });

import { scrapeIndeedLeads } from './apify-scraper.js';
import { enrichBatch } from './clay-enrichment.js';
import { scoreLead, filterNewLeads, loadProcessed, getLeadKey } from './lead-filter.js';
import { addBatchToSmartlead } from './smartlead-outreach.js';
import { enrichBatchWithAI } from './enrichment-engine.js';
import { routeLead, getSmartleadConfig } from './routing-engine.js';
import { sendBatchHotLeadOutreach } from './whatsapp-outreach.js';
import { getDailyStats, sendSlackReport } from './analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../logs');
const PROCESSED_FILE = path.join(LOGS_DIR, 'job-boards-processed.json');
const RESULTS_FILE = path.join(LOGS_DIR, 'job-boards-results.json');

const DRY_RUN = process.argv.includes('--dry-run');
const MIN_OUTREACH_SCORE = parseInt(process.env.MIN_OUTREACH_SCORE || '45');

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

function loadResults() {
  if (!existsSync(RESULTS_FILE)) return [];
  try { return JSON.parse(readFileSync(RESULTS_FILE, 'utf-8')); }
  catch { return []; }
}

function saveProcessed(processed, newKeys) {
  const updated = [...processed, ...newKeys];
  writeFileSync(PROCESSED_FILE, JSON.stringify({
    processed: updated,
    lastRun: new Date().toISOString(),
    count: updated.length,
  }, null, 2));
}

function saveResults(allResults, newResults) {
  const combined = [...allResults, ...newResults].slice(-1000);
  writeFileSync(RESULTS_FILE, JSON.stringify(combined, null, 2));
}

async function updateZohoCRM(lead) {
  const ZOHO_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
  const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || 'www.zohoapis.com';
  if (!ZOHO_TOKEN) return { skipped: true };

  const { default: https } = await import('https');
  const tierMap = { HOT: 'Hot', WARM: 'Warm', COLD: 'Cold' };
  const crmStatus = tierMap[lead.tier] || 'Cold';

  const painPointsSummary = Array.isArray(lead.painPoints)
    ? lead.painPoints.join(' | ')
    : '';

  const payload = JSON.stringify({
    data: [{
      Last_Name: lead.contactName || lead.company,
      Company: lead.company,
      Email: lead.contactEmail || '',
      Website: lead.website || '',
      Lead_Source: 'Job Board - Indeed',
      Lead_Status: crmStatus,
      Rating: lead.tier,
      Description: [
        `Score: ${lead.leadScore}`,
        lead.scoreNotes ? `Notes: ${lead.scoreNotes}` : '',
        `Job: ${lead.jobTitle || ''}`,
        painPointsSummary ? `Pain Points: ${painPointsSummary}` : '',
        lead.pitchAngle ? `Pitch: ${lead.pitchAngle}` : '',
        `Urgency: ${lead.urgency || 'UNKNOWN'}`,
      ].filter(Boolean).join(' | '),
      Industry: lead.industry || '',
      No_of_Employees: lead.employeeCount || 0,
    }],
    trigger: ['approval', 'workflow'],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: ZOHO_DOMAIN,
      path: '/crm/v3/Leads',
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${ZOHO_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', () => resolve({ status: 'error' }));
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  ai50m — Job Board Pipeline v2               ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  if (DRY_RUN) console.log('  [DRY RUN MODE]\n');

  ensureLogsDir();
  const processed = loadProcessed();
  const previousResults = loadResults();
  console.log(`📁 Previously processed: ${processed.size} companies\n`);

  // STEP 1: Scrape
  console.log('STEP 1: Scraping Indeed via Apify...');
  let rawLeads = [];
  try {
    rawLeads = await scrapeIndeedLeads();
    console.log(`  Found: ${rawLeads.length} raw leads`);
  } catch (err) {
    console.error('❌ Apify scrape failed:', err.message);
    process.exit(1);
  }

  if (rawLeads.length === 0) {
    console.log('No leads found — exiting.');
    process.exit(0);
  }

  // STEP 2: Filter new
  console.log('\nSTEP 2: Filtering new leads...');
  const newLeads = filterNewLeads(rawLeads, processed);
  console.log(`  New: ${newLeads.length}/${rawLeads.length}`);

  if (newLeads.length === 0) {
    console.log('All leads already processed — exiting.');
    process.exit(0);
  }

  const batchLeads = newLeads.slice(0, 20);

  // STEP 3: Clay enrichment
  console.log('\nSTEP 3: Enriching via Clay...');
  const clayEnriched = await enrichBatch(batchLeads);
  console.log(`  Enriched: ${clayEnriched.length} leads`);

  // STEP 4: Score
  console.log('\nSTEP 4: Scoring leads...');
  const scoredLeads = clayEnriched.map(scoreLead);
  const hotCount = scoredLeads.filter(l => (l.leadScore ?? 0) >= 80).length;
  const warmCount = scoredLeads.filter(l => (l.leadScore ?? 0) >= 50 && (l.leadScore ?? 0) < 80).length;
  const coldCount = scoredLeads.filter(l => (l.leadScore ?? 0) < 50).length;
  console.log(`  HOT: ${hotCount} | WARM: ${warmCount} | COLD: ${coldCount}`);

  // STEP 5: Claude AI enrichment (warm+hot only)
  console.log('\nSTEP 5: Running Claude AI enrichment (warm/hot leads)...');
  const aiEnriched = await enrichBatchWithAI(scoredLeads);
  const aiEnrichedCount = aiEnriched.filter(l => l.aiEnriched).length;
  console.log(`  AI analyzed: ${aiEnrichedCount}/${aiEnriched.length} leads`);

  // STEP 6: Routing decisions
  console.log('\nSTEP 6: Computing routing decisions...');
  const routedLeads = aiEnriched.map(lead => {
    const routing = routeLead(lead);
    return {
      ...lead,
      tier: routing.tier,
      routingAction: routing.action,
      routingChannel: routing.channel,
      routingPriority: routing.priority,
      outreachMessage: routing.message,
      processedAt: new Date().toISOString(),
    };
  });

  routedLeads.sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0));
  console.log('  Top leads:');
  for (const l of routedLeads.slice(0, 5)) {
    console.log(`    [${l.tier}] ${l.company} — score:${l.leadScore} — ${l.jobTitle}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Skipping all outreach steps\n');
    for (const l of routedLeads) {
      console.log(`  ${l.tier} → ${l.company} | ${l.routingChannel} | score:${l.leadScore}`);
      if (l.pitchAngle) console.log(`    Pitch: ${l.pitchAngle}`);
    }
  } else {
    // STEP 7: HOT → WhatsApp
    const hotLeads = routedLeads.filter(l => l.tier === 'HOT');
    if (hotLeads.length > 0) {
      console.log(`\nSTEP 7: Sending WhatsApp to ${hotLeads.length} HOT leads...`);
      const waResult = await sendBatchHotLeadOutreach(hotLeads);
      console.log(`  Sent: ${waResult.sent} | Failed: ${waResult.failed} | Skipped: ${waResult.skipped}`);
    } else {
      console.log('\nSTEP 7: No HOT leads — skipping WhatsApp');
    }

    // STEP 8: All → Smartlead
    console.log('\nSTEP 8: Adding leads to Smartlead...');
    const smartleadReadyLeads = routedLeads.map(lead => ({
      ...lead,
      smartleadConfig: getSmartleadConfig(lead),
    }));
    await addBatchToSmartlead(smartleadReadyLeads, MIN_OUTREACH_SCORE);
    console.log(`  Added ${routedLeads.length} leads to Smartlead`);

    // STEP 9: HOT+WARM → Zoho CRM
    const crmLeads = routedLeads.filter(l => (l.leadScore ?? 0) >= 60);
    if (crmLeads.length > 0) {
      console.log(`\nSTEP 9: Updating Zoho CRM (${crmLeads.length} leads)...`);
      for (const lead of crmLeads) {
        try {
          const res = await updateZohoCRM(lead);
          if (!res.skipped) console.log(`  Zoho: ${lead.company} → ${res.status}`);
        } catch (err) {
          console.warn(`  ⚠ Zoho failed for ${lead.company}: ${err.message}`);
        }
      }
    } else {
      console.log('\nSTEP 9: No leads above CRM threshold');
    }
  }

  // STEP 10: Save state
  const newKeys = routedLeads.map(getLeadKey);
  saveProcessed(processed, newKeys);
  saveResults(previousResults, routedLeads);
  console.log('\n✅ State saved');

  // STEP 11: Analytics + Slack
  console.log('\nSTEP 11: Generating analytics...');
  const stats = getDailyStats();
  console.log(`  Today: ${stats.totalLeads} leads | 🔥${stats.hot} 🟡${stats.warm} ❄️${stats.cold}`);
  console.log(`  WhatsApp: ${stats.whatsappSent} sent | Emails: ${stats.emailsSent} sent`);
  if (!DRY_RUN) await sendSlackReport();

  const finalHot = routedLeads.filter(l => l.tier === 'HOT').length;
  const finalWarm = routedLeads.filter(l => l.tier === 'WARM').length;
  const finalCold = routedLeads.filter(l => l.tier === 'COLD').length;

  console.log('\n═══════════════════════════════════════════════');
  console.log('✅  Pipeline complete');
  console.log(`   Processed this run : ${routedLeads.length}`);
  console.log(`   🔥 HOT  : ${finalHot}  → WhatsApp + Smartlead`);
  console.log(`   🟡 WARM : ${finalWarm}  → Smartlead (immediate)`);
  console.log(`   ❄️  COLD : ${finalCold}  → Smartlead (long-nurture)`);
  console.log(`   AI enriched        : ${aiEnrichedCount}`);
  console.log(`   Total ever         : ${[...processed].length + newKeys.length}`);
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

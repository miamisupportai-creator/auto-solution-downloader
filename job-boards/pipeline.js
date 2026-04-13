#!/usr/bin/env node
/**
 * ai50m — Job Board Pipeline
 * Scrapes Indeed (via Apify) → enriches (Clay) → outreach (Smartlead) → logs to Zoho
 * Run: node job-boards/pipeline.js
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
  const combined = [...allResults, ...newResults].slice(-1000); // keep last 1000
  writeFileSync(RESULTS_FILE, JSON.stringify(combined, null, 2));
}

async function updateZohoCRM(lead) {
  const ZOHO_TOKEN = process.env.ZOHO_ACCESS_TOKEN;
  const ZOHO_DOMAIN = process.env.ZOHO_DOMAIN || 'www.zohoapis.com';
  if (!ZOHO_TOKEN) return;

  const { default: https } = await import('https');
  const payload = JSON.stringify({
    data: [{
      Last_Name: lead.contactName || lead.company,
      Company: lead.company,
      Email: lead.contactEmail || '',
      Website: lead.website || '',
      Lead_Source: 'Job Board - Indeed',
      Lead_Status: lead.tier === 'HOT' ? 'Hot' : lead.tier === 'WARM' ? 'Warm' : 'Cold',
      Rating: lead.tier,
      Description: `Score: ${lead.leadScore} | ${lead.scoreNotes} | Job Found: ${lead.jobTitle}`,
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
    req.on('error', resolve);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  ai50m — Job Board Pipeline ${DRY_RUN ? '(DRY RUN)' : ''}`.padEnd(42) + '║');
  console.log('╚══════════════════════════════════════════╝\n');

  ensureLogsDir();
  const processed = loadProcessed();
  const previousResults = loadResults();
  console.log(`📁 Previously processed: ${processed.size} companies\n`);

  // STEP 1: Scrape Indeed via Apify
  console.log('STEP 1: Scraping Indeed via Apify...');
  let rawLeads = [];
  try {
    rawLeads = await scrapeIndeedLeads();
  } catch (err) {
    console.error('❌ Apify scrape failed:', err.message);
    process.exit(1);
  }

  if (rawLeads.length === 0) {
    console.log('No leads found — exiting.');
    process.exit(0);
  }

  // STEP 2: Filter new leads
  console.log('\nSTEP 2: Filtering new leads...');
  const newLeads = filterNewLeads(rawLeads, processed);
  console.log(`  New: ${newLeads.length}/${rawLeads.length}`);

  if (newLeads.length === 0) {
    console.log('All leads already processed — exiting.');
    process.exit(0);
  }

  // STEP 3: Enrich via Clay
  console.log('\nSTEP 3: Enriching via Clay...');
  const enrichedLeads = await enrichBatch(newLeads.slice(0, 20)); // max 20 per run

  // STEP 4: Score leads
  console.log('\nSTEP 4: Scoring leads...');
  const scoredLeads = enrichedLeads.map(scoreLead);
  const hot = scoredLeads.filter(l => l.tier === 'HOT').length;
  const warm = scoredLeads.filter(l => l.tier === 'WARM').length;
  const cold = scoredLeads.filter(l => l.tier === 'COLD').length;
  console.log(`  HOT: ${hot} | WARM: ${warm} | COLD: ${cold}`);

  scoredLeads.sort((a, b) => b.leadScore - a.leadScore);
  for (const l of scoredLeads.slice(0, 5)) {
    console.log(`  [${l.tier}] ${l.company} — score:${l.leadScore} — ${l.jobTitle}`);
  }

  // STEP 5: Smartlead outreach
  if (!DRY_RUN) {
    console.log('\nSTEP 5: Adding to Smartlead...');
    await addBatchToSmartlead(scoredLeads, MIN_OUTREACH_SCORE);
  } else {
    console.log('\nSTEP 5: [DRY RUN] Skipping Smartlead');
  }

  // STEP 6: Update Zoho CRM (HOT leads only)
  if (!DRY_RUN) {
    console.log('\nSTEP 6: Logging HOT leads to Zoho CRM...');
    const hotLeads = scoredLeads.filter(l => l.leadScore >= 60);
    for (const lead of hotLeads) {
      const res = await updateZohoCRM(lead);
      console.log(`  Zoho: ${lead.company} → ${res?.status || 'error'}`);
    }
  }

  // STEP 7: Save state
  const newKeys = scoredLeads.map(getLeadKey);
  saveProcessed(processed, newKeys);
  saveResults(previousResults, scoredLeads);

  console.log('\n═══════════════════════════════════════════');
  console.log(`✅ Pipeline complete`);
  console.log(`   Processed: ${scoredLeads.length} new companies`);
  console.log(`   HOT: ${hot} | WARM: ${warm} | COLD: ${cold}`);
  console.log(`   Total ever processed: ${[...processed].length + newKeys.length}`);
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

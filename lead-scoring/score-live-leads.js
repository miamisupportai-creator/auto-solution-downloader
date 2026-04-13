#!/usr/bin/env node
/**
 * score-live-leads.js
 * Fetches all leads from Zoho CRM, scores them, writes scores back.
 * Usage: node --env-file=.env lead-scoring/score-live-leads.js [--dry-run]
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ZohoCRMClient } from "./zoho-client.js";
import { mapZohoToLeadData } from "./zoho-mapper.js";
import { scoreLead } from "./lead-scoring-engine.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "../.env"), override: true });

const DRY_RUN   = process.argv.includes("--dry-run");
const PAGE_SIZE = 50;

async function processPage(client, page) {
  const res     = await client.getRecords(PAGE_SIZE, page);
  const records = res.data || [];
  let scored = 0, written = 0, errors = 0;

  for (const raw of records) {
    try {
      const lead   = mapZohoToLeadData(raw);
      const result = scoreLead(lead);
      scored++;

      if (!DRY_RUN) {
        await client.writeScore(raw.id, result);
        written++;
      }

      const icon = result.tier === "HOT" ? "🔥" : result.tier === "WARM" ? "🟡" : "🔵";
      console.log(`  ${icon} [${result.total.toString().padStart(3)}] ${lead.name || raw.id} — ${result.tier}`);
    } catch (err) {
      errors++;
      console.error(`  ERR ${raw.id}: ${err.message}`);
    }
  }

  return { count: records.length, scored, written, errors };
}

async function run() {
  console.log(`\n=== score-live-leads ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const client = new ZohoCRMClient();
  await client.refreshAccessToken();

  let page = 1, total = 0, totalScored = 0, totalWritten = 0;

  while (true) {
    console.log(`Page ${page}...`);
    const { count, scored, written, errors } = await processPage(client, page);
    total        += count;
    totalScored  += scored;
    totalWritten += written;
    if (count < PAGE_SIZE) break;
    page++;
  }

  console.log(`\n  Total records : ${total}`);
  console.log(`  Scored        : ${totalScored}`);
  console.log(DRY_RUN ? "  Written       : (dry run)" : `  Written       : ${totalWritten}`);
  console.log("=== done ===\n");
}

run().catch(err => { console.error(err); process.exit(1); });

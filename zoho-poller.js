#!/usr/bin/env node
/**
 * zoho-poller.js
 * Polls Zoho CRM every run for newly-qualified leads.
 * Runs via GitHub Actions cron. Triggers auto-solution-downloader for each new lead.
 * State stored in logs/zoho-processed.json to avoid re-processing.
 */

import { ZohoCRMClient } from "./lead-scoring/zoho-client.js";
import { mapZohoToLeadData } from "./lead-scoring/zoho-mapper.js";
import { scoreLead } from "./lead-scoring/lead-scoring-engine.js";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config({ override: true });

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "logs", "zoho-processed.json");
const QUALIFIED_STATUSES = new Set(["Qualified", "Pre-Qualified", "Hot"]);
const MIN_SCORE = 40; // minimum score to trigger solution download

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); }
  catch (_) { return {}; }
}

function saveState(state) {
  fs.mkdirSync(path.join(__dirname, "logs"), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function buildClientData(lead, scoreResult) {
  const needs = ["lead-qualification"];
  if (scoreResult.total >= 60) needs.push("email-automation");
  if (lead.company?.annualRevenue >= 10000) needs.push("crm-sync");
  if (scoreResult.total >= 80) needs.push("reporting");

  return {
    id:     lead.id,
    name:   lead.name  || "Unknown",
    email:  lead.email || "",
    phone:  lead.contact?.phone || "",
    needs,
    budget: lead.company?.annualRevenue || 0,
    score:  scoreResult.total,
    tier:   scoreResult.tier,
    source: "zoho_crm"
  };
}

function deployForLead(clientData) {
  console.log(`  deploying solutions for: ${clientData.name} [${clientData.tier} ${clientData.score}]`);
  const result = spawnSync("node", [
    path.join(__dirname, "auto-solution-downloader.js")
  ], {
    stdio: "inherit",
    timeout: 60_000,
    env: { ...process.env, CLIENT_DATA: JSON.stringify(clientData) }
  });
  if (result.status !== 0) {
    console.error(`  ERROR deploying for ${clientData.id}`);
    return false;
  }
  return true;
}

async function run() {
  console.log(`\n=== zoho-poller ${new Date().toISOString()} ===\n`);

  const client = new ZohoCRMClient();
  await client.refreshAccessToken();

  const state = loadState();
  let page = 1, processed = 0, deployed = 0;

  while (true) {
    const res     = await client.getRecords(50, page);
    const records = res.data || [];
    if (!records.length) break;

    for (const raw of records) {
      const status = raw.Lead_Status || "";

      // Skip if already processed and status hasn't changed
      const prev = state[raw.id];
      if (prev && prev.status === status) continue;

      // Only act on qualified leads
      if (!QUALIFIED_STATUSES.has(status)) {
        state[raw.id] = { status, skipped: true, ts: new Date().toISOString() };
        continue;
      }

      const lead        = mapZohoToLeadData(raw);
      const scoreResult = scoreLead(lead);
      processed++;

      console.log(`  ${scoreResult.tier === "HOT" ? "🔥" : scoreResult.tier === "WARM" ? "🟡" : "🔵"} ${lead.name} — score=${scoreResult.total} status=${status}`);

      if (scoreResult.total >= MIN_SCORE) {
        const clientData = buildClientData(lead, scoreResult);
        const ok = deployForLead(clientData);
        if (ok) deployed++;
        state[raw.id] = { status, score: scoreResult.total, tier: scoreResult.tier, deployedAt: new Date().toISOString() };
      } else {
        console.log(`    score ${scoreResult.total} < ${MIN_SCORE} — skip deploy`);
        state[raw.id] = { status, score: scoreResult.total, tier: scoreResult.tier, skipped: true };
      }

      saveState(state);
    }

    if (records.length < 50) break;
    page++;
  }

  console.log(`\n  processed: ${processed}  deployed: ${deployed}`);
  console.log("=== done ===\n");
}

run().catch(err => { console.error(err); process.exit(1); });

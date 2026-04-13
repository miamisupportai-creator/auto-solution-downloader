#!/usr/bin/env node
/**
 * test-zoho-connection.js
 * Quick sanity check: token → fields → first record → mapped lead.
 * Usage: node --env-file=.env test-zoho-connection.js
 */

import dotenv from "dotenv";
import { ZohoCRMClient } from "./lead-scoring/zoho-client.js";
import { mapZohoToLeadData } from "./lead-scoring/zoho-mapper.js";

dotenv.config({ override: true });

const PLACEHOLDER = "your_zoho_access_token";

function checkEnv() {
  const required = ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN"];
  const missing  = required.filter(k => !process.env[k] || process.env[k].startsWith("your_"));
  if (missing.length) {
    console.error("\n  Missing Zoho env vars:", missing.join(", "));
    console.error("  → Set them in .env and re-run.\n");
    process.exit(1);
  }
  if (!process.env.ZOHO_ACCESS_TOKEN || process.env.ZOHO_ACCESS_TOKEN === PLACEHOLDER) {
    console.log("\n  ZOHO_ACCESS_TOKEN is placeholder — will auto-refresh via refresh token.\n");
  }
}

async function run() {
  checkEnv();
  const client = new ZohoCRMClient();

  // 1. Refresh token
  console.log("1. Refreshing access token...");
  await client.refreshAccessToken();
  console.log("   token:", client.token.slice(0, 20) + "...");

  // 2. Get field metadata
  console.log("\n2. Fetching field metadata...");
  const fields = await client.getFields();
  const names  = (fields.fields || []).map(f => f.api_name).slice(0, 10);
  console.log("   first 10 fields:", names.join(", "));

  // 3. Get first record
  console.log("\n3. Fetching first lead record...");
  const records = await client.getRecords(1, 1);
  const first   = (records.data || [])[0];
  if (!first) {
    console.log("   No records found in module.");
    return;
  }
  console.log("   Record ID:", first.id);
  console.log("   Name:     ", [first.First_Name, first.Last_Name].filter(Boolean).join(" ") || "(none)");
  console.log("   Email:    ", first.Email || "(none)");

  // 4. Map to LeadData schema
  console.log("\n4. Mapping to LeadData...");
  const lead = mapZohoToLeadData(first);
  console.log("   company:", JSON.stringify(lead.company, null, 2));
  console.log("   contact:", JSON.stringify(lead.contact, null, 2));
  console.log("   signals:", JSON.stringify(lead.signals, null, 2));

  console.log("\n  Zoho connection: OK\n");
}

run().catch(err => { console.error("\n  FAIL:", err.message); process.exit(1); });

import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS    = path.join(__dirname, "outputs");
const LOGS       = path.join(__dirname, "logs");
const RECORD     = path.join(LOGS, "imported.json");

// ─── record helpers ──────────────────────────────────────────────────────────

function loadRecord() {
  try { return JSON.parse(fs.readFileSync(RECORD, "utf-8")); }
  catch (_) { return {}; }
}

function saveRecord(data) {
  fs.mkdirSync(LOGS, { recursive: true });
  fs.writeFileSync(RECORD, JSON.stringify(data, null, 2));
}

// ─── import one workflow ─────────────────────────────────────────────────────

async function importWorkflow(filePath) {
  let workflow;

  try {
    workflow = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`  SKIP (invalid JSON): ${path.basename(filePath)}`);
    return null;
  }

  // n8n requires a name field
  if (!workflow.name) {
    workflow.name = `ai-system — ${path.basename(filePath, ".json")}`;
  }

  // n8n API rejects read-only fields on create
  const { active, id, createdAt, updatedAt, versionId, ...payload } = workflow;

  const res = await fetch(process.env.N8N_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": process.env.N8N_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`  ERROR n8n ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  console.log(`  imported: id=${data.id}  name="${data.name}"`);
  return data.id;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const record = loadRecord();

  // If a specific file is passed as CLI arg, import only that
  const target = process.argv[2];

  const files = target
    ? [target]
    : fs.readdirSync(OUTPUTS)
        .filter(f => f.endsWith(".json"))
        .map(f => path.join(OUTPUTS, f));

  if (files.length === 0) {
    console.log("No workflow files found.");
    return;
  }

  for (const file of files) {
    const key = path.basename(file);

    if (record[key]) {
      console.log(`  already imported: ${key} (id=${record[key].id})`);
      continue;
    }

    console.log(`Importing: ${key}`);
    const id = await importWorkflow(file);

    if (id) {
      record[key] = { id, importedAt: new Date().toISOString() };
      saveRecord(record);
    }
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

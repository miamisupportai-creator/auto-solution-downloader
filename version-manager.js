/**
 * version-manager.js
 *
 * Tracks workflow versions per repo.
 * When a new workflow is generated:
 *   - scores it against the previous version
 *   - if better → archives old, promotes new
 *   - if worse  → discards new, keeps old
 *
 * Score = weighted sum of: node count, connection count,
 *         unique node types, has trigger, has error handler.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const OUTPUTS    = path.join(__dirname, "outputs");
const VERSIONS   = path.join(__dirname, "outputs", "versions");
const VERSION_DB = path.join(__dirname, "logs", "versions.json");

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadDB() {
  try { return JSON.parse(fs.readFileSync(VERSION_DB, "utf-8")); }
  catch (_) { return {}; }
}

function saveDB(db) {
  fs.mkdirSync(path.dirname(VERSION_DB), { recursive: true });
  fs.writeFileSync(VERSION_DB, JSON.stringify(db, null, 2));
}

function versionDir(repoName) {
  const d = path.join(VERSIONS, repoName);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ─── scoring ─────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = new Set([
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.cron",
  "n8n-nodes-base.manualTrigger",
]);

const ERROR_TYPES = new Set([
  "n8n-nodes-base.errorTrigger",
  "n8n-nodes-base.stopAndError",
]);

function score(workflow) {
  const nodes = workflow.nodes ?? [];
  const conns = workflow.connections ?? {};

  const nodeCount  = nodes.length;
  const connCount  = Object.values(conns).reduce((acc, targets) =>
    acc + Object.values(targets).reduce((a, arr) => a + arr.flat().length, 0), 0);
  const typeCount  = new Set(nodes.map(n => n.type)).size;
  const hasTrigger = nodes.some(n => TRIGGER_TYPES.has(n.type)) ? 1 : 0;
  const hasError   = nodes.some(n => ERROR_TYPES.has(n.type))   ? 1 : 0;
  const hasName    = workflow.name && workflow.name.trim() ? 1 : 0;

  return (
    nodeCount  * 3 +
    connCount  * 2 +
    typeCount  * 2 +
    hasTrigger * 10 +
    hasError   * 5  +
    hasName    * 2
  );
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * evaluate(repoName, newWorkflowPath)
 *
 * Returns: "promoted" | "discarded" | "first"
 */
export function evaluate(repoName, newWorkflowPath) {
  fs.mkdirSync(VERSIONS, { recursive: true });

  let newWorkflow;
  try {
    newWorkflow = JSON.parse(fs.readFileSync(newWorkflowPath, "utf-8"));
  } catch {
    console.error(`  version-manager: invalid JSON at ${newWorkflowPath}`);
    return "invalid";
  }

  const db          = loadDB();
  const record      = db[repoName];
  const newScore    = score(newWorkflow);
  const vDir        = versionDir(repoName);

  // First time — just archive and register
  if (!record) {
    const v1Path = path.join(vDir, "v1.json");
    fs.copyFileSync(newWorkflowPath, v1Path);

    db[repoName] = {
      current: 1,
      score: newScore,
      history: [{ version: 1, score: newScore, date: new Date().toISOString() }],
    };
    saveDB(db);

    console.log(`  version-manager: first version saved (score=${newScore})`);
    return "first";
  }

  // Compare against current best
  const prevScore   = record.score;
  const nextVersion = record.current + 1;

  if (newScore <= prevScore) {
    console.log(`  version-manager: new score ${newScore} ≤ prev ${prevScore} — discarded`);
    fs.unlinkSync(newWorkflowPath);
    return "discarded";
  }

  // Archive previous best
  const prevPath = path.join(vDir, `v${record.current}.json`);
  const currPath = path.join(OUTPUTS, `${repoName}.json`);
  if (fs.existsSync(currPath) && !fs.existsSync(prevPath)) {
    fs.copyFileSync(currPath, prevPath);
  }

  // Promote new version
  const newVersionPath = path.join(vDir, `v${nextVersion}.json`);
  fs.copyFileSync(newWorkflowPath, newVersionPath);

  record.current = nextVersion;
  record.score   = newScore;
  record.history.push({ version: nextVersion, score: newScore, date: new Date().toISOString() });
  db[repoName] = record;
  saveDB(db);

  console.log(`  version-manager: promoted v${nextVersion} (score ${prevScore} → ${newScore})`);
  return "promoted";
}

/**
 * rollback(repoName)
 *
 * Restores the previous version to outputs/.
 * Returns true on success.
 */
export function rollback(repoName) {
  const db     = loadDB();
  const record = db[repoName];

  if (!record || record.current < 2) {
    console.error(`  version-manager: no previous version for ${repoName}`);
    return false;
  }

  const prev      = record.current - 1;
  const prevPath  = path.join(versionDir(repoName), `v${prev}.json`);
  const currPath  = path.join(OUTPUTS, `${repoName}.json`);

  if (!fs.existsSync(prevPath)) {
    console.error(`  version-manager: archived file missing: ${prevPath}`);
    return false;
  }

  fs.copyFileSync(prevPath, currPath);
  record.current = prev;
  record.score   = record.history.find(h => h.version === prev)?.score ?? 0;
  db[repoName]   = record;
  saveDB(db);

  console.log(`  version-manager: rolled back ${repoName} to v${prev}`);
  return true;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, cmd, arg] = process.argv;

  if (cmd === "rollback" && arg) {
    rollback(arg);
  } else if (cmd === "status") {
    const db = loadDB();
    if (Object.keys(db).length === 0) {
      console.log("No versions tracked yet.");
    } else {
      for (const [repo, rec] of Object.entries(db)) {
        console.log(`${repo}  current=v${rec.current}  score=${rec.score}  versions=${rec.history.length}`);
      }
    }
  } else {
    console.log("Usage:");
    console.log("  node version-manager.js status");
    console.log("  node version-manager.js rollback <repo-name>");
  }
}

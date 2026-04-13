/**
 * status.js — pipeline health at a glance
 *
 * Usage: node status.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIRS = {
  repos:    path.join(__dirname, "repos"),
  filtered: path.join(__dirname, "filtered"),
  outputs:  path.join(__dirname, "outputs"),
  versions: path.join(__dirname, "outputs", "versions"),
  logs:     path.join(__dirname, "logs"),
};

const IMPORTED_LOG = path.join(DIRS.logs, "imported.json");
const VERSION_DB   = path.join(DIRS.logs, "versions.json");
const RUN_LOG      = path.join(DIRS.logs, "run.log");

function ls(dir, ext) {
  try {
    return fs.readdirSync(dir).filter(f => !ext || f.endsWith(ext));
  } catch (_) { return []; }
}

function lastLines(file, n = 5) {
  try {
    const lines = fs.readFileSync(file, "utf-8").trim().split("\n");
    return lines.slice(-n);
  } catch (_) { return []; }
}

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); }
  catch (_) { return null; }
}

// ─── collect data ─────────────────────────────────────────────────────────────

const repos    = ls(DIRS.repos);
const filtered = ls(DIRS.filtered, ".txt");
const outputs  = ls(DIRS.outputs, ".json");
const imported = loadJSON(IMPORTED_LOG) ?? {};
const versions = loadJSON(VERSION_DB)   ?? {};

// ─── print ────────────────────────────────────────────────────────────────────

console.log("\n=== ai-system status ===\n");

console.log(`repos cloned   : ${repos.length}`);
console.log(`filtered       : ${filtered.length}`);
console.log(`outputs        : ${outputs.length}`);
console.log(`imported n8n   : ${Object.keys(imported).length}`);
console.log(`versions tracked: ${Object.keys(versions).length}`);

if (Object.keys(versions).length > 0) {
  console.log("\n─── versions ───────────────────────────────");
  for (const [repo, rec] of Object.entries(versions)) {
    const hist = rec.history.map(h => `v${h.version}(${h.score})`).join(" → ");
    console.log(`  ${repo.padEnd(30)} current=v${rec.current}  ${hist}`);
  }
}

if (Object.keys(imported).length > 0) {
  console.log("\n─── imported workflows ──────────────────────");
  for (const [file, info] of Object.entries(imported)) {
    console.log(`  ${file.padEnd(35)} id=${info.id}  ${info.importedAt.slice(0,10)}`);
  }
}

console.log("\n─── last log lines ──────────────────────────");
for (const line of lastLines(RUN_LOG, 8)) {
  console.log(" ", line);
}

console.log();

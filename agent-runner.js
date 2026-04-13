import fetch from "node-fetch";
import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { evaluate } from "./version-manager.js";
import { analyze } from "./analyzer.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), ".env"), override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  query: "ai agent automation",
  maxRepos: 3,
  minStars: 500,
  maxMonthsOld: 6,
  maxFilesPerRepo: 20,
  maxFileSizeBytes: 50 * 1024, // 50KB
  dirs: {
    repos:    path.join(__dirname, "repos"),
    filtered: path.join(__dirname, "filtered"),
    outputs:  path.join(__dirname, "outputs"),
    logs:     path.join(__dirname, "logs"),
  },
};

const ALLOWED_EXT  = new Set([".md", ".js", ".ts", ".py", ".json", ".yaml", ".yml"]);
const SKIP_DIRS    = new Set(["node_modules", "dist", "build", ".git", "assets",
                               "public", "static", "test", "tests", "__tests__",
                               "coverage", "vendor", ".next", ".nuxt"]);
const SKIP_FILES   = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml",
                               ".eslintrc.json", "tsconfig.json"]);

// ─── logging ────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(CONFIG.dirs.logs, "run.log"), line + "\n");
}

function ensureDirs() {
  for (const dir of Object.values(CONFIG.dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── github search ──────────────────────────────────────────────────────────

async function searchRepos() {
  const since = new Date();
  since.setMonth(since.getMonth() - CONFIG.maxMonthsOld);
  const sinceStr = since.toISOString().split("T")[0];

  // Build query with + as literal separator (GitHub Search API format)
  const terms = CONFIG.query.trim().split(/\s+/).join("+");
  const q = `${terms}+stars:>${CONFIG.minStars}+pushed:>${sinceStr}`;
  const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=10`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);

  const { items } = await res.json();

  // Extra quality filter
  return items
    .filter(r => !r.fork && r.size > 50)
    .slice(0, CONFIG.maxRepos);
}

// ─── clone ──────────────────────────────────────────────────────────────────

function cloneRepo(repo) {
  const dest = path.join(CONFIG.dirs.repos, repo.name);
  if (fs.existsSync(dest)) {
    log(`  skip clone (exists): ${repo.full_name}`);
    return dest;
  }
  log(`  cloning: ${repo.full_name}`);
  execSync(`git clone --depth=1 --quiet "${repo.clone_url}" "${dest}"`);
  return dest;
}

// ─── file filter ─────────────────────────────────────────────────────────────

function collectFiles(dir, depth = 0) {
  const files = [];
  if (depth > 4) return files;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
        files.push(...collectFiles(path.join(dir, entry.name), depth + 1));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXT.has(ext) && !SKIP_FILES.has(entry.name)) {
          files.push(path.join(dir, entry.name));
        }
      }
    }
  } catch (_) {}
  return files;
}

function prioritize(files, repoRoot) {
  const score = (f) => {
    const base = path.basename(f).toLowerCase();
    const rel  = path.relative(repoRoot, f);
    if (base === "readme.md") return 0;
    if (base.match(/^(main|index|app|server|agent)\.(js|ts|py)$/)) return 1;
    if (rel.split(path.sep).length === 2) return 2; // shallow
    return 3;
  };
  return [...files].sort((a, b) => score(a) - score(b));
}

function buildFilteredText(repoPath, repoName) {
  const outPath = path.join(CONFIG.dirs.filtered, `${repoName}.txt`);

  const all      = collectFiles(repoPath);
  const sorted   = prioritize(all, repoPath);
  const selected = sorted.slice(0, CONFIG.maxFilesPerRepo);

  let text = `# Repository: ${repoName}\n`;

  for (const f of selected) {
    try {
      const stat = fs.statSync(f);
      if (stat.size > CONFIG.maxFileSizeBytes) continue;
      const rel     = path.relative(repoPath, f);
      const content = fs.readFileSync(f, "utf-8");
      text += `\n\n## ${rel}\n\`\`\`\n${content}\n\`\`\``;
    } catch (_) {}
  }

  fs.writeFileSync(outPath, text);
  log(`  filtered ${selected.length} files → ${outPath}`);
  return outPath;
}

// ─── analyze ─────────────────────────────────────────────────────────────────

async function analyzeWithClaude(filteredPath, repoName) {
  // Use a temp path so version-manager can compare before overwriting
  const finalPath = path.join(CONFIG.dirs.outputs, `${repoName}.json`);
  const tempPath  = path.join(CONFIG.dirs.outputs, `${repoName}.tmp.json`);

  log(`  analyzing with Claude: ${repoName}`);

  try {
    await analyze(filteredPath, tempPath, path.join(__dirname, "claude-task.txt"));
  } catch (err) {
    log(`  ERROR claude: ${err.message}`);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    return null;
  }

  // Version evaluation — promotes if better, discards if not
  const verdict = evaluate(repoName, tempPath);

  if (verdict === "discarded") {
    log(`  version not promoted: ${repoName} (score did not improve)`);
    return fs.existsSync(finalPath) ? finalPath : null;
  }

  // Move temp → final
  if (fs.existsSync(tempPath)) fs.renameSync(tempPath, finalPath);

  log(`  output → ${finalPath} [${verdict}]`);
  return finalPath;
}

// ─── import ──────────────────────────────────────────────────────────────────

function importToN8n(outputPath) {
  const result = spawnSync(
    "node",
    [path.join(__dirname, "n8n-import.js"), outputPath],
    { stdio: "inherit", timeout: 30_000 }
  );
  if (result.status !== 0) {
    log(`  ERROR n8n import: ${outputPath}`);
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  ensureDirs();
  log("=== pipeline start ===");

  const repos = await searchRepos();
  log(`found ${repos.length} repos`);

  for (const repo of repos) {
    log(`--- ${repo.full_name} (${repo.stargazers_count}★)`);

    const repoPath     = cloneRepo(repo);
    const filteredPath = buildFilteredText(repoPath, repo.name);
    const outputPath   = await analyzeWithClaude(filteredPath, repo.name);

    if (outputPath) importToN8n(outputPath);
  }

  log("=== pipeline complete ===");
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

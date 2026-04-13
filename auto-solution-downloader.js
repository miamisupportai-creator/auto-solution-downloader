import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

// ─── Config ───────────────────────────────────────────────────────────────────

const SOLUTIONS_MAP = {
  'lead-qualification':  'miamisupportai-creator/n8n-lead-qualification',
  'email-automation':    'miamisupportai-creator/n8n-email-automation',
  'crm-sync':            'miamisupportai-creator/n8n-crm-sync',
  'order-processing':    'miamisupportai-creator/n8n-order-processing',
  'customer-support':    'miamisupportai-creator/n8n-customer-support',
  'reporting':           'miamisupportai-creator/n8n-reporting',
};

// ─── Env validation ───────────────────────────────────────────────────────────

function validateEnv() {
  const missing = [];
  if (!process.env.GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!process.env.CLIENT_DATA)  missing.push('CLIENT_DATA');
  if (missing.length) {
    console.error(`❌  Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'auto-solution-downloader/1.0',
        ...headers,
      },
    };
    https.get(url, opts, (res) => {
      // Follow redirects (GitHub raw CDN redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function httpsRequest(method, url, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyBuf = body ? Buffer.from(JSON.stringify(body)) : null;
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'User-Agent': 'auto-solution-downloader/1.0',
        'Content-Type': 'application/json',
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

// ─── Fetch workflow from GitHub ───────────────────────────────────────────────

async function fetchWorkflow(repo, token) {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/main/workflow.json`;
  console.log(`📥  Fetching workflow from ${rawUrl}`);
  const res = await httpsGet(rawUrl, { Authorization: `Bearer ${token}` });
  if (res.status !== 200) {
    throw new Error(`Failed to fetch ${rawUrl} — HTTP ${res.status}`);
  }
  return res.body;
}

// ─── Template substitution ────────────────────────────────────────────────────

function substituteVars(content, client) {
  return content
    .replace(/\$\{CLIENT_ID\}/g,    client.id)
    .replace(/\$\{CLIENT_NAME\}/g,  client.name)
    .replace(/\$\{CLIENT_EMAIL\}/g, client.email)
    .replace(/\$\{CLIENT_PHONE\}/g, client.phone)
    .replace(/\$\{BUDGET\}/g,       String(client.budget));
}

// ─── Save files ───────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveWorkflow(clientId, solution, content) {
  const dir = path.join('clients', clientId, solution);
  ensureDir(dir);
  const filePath = path.join(dir, 'workflow.json');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅  Saved ${filePath}`);
  return filePath;
}

function saveDeploymentSummary(clientId, solution, client) {
  const dir = path.join('clients', clientId, solution);
  ensureDir(dir);
  const repo = SOLUTIONS_MAP[solution] || 'unknown';
  const now = new Date().toISOString();
  const content = [
    `# Deployment Summary`,
    ``,
    `## Client Info`,
    `| Field   | Value              |`,
    `|---------|-------------------|`,
    `| ID      | ${client.id}       |`,
    `| Name    | ${client.name}     |`,
    `| Email   | ${client.email}    |`,
    `| Phone   | ${client.phone}    |`,
    `| Budget  | $${client.budget}  |`,
    ``,
    `## Solution`,
    `| Field        | Value                          |`,
    `|--------------|-------------------------------|`,
    `| Solution     | ${solution}                    |`,
    `| Source Repo  | ${repo}                        |`,
    `| Generated At | ${now}                         |`,
    ``,
    `## Deployment Steps`,
    ``,
    `1. **Review** the \`workflow.json\` file in this directory.`,
    `2. **Import** into n8n: Settings → Import Workflow → Upload file.`,
    `3. **Configure credentials** for all nodes that require them.`,
    `4. **Activate** the workflow from the n8n dashboard.`,
    `5. **Test** with a sample payload before going live.`,
    `6. **Notify client** at ${client.email} that their automation is ready.`,
    ``,
    `## Notes`,
    ``,
    `- All \`\${CLIENT_*}\` placeholders have been replaced with client data.`,
    `- Keep this directory in the \`clients/\` folder (it is git-tracked).`,
    `- Do NOT commit sensitive credentials to this repository.`,
  ].join('\n');

  const filePath = path.join(dir, 'DEPLOYMENT_SUMMARY.md');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`📋  Saved ${filePath}`);
}

// ─── Import to n8n ────────────────────────────────────────────────────────────

async function importToN8n(workflowJson, solution) {
  const apiUrl  = process.env.N8N_API_URL;
  const apiKey  = process.env.N8N_API_KEY;
  if (!apiUrl || !apiKey) {
    console.log(`⚙️   N8N_API_URL / N8N_API_KEY not set — skipping n8n import for ${solution}`);
    return;
  }

  try {
    const wf = JSON.parse(workflowJson);
    // Strip read-only fields
    const READ_ONLY = ['active', 'id', 'createdAt', 'updatedAt', 'versionId'];
    READ_ONLY.forEach((k) => delete wf[k]);

    const res = await httpsRequest(
      'POST',
      apiUrl,
      { 'X-N8N-API-KEY': apiKey },
      wf,
    );

    if (res.status === 200 || res.status === 201) {
      const created = JSON.parse(res.body);
      console.log(`🤖  Imported to n8n — workflow id: ${created.id || 'unknown'} (${solution})`);
    } else {
      console.error(`❌  n8n import failed for ${solution}: HTTP ${res.status} — ${res.body}`);
    }
  } catch (err) {
    console.error(`❌  n8n import error for ${solution}: ${err.message}`);
  }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────

function gitPush(clientId, needs) {
  try {
    execSync('git config user.email "auto-solution-downloader@ai50m.com"', { stdio: 'inherit' });
    execSync('git config user.name "Auto Solution Downloader"', { stdio: 'inherit' });
    execSync('git add clients/', { stdio: 'inherit' });
    const message = `client ${clientId}: ${needs.join(', ')}`;
    execSync(`git commit -m "${message}" --allow-empty`, { stdio: 'inherit' });
    execSync('git push', { stdio: 'inherit' });
    console.log(`✅  Git push complete for client ${clientId}`);
  } catch (err) {
    console.error(`❌  Git push failed: ${err.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  validateEnv();

  let client;
  try {
    client = JSON.parse(process.env.CLIENT_DATA);
  } catch (err) {
    console.error(`❌  Invalid CLIENT_DATA JSON: ${err.message}`);
    process.exit(1);
  }

  const required = ['id', 'name', 'email', 'phone', 'needs', 'budget'];
  const missingFields = required.filter((k) => client[k] === undefined || client[k] === null);
  if (missingFields.length) {
    console.error(`❌  CLIENT_DATA missing fields: ${missingFields.join(', ')}`);
    process.exit(1);
  }

  if (!Array.isArray(client.needs) || client.needs.length === 0) {
    console.error('❌  client.needs must be a non-empty array');
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  const errors = [];

  console.log(`\n🤖  Processing client: ${client.name} (${client.id})`);
  console.log(`📋  Needs: ${client.needs.join(', ')}\n`);

  for (const need of client.needs) {
    const repo = SOLUTIONS_MAP[need];
    if (!repo) {
      console.warn(`⚠️   Unknown solution "${need}" — skipping`);
      continue;
    }

    try {
      console.log(`\n⚙️   Processing solution: ${need}`);

      // 1. Fetch workflow
      const rawContent = await fetchWorkflow(repo, token);

      // 2. Substitute client vars
      const finalContent = substituteVars(rawContent, client);

      // 3. Save workflow.json
      saveWorkflow(client.id, need, finalContent);

      // 4. Save DEPLOYMENT_SUMMARY.md
      saveDeploymentSummary(client.id, need, client);

      // 5. Optionally import to n8n
      await importToN8n(finalContent, need);

    } catch (err) {
      console.error(`❌  Failed to process "${need}": ${err.message}`);
      errors.push({ need, error: err.message });
    }
  }

  // 6. Git push
  gitPush(client.id, client.needs);

  // 7. Summary
  console.log('\n─────────────────────────────────────');
  console.log('📋  FINAL SUMMARY');
  console.log('─────────────────────────────────────');
  const successful = client.needs.filter((n) => !errors.find((e) => e.need === n));
  console.log(`✅  Successful: ${successful.join(', ') || 'none'}`);
  if (errors.length) {
    console.log(`❌  Failed:     ${errors.map((e) => `${e.need} (${e.error})`).join('; ')}`);
  }
  console.log('─────────────────────────────────────\n');

  if (errors.length === client.needs.length) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌  Unhandled error: ${err.message}`);
  process.exit(1);
});

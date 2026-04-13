import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Validation ───────────────────────────────────────────────────────────────

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN is required');
  process.exit(1);
}

let clientDataRaw = process.env.CLIENT_DATA;
if (!clientDataRaw) {
  console.warn('⚙️  CLIENT_DATA not set — using test payload');
  clientDataRaw = JSON.stringify({
    id: 'test_client_001',
    name: 'Test Client',
    email: 'test@example.com',
    phone: '+13055550000',
    needs: ['lead-qualification', 'crm-sync'],
    budget: 5000
  });
}

let client;
try {
  client = JSON.parse(clientDataRaw);
} catch (e) {
  console.error('❌ Failed to parse CLIENT_DATA:', e.message);
  process.exit(1);
}

// ─── Solutions Map ─────────────────────────────────────────────────────────────

const SOLUTIONS_MAP = {
  'lead-qualification': 'miamisupportai-creator/n8n-lead-qualification',
  'email-automation':   'miamisupportai-creator/n8n-email-automation',
  'crm-sync':           'miamisupportai-creator/n8n-crm-sync',
  'order-processing':   'miamisupportai-creator/n8n-order-processing',
  'customer-support':   'miamisupportai-creator/n8n-customer-support',
  'reporting':          'miamisupportai-creator/n8n-reporting',
};

// ─── Fallback Template ─────────────────────────────────────────────────────────

function getFallbackWorkflow(clientId, clientName, solutionName) {
  return {
    name: `${solutionName} — ${clientName}`,
    nodes: [
      {
        id: 'webhook-1',
        name: 'Webhook Trigger',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [200, 300],
        parameters: { path: `client-${clientId}`, httpMethod: 'POST' }
      },
      {
        id: 'code-1',
        name: 'Process Request',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [460, 300],
        parameters: {
          jsCode: `// Auto-generated for ${clientName}\nreturn [{json: {client_id: '${clientId}', processed: true, timestamp: new Date().toISOString()}}];`
        }
      },
      {
        id: 'respond-1',
        name: 'Respond',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [720, 300],
        parameters: { respondWith: 'json', responseBody: `={"success": true, "client": "${clientId}"}` }
      }
    ],
    connections: {
      'Webhook Trigger': { main: [[{ node: 'Process Request', type: 'main', index: 0 }]] },
      'Process Request': { main: [[{ node: 'Respond', type: 'main', index: 0 }]] }
    },
    settings: { executionOrder: 'v1' }
  };
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function httpsGet(url, authToken) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'User-Agent': 'auto-solution-downloader/1.0'
      }
    };

    function doRequest(reqUrl) {
      https.get(reqUrl, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          doRequest(res.headers.location);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }).on('error', reject);
    }

    doRequest(url);
  });
}

function httpsPost(url, authToken, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'auto-solution-downloader/1.0'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ─── Variable Replacement ─────────────────────────────────────────────────────

function replaceVars(str, client) {
  return str
    .replace(/\$\{CLIENT_ID\}/g, client.id)
    .replace(/\$\{CLIENT_NAME\}/g, client.name)
    .replace(/\$\{CLIENT_EMAIL\}/g, client.email || '')
    .replace(/\$\{CLIENT_PHONE\}/g, client.phone || '')
    .replace(/\$\{BUDGET\}/g, String(client.budget || 0));
}

// ─── Deploy to n8n ────────────────────────────────────────────────────────────

async function deployToN8N(workflowObj, need) {
  const N8N_API_URL = process.env.N8N_API_URL;
  const N8N_API_KEY = process.env.N8N_API_KEY;

  if (!N8N_API_URL || !N8N_API_KEY) {
    console.log(`⚙️  N8N not configured — skipping deploy for ${need}`);
    return;
  }

  // Strip read-only fields
  const payload = { ...workflowObj };
  delete payload.active;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  delete payload.versionId;
  delete payload.tags;
  delete payload.shared;

  try {
    const result = await httpsPost(N8N_API_URL, N8N_API_KEY, payload);
    if (result.statusCode === 200 || result.statusCode === 201) {
      console.log(`✅ Deployed to n8n: ${need}`);
    } else {
      console.error(`❌ n8n deploy failed for ${need}: ${result.statusCode} ${result.body}`);
    }
  } catch (err) {
    console.error(`❌ n8n deploy error for ${need}: ${err.message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🤖 auto-solution-downloader starting`);
  console.log(`⚙️  Client: ${client.id} — ${client.name}`);
  console.log(`⚙️  Needs: ${client.needs.join(', ')}`);

  const errors = [];

  for (const need of client.needs) {
    console.log(`\n🤖 Processing solution: ${need} for client ${client.id}`);

    const repo = SOLUTIONS_MAP[need];
    if (!repo) {
      console.warn(`⚙️  No solution mapped for need: ${need} — skipping`);
      errors.push(`Unknown need: ${need}`);
      continue;
    }

    // ── 1. Fetch workflow.json ──────────────────────────────────────────────
    let workflowObj;
    const rawUrl = `https://raw.githubusercontent.com/${repo}/main/workflow.json`;
    console.log(`📥 Fetching: ${rawUrl}`);

    try {
      const result = await httpsGet(rawUrl, GITHUB_TOKEN);
      if (result.statusCode === 200) {
        workflowObj = JSON.parse(result.body);
        console.log(`✅ Fetched workflow from ${repo}`);
      } else {
        console.warn(`⚙️  Repo ${repo} returned ${result.statusCode} — using fallback template`);
        workflowObj = getFallbackWorkflow(client.id, client.name, need);
      }
    } catch (err) {
      console.warn(`⚙️  Failed to fetch ${repo}: ${err.message} — using fallback template`);
      workflowObj = getFallbackWorkflow(client.id, client.name, need);
    }

    // ── 2. Replace variables ────────────────────────────────────────────────
    let workflowStr = replaceVars(JSON.stringify(workflowObj, null, 2), client);
    workflowObj = JSON.parse(workflowStr);

    // ── 3. Create dir + save workflow ───────────────────────────────────────
    const dir = path.join(__dirname, 'clients', client.id, need);
    fs.mkdirSync(dir, { recursive: true });

    const workflowPath = path.join(dir, 'workflow.json');
    fs.writeFileSync(workflowPath, workflowStr, 'utf8');
    console.log(`📋 Saved: ${workflowPath}`);

    // ── 4. Generate DEPLOYMENT_SUMMARY.md ─────────────────────────────────
    const today = new Date().toISOString().split('T')[0];
    const summary = `# Deployment Summary

## Client Info
| Field   | Value              |
|---------|--------------------|
| ID      | ${client.id}       |
| Name    | ${client.name}     |
| Email   | ${client.email || 'N/A'} |
| Phone   | ${client.phone || 'N/A'} |
| Budget  | $${client.budget || 0} |

## Solution
| Field       | Value         |
|-------------|---------------|
| Name        | ${need}        |
| Repo        | ${repo}        |
| Date        | ${today}       |
| Status      | Ready to deploy |

## Steps to Activate
1. Import \`workflow.json\` into your n8n instance
2. Review all nodes and verify credentials
3. Activate the workflow from n8n dashboard
4. Test with a sample POST to the webhook endpoint
5. Monitor executions in n8n execution log

## Webhook URL (after activation)
\\`https://your-n8n-instance.app.n8n.cloud/webhook/client-${client.id}\`
`;

    const summaryPath = path.join(dir, 'DEPLOYMENT_SUMMARY.md');
    fs.writeFileSync(summaryPath, summary, 'utf8');
    console.log(`📋 Saved: ${summaryPath}`);

    // ── 5. Deploy to n8n if configured ─────────────────────────────────────
    await deployToN8N(workflowObj, need);
  }

  // ── Git commit & push ────────────────────────────────────────────────────
  try {
    execSync('git config user.email "bot@ai50m.com"', { stdio: 'inherit' });
    execSync('git config user.name "ai-system"', { stdio: 'inherit' });
    execSync('git add clients/', { stdio: 'inherit' });

    const commitMsg = `client ${client.id}: ${client.needs.join(', ')}`;
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

    // Use token in remote URL for auth
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const authedUrl = remoteUrl.replace('https://', `https://${GITHUB_TOKEN}@`);
    execSync(`git push ${authedUrl} HEAD`, { stdio: 'inherit' });

    console.log(`\n✅ Git pushed: ${commitMsg}`);
  } catch (err) {
    // Not a critical failure if nothing to commit
    if (err.message && err.message.includes('nothing to commit')) {
      console.log('⚙️  Nothing to commit — no new changes');
    } else {
      console.warn(`⚙️  Git push warning: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.warn(`\n⚙️  Completed with ${errors.length} warning(s):`);
    errors.forEach(e => console.warn(`  - ${e}`));
    process.exit(0);
  }

  console.log(`\n✅ auto-solution-downloader completed successfully`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});

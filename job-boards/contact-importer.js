/**
 * contact-importer.js
 * CLI tool + API client to import contacts and trigger full outreach sequence.
 * Usage: node contact-importer.js contacts.csv
 *        node contact-importer.js '{"name":"John","email":"j@co.com","phone":"786...","company":"Acme"}'
 *
 * Endpoints triggered:
 *   POST https://ai50m.app.n8n.cloud/webhook/import-contacts  → WhatsApp + Smartlead
 *   POST https://ai50m.app.n8n.cloud/webhook/generate-proposal → Proposal PDF
 */

import fs from 'fs';
import https from 'https';
import path from 'path';

const N8N_IMPORT_URL = 'https://ai50m.app.n8n.cloud/webhook/import-contacts';
const N8N_PROPOSAL_URL = 'https://ai50m.app.n8n.cloud/webhook/generate-proposal';

// ── HTTP helper ───────────────────────────────────────────────────────────────

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  }).filter(c => c.name || c.email || c.company);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function importContacts(input, { proposal = false, delay = 1500 } = {}) {
  let contacts = [];

  if (input.endsWith('.csv')) {
    const content = fs.readFileSync(input, 'utf-8');
    contacts = parseCSV(content);
  } else if (input.startsWith('[') || input.startsWith('{')) {
    const parsed = JSON.parse(input);
    contacts = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    throw new Error('Input must be a CSV file path or JSON string');
  }

  console.log(`\n🚀 AI50M Contact Importer`);
  console.log(`─────────────────────────`);
  console.log(`📋 Contacts: ${contacts.length}`);
  console.log(`💬 WhatsApp: enabled`);
  console.log(`📄 Proposals: ${proposal ? 'enabled' : 'disabled'}\n`);

  let success = 0, failed = 0;

  for (const contact of contacts) {
    try {
      // Trigger main import (WhatsApp + Smartlead)
      const result = await post(N8N_IMPORT_URL, contact);
      console.log(`✅ ${contact.name || contact.email} @ ${contact.company} → ${result.whatsappSent ? '📱 WhatsApp sent' : '📧 Email queued'}`);

      // Optionally trigger proposal generation
      if (proposal && (contact.phone || contact.email)) {
        await new Promise(r => setTimeout(r, 500));
        await post(N8N_PROPOSAL_URL, contact);
        console.log(`   📄 Proposal generated for ${contact.company}`);
      }

      success++;
    } catch (err) {
      console.error(`❌ ${contact.name || contact.email}: ${err.message}`);
      failed++;
    }

    if (contacts.indexOf(contact) < contacts.length - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  console.log(`\n─────────────────────────`);
  console.log(`✅ Success: ${success}/${contacts.length}`);
  if (failed) console.log(`❌ Failed:  ${failed}/${contacts.length}`);
  console.log(`\nDone. Check WhatsApp + Smartlead for results.`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (!args.length) {
  console.log(`
Usage:
  node contact-importer.js <file.csv>
  node contact-importer.js <file.csv> --proposal
  node contact-importer.js '{"name":"John","phone":"17861234567","company":"Acme"}'

CSV format: name,email,phone,company,website,industry
  `);
  process.exit(0);
}

const input = args[0];
const opts = { proposal: args.includes('--proposal') };

importContacts(input, opts).catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

/**
 * ai50m — WhatsApp Outreach via WasenderAPI
 * Sends personalized WhatsApp messages to HOT leads.
 * Logs all sends to logs/whatsapp-sent.json
 */

import https from 'https';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateWhatsAppMessage } from './routing-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../logs');
const WA_LOG_FILE = path.join(LOGS_DIR, 'whatsapp-sent.json');

const WASENDER_URL = 'https://www.wasenderapi.com/api/send-message';
const WASENDER_TOKEN = '972438be02d23af9024060ff42ff6158d7e343c9761798480f8efd7fd38135d2';

// ─── Core Send Function ───────────────────────────────────────────────────────

/**
 * Sends a WhatsApp message to a phone number via WasenderAPI.
 * @param {string} phoneNumber - Raw phone number (digits only, no +)
 * @param {string} message - Text to send
 * @param {string} [countryCode='1'] - Country code prefix (default US +1)
 * @returns {Promise<{success: boolean, jid: string, error?: string}>}
 */
export async function sendWhatsApp(phoneNumber, message, countryCode = '1') {
  const cleaned = phoneNumber.replace(/\D/g, '');

  // Build JID: countryCode + number (ensure no duplicate prefix)
  const normalizedNumber = cleaned.startsWith(countryCode)
    ? cleaned
    : `${countryCode}${cleaned}`;
  const jid = `${normalizedNumber}@s.whatsapp.net`;

  const payload = JSON.stringify({
    to: jid,
    message,
  });

  try {
    const result = await makeWasenderRequest(payload);
    return { success: true, jid, response: result };
  } catch (err) {
    return { success: false, jid, error: err.message };
  }
}

/**
 * Sends WhatsApp outreach to a HOT lead.
 * Extracts phone from lead.phone. Skips if no phone available.
 * @param {object} lead - Enriched lead object
 * @returns {Promise<{success: boolean, skipped?: boolean, reason?: string}>}
 */
export async function sendHotLeadOutreach(lead) {
  ensureLogsDir();

  // Resolve phone number
  const phone = resolvePhone(lead);
  if (!phone) {
    console.log(`  ⚠ Skipping WhatsApp for ${lead.company} — no phone number`);
    return { success: false, skipped: true, reason: 'no_phone', company: lead.company };
  }

  const message = generateWhatsAppMessage(lead);

  console.log(`  📱 WhatsApp → ${lead.company} (${phone})`);
  const result = await sendWhatsApp(phone, message);

  // Log the attempt regardless of outcome
  logWhatsAppSend({
    company: lead.company,
    contactName: lead.contactName || '',
    phone,
    jid: result.jid,
    message,
    success: result.success,
    error: result.error || null,
    tier: 'HOT',
    leadScore: lead.leadScore,
    sentAt: new Date().toISOString(),
  });

  if (result.success) {
    console.log(`  ✅ WhatsApp sent to ${lead.company}`);
  } else {
    console.warn(`  ❌ WhatsApp failed for ${lead.company}: ${result.error}`);
  }

  return result;
}

/**
 * Sends WhatsApp outreach to all HOT leads in a batch.
 * @param {object[]} leads - Array of HOT leads
 * @returns {Promise<{sent: number, failed: number, skipped: number}>}
 */
export async function sendBatchHotLeadOutreach(leads) {
  let sent = 0, failed = 0, skipped = 0;

  for (const lead of leads) {
    if ((lead.tier || '') !== 'HOT' && (lead.leadScore ?? 0) < 80) {
      skipped++;
      continue;
    }

    const result = await sendHotLeadOutreach(lead);

    if (result.skipped) skipped++;
    else if (result.success) sent++;
    else failed++;

    // Delay between sends to respect rate limits
    await new Promise(r => setTimeout(r, 1500));
  }

  return { sent, failed, skipped };
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function logWhatsAppSend(entry) {
  let logs = [];
  if (existsSync(WA_LOG_FILE)) {
    try {
      logs = JSON.parse(readFileSync(WA_LOG_FILE, 'utf-8'));
    } catch {
      logs = [];
    }
  }
  logs.push(entry);
  writeFileSync(WA_LOG_FILE, JSON.stringify(logs, null, 2));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function resolvePhone(lead) {
  if (lead.phone) {
    const cleaned = lead.phone.replace(/\D/g, '');
    return cleaned.length >= 7 ? cleaned : null;
  }

  // Try to extract from website domain (last resort — usually not available)
  // Return null — the caller should skip if no phone found
  return null;
}

function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function makeWasenderRequest(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(WASENDER_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WASENDER_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve({ raw: body });
          }
        } else {
          reject(new Error(`WasenderAPI ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

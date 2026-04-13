/**
 * ai50m — Pipeline Analytics
 * Reads log files, computes daily stats, and sends Slack report.
 */

import https from 'https';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../logs');

const LOG_FILES = {
  results: path.join(LOGS_DIR, 'job-boards-results.json'),
  outreach: path.join(LOGS_DIR, 'outreach-sent.json'),
  whatsapp: path.join(LOGS_DIR, 'whatsapp-sent.json'),
};

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Returns daily pipeline stats by reading the log files.
 * @returns {object} - Stats for today
 */
export function getDailyStats() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const results = loadJSON(LOG_FILES.results);
  const outreach = loadJSON(LOG_FILES.outreach);
  const whatsapp = loadJSON(LOG_FILES.whatsapp);

  // Filter to today's entries
  const todayResults = results.filter(r => (r.processedAt || r.enrichedAt || '').startsWith(today));
  const todayOutreach = outreach.filter(r => (r.sentAt || '').startsWith(today));
  const todayWhatsapp = whatsapp.filter(r => (r.sentAt || '').startsWith(today));

  const hot = todayResults.filter(r => r.tier === 'HOT' || (r.leadScore ?? 0) >= 80);
  const warm = todayResults.filter(r => r.tier === 'WARM' || ((r.leadScore ?? 0) >= 50 && (r.leadScore ?? 0) < 80));
  const cold = todayResults.filter(r => r.tier === 'COLD' || (r.leadScore ?? 0) < 50);

  const waSuccessful = todayWhatsapp.filter(r => r.success);
  const waFailed = todayWhatsapp.filter(r => !r.success && !r.skipped);

  // Conversion signals
  const hotWithPhone = hot.filter(r => r.phone);
  const hotContacted = waSuccessful.length;

  const stats = {
    date: today,
    totalLeads: todayResults.length,
    hot: hot.length,
    warm: warm.length,
    cold: cold.length,
    emailsSent: todayOutreach.length,
    whatsappSent: waSuccessful.length,
    whatsappFailed: waFailed.length,
    whatsappSkipped: todayWhatsapp.length - waSuccessful.length - waFailed.length,
    hotLeadsWithPhone: hotWithPhone.length,
    hotLeadsContacted: hotContacted,
    conversionRate: hot.length > 0
      ? `${Math.round((hotContacted / hot.length) * 100)}%`
      : '0%',
    topHotLeads: hot
      .sort((a, b) => (b.leadScore ?? 0) - (a.leadScore ?? 0))
      .slice(0, 3)
      .map(l => ({
        company: l.company,
        score: l.leadScore,
        jobTitle: l.jobTitle,
        pitchAngle: l.pitchAngle || '',
      })),
  };

  return stats;
}

// ─── Slack Report ─────────────────────────────────────────────────────────────

/**
 * Sends a formatted analytics report to Slack.
 * Requires SLACK_WEBHOOK_URL environment variable.
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendSlackReport() {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('  ℹ SLACK_WEBHOOK_URL not set — skipping Slack report');
    return { sent: false, reason: 'no_webhook' };
  }

  const stats = getDailyStats();
  const blocks = buildSlackBlocks(stats);

  try {
    await postToSlack(webhookUrl, { blocks });
    console.log('  ✅ Slack report sent');
    return { sent: true };
  } catch (err) {
    console.warn(`  ⚠ Slack report failed: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

// ─── Slack Block Builder ──────────────────────────────────────────────────────

function buildSlackBlocks(stats) {
  const tierBar = buildTierBar(stats.hot, stats.warm, stats.cold);

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🤖 ai50m Pipeline Report — ${stats.date}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Total Leads*\n${stats.totalLeads}` },
        { type: 'mrkdwn', text: `*Funnel*\n${tierBar}` },
        { type: 'mrkdwn', text: `*🔥 HOT*\n${stats.hot}` },
        { type: 'mrkdwn', text: `*🟡 WARM*\n${stats.warm}` },
        { type: 'mrkdwn', text: `*❄️ COLD*\n${stats.cold}` },
        { type: 'mrkdwn', text: `*📧 Emails Sent*\n${stats.emailsSent}` },
        { type: 'mrkdwn', text: `*📱 WhatsApp Sent*\n${stats.whatsappSent}` },
        { type: 'mrkdwn', text: `*📊 Contact Rate*\n${stats.conversionRate}` },
      ],
    },
    { type: 'divider' },
  ];

  if (stats.topHotLeads.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*🔥 Top HOT Leads Today*' },
    });

    for (const lead of stats.topHotLeads) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${lead.company}* — Score: ${lead.score}\n_${lead.jobTitle || 'Unknown role'}_\n${lead.pitchAngle ? `> ${lead.pitchAngle}` : ''}`,
        },
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_No HOT leads today — keep the pipeline flowing_ 💪' },
    });
  }

  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: `ai50m Automation Pipeline • ${new Date().toISOString()}`,
    }],
  });

  return blocks;
}

function buildTierBar(hot, warm, cold) {
  const total = hot + warm + cold;
  if (total === 0) return '—';
  return `🔥${hot} 🟡${warm} ❄️${cold}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function loadJSON(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function postToSlack(webhookUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(webhookUrl);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(d);
        } else {
          reject(new Error(`Slack webhook ${res.statusCode}: ${d.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

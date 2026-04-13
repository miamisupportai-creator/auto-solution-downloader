import dotenv from 'dotenv';
dotenv.config({ override: true });

const SMARTLEAD_KEY = process.env.SMARTLEAD_API_KEY;
const BASE = 'https://server.smartlead.ai/api/v1';

async function apiFetch(path, options = {}) {
  const { default: https } = await import('https');
  const { URL } = await import('url');

  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', SMARTLEAD_KEY);

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// Find or create ai50m campaign for Miami job board leads
async function getOrCreateCampaign() {
  const listRes = await apiFetch('/campaigns');
  const campaigns = listRes.body?.data || listRes.body || [];

  if (Array.isArray(campaigns)) {
    const existing = campaigns.find(c =>
      c.name?.includes('Miami Job Board') || c.name?.includes('ai50m-mvp')
    );
    if (existing) return existing.id;
  }

  // Create new campaign
  const createRes = await apiFetch('/campaigns', {
    method: 'POST',
    body: {
      name: 'ai50m — Miami Job Board Leads',
      client_id: null,
      track_settings: ['DONT_TRACK_EMAIL_OPEN', 'DONT_TRACK_LINK_CLICK'],
      stop_lead_settings: 'REPLY_TO_AN_EMAIL',
      unsubscribe_text: 'Unsubscribe',
      send_as_plain_text: false,
      follow_up_percentage: 40,
    },
  });

  if (createRes.status === 200 || createRes.status === 201) {
    const id = createRes.body?.data?.id || createRes.body?.id;
    console.log(`  📧 Created Smartlead campaign: ${id}`);
    return id;
  }

  console.error('❌ Failed to create campaign:', createRes.body);
  return null;
}

function buildPersonalizedEmail(lead) {
  const company = lead.company;
  const jobTitle = lead.jobTitle || 'team role';
  const firstName = lead.contactName?.split(' ')[0] || 'there';

  const subject = `Quick question about ${company}'s ${jobTitle.toLowerCase()} position`;

  const body = `Hi ${firstName},

I noticed ${company} is hiring for a ${jobTitle} role — which often signals growing demand for that type of work.

We're an AI automation agency based in Miami (ai50m.com) and we've been helping companies like yours automate exactly those kinds of tasks — usually saving 15-20 hours per week.

Would it make sense to jump on a 15-minute call to see if there's a fit? I can show you a quick demo of what we've built for similar businesses.

Best,
Rey
Founder, ai50m
We Automate. You Grow. | ai50m.com`;

  return { subject, body };
}

export async function addLeadToSmartlead(lead) {
  const campaignId = await getOrCreateCampaign();
  if (!campaignId) return false;

  const { subject, body } = buildPersonalizedEmail(lead);

  // Build lead object
  const leadPayload = {
    lead_list: [{
      first_name: lead.contactName?.split(' ')[0] || '',
      last_name: lead.contactName?.split(' ').slice(1).join(' ') || '',
      email: lead.contactEmail || `info@${lead.website || lead.company.toLowerCase().replace(/\s+/g, '') + '.com'}`,
      company_name: lead.company,
      custom_fields: {
        job_title_found: lead.jobTitle || '',
        lead_score: String(lead.leadScore || 0),
        tier: lead.tier || 'WARM',
        source: 'indeed',
        location: lead.location || 'Miami, FL',
      },
    }],
  };

  const addRes = await apiFetch(`/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: leadPayload,
  });

  if (addRes.status === 200 || addRes.status === 201) {
    console.log(`  ✅ Lead added to Smartlead: ${lead.company}`);
    return true;
  }

  console.error(`  ❌ Failed to add ${lead.company}:`, addRes.status, addRes.body);
  return false;
}

export async function addBatchToSmartlead(leads, minScore = 45) {
  const qualified = leads.filter(l => (l.leadScore || 0) >= minScore);
  console.log(`\n📧 Smartlead: ${qualified.length}/${leads.length} leads qualify (score >= ${minScore})`);

  let added = 0;
  for (const lead of qualified) {
    const success = await addLeadToSmartlead(lead);
    if (success) added++;
    await new Promise(r => setTimeout(r, 500)); // rate limit
  }

  console.log(`  Sent to Smartlead: ${added}/${qualified.length}`);
  return added;
}

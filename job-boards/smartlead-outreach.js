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

// Cache campaign ID within a run
let _campaignId = null;

async function getOrCreateCampaign() {
  if (_campaignId) return _campaignId;

  // Check existing campaigns
  const listRes = await apiFetch('/campaigns/');
  const campaigns = listRes.body?.data || listRes.body || [];

  if (Array.isArray(campaigns)) {
    const existing = campaigns.find(c =>
      c.name?.includes('ai50m — Miami') || c.name?.includes('ai50m-360-mvp')
    );
    if (existing) {
      _campaignId = existing.id;
      console.log(`  📧 Using existing campaign: ${_campaignId}`);
      return _campaignId;
    }
  }

  // Create new campaign
  const createRes = await apiFetch('/campaigns/create', {
    method: 'POST',
    body: {
      name: 'ai50m — Miami 360 MVP',
      track_settings: {
        track_open: true,
        track_click: false,
      },
    },
  });

  if (createRes.status === 200 || createRes.status === 201) {
    const id = createRes.body?.data?.id || createRes.body?.id;
    if (!id) {
      console.error('❌ No campaign ID in response:', JSON.stringify(createRes.body).slice(0, 200));
      return null;
    }

    // Set schedule (required before sending)
    await apiFetch(`/campaigns/${id}/schedule`, {
      method: 'POST',
      body: {
        timezone: 'America/New_York',
        days_of_the_week: [1, 2, 3, 4, 5],
        start_hour: '09:00',
        end_hour: '17:00',
        min_time_btw_emails: 15,
        max_new_leads_per_day: 20,
      },
    });

    console.log(`  📧 Created Smartlead campaign: ${id}`);
    _campaignId = id;
    return id;
  }

  console.error('❌ Failed to create campaign:', createRes.status, JSON.stringify(createRes.body).slice(0, 200));
  return null;
}

function buildPersonalizedEmail(lead) {
  const company = lead.company;
  const jobTitle = lead.jobTitle || 'team role';
  const firstName = lead.contactName?.split(' ')[0] || 'there';

  const subject = `Quick question about ${company}'s ${jobTitle.toLowerCase()} role`;

  const body = `Hi ${firstName},

I noticed ${company} is hiring for a ${jobTitle.toLowerCase()} — a role that usually means that type of work is growing fast.

We're an AI automation agency in Miami (ai50m.com) and we help businesses automate exactly those workflows. Most clients save 15-20 hours/week and cut costs by 30-40%.

Would a 15-minute call make sense? I can show you a quick demo of what we've built for similar companies in Miami.

Best,
Rey
Founder, ai50m
We Automate. You Grow.`;

  return { subject, body };
}

export async function addLeadToSmartlead(lead) {
  const campaignId = await getOrCreateCampaign();
  if (!campaignId) return false;

  const { subject, body } = buildPersonalizedEmail(lead);
  const email = lead.contactEmail ||
    `info@${(lead.website || lead.company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com')}`;

  const leadPayload = {
    lead_list: [{
      first_name: lead.contactName?.split(' ')[0] || '',
      last_name: lead.contactName?.split(' ').slice(1).join(' ') || '',
      email,
      company_name: lead.company,
      custom_fields: {
        job_title_found: lead.jobTitle || '',
        lead_score: String(lead.leadScore || 0),
        tier: lead.tier || 'WARM',
        source: 'indeed_apify',
        location: lead.location || 'Miami, FL',
      },
    }],
  };

  const addRes = await apiFetch(`/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: leadPayload,
  });

  if (addRes.status === 200 || addRes.status === 201) {
    const added = addRes.body?.data?.total_leads_added ?? addRes.body?.total_leads_added ?? '?';
    console.log(`  ✅ ${lead.company} → Smartlead (added: ${added})`);
    return true;
  }

  console.error(`  ❌ ${lead.company}: ${addRes.status}`, JSON.stringify(addRes.body).slice(0, 150));
  return false;
}

export async function addBatchToSmartlead(leads, minScore = 45) {
  const qualified = leads.filter(l => (l.leadScore || 0) >= minScore);
  console.log(`\n📧 Smartlead: ${qualified.length}/${leads.length} qualify (score ≥ ${minScore})`);

  let added = 0;
  for (const lead of qualified) {
    const success = await addLeadToSmartlead(lead);
    if (success) added++;
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`  Total sent to Smartlead: ${added}/${qualified.length}`);
  return added;
}

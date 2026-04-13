import { writeFileSync, readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';
dotenv.config({ override: true });

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const ACTOR_ID = 'bebity~indeed-jobs-scraper';

// Job titles that signal companies need AI automation
const TARGET_QUERIES = [
  'social media manager',
  'customer service representative',
  'data entry specialist',
  'administrative assistant',
  'marketing coordinator',
  'content creator',
  'sales support specialist',
];

const LOCATION = 'Miami, FL';
const MAX_ITEMS = 50;

async function apiFetch(url, options = {}) {
  const { default: https } = await import('https');
  const { URL } = await import('url');
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_TOKEN}`,
        ...options.headers,
      },
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

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function scrapeIndeedLeads() {
  console.log('🔍 Starting Apify Indeed scrape for Miami leads...');

  const query = TARGET_QUERIES[Math.floor(Math.random() * TARGET_QUERIES.length)];
  console.log(`  Query: "${query}" in ${LOCATION}`);

  // Start actor run
  const runRes = await apiFetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs`,
    {
      method: 'POST',
      body: {
        queries: [{ query, location: LOCATION }],
        maxItems: MAX_ITEMS,
        scrapeJobDetails: false,
      },
    }
  );

  if (runRes.status !== 201 && runRes.status !== 200) {
    console.error('❌ Failed to start Apify run:', runRes.body);
    return [];
  }

  const runId = runRes.body?.data?.id;
  console.log(`  Run started: ${runId}`);

  // Poll until finished (max 5 min)
  let status = 'RUNNING';
  let attempts = 0;
  while (status === 'RUNNING' || status === 'READY') {
    await sleep(10000);
    attempts++;
    if (attempts > 30) { console.log('⏱️ Timeout waiting for Apify run'); break; }

    const statusRes = await apiFetch(`https://api.apify.com/v2/actor-runs/${runId}`);
    status = statusRes.body?.data?.status;
    console.log(`  Status: ${status} (${attempts * 10}s)`);
    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED' || status === 'ABORTED') {
      console.error('❌ Apify run failed:', status);
      return [];
    }
  }

  // Fetch results
  const dataRes = await apiFetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?limit=200`
  );

  const items = Array.isArray(dataRes.body) ? dataRes.body : [];
  console.log(`✅ Got ${items.length} job postings`);

  // Extract unique companies
  const companies = new Map();
  for (const item of items) {
    const company = item.company || item.companyName;
    if (!company || company.toLowerCase() === 'unknown') continue;
    if (!companies.has(company)) {
      companies.set(company, {
        company,
        jobTitle: item.title || item.positionName,
        location: item.location || LOCATION,
        jobUrl: item.url || item.jobUrl,
        datePosted: item.postedAt || item.datePosted || new Date().toISOString(),
        source: 'indeed',
        searchQuery: query,
      });
    }
  }

  const results = Array.from(companies.values());
  console.log(`  Unique companies: ${results.length}`);
  return results;
}

// Standalone test
if (process.argv[1].endsWith('apify-scraper.js')) {
  const leads = await scrapeIndeedLeads();
  console.log(JSON.stringify(leads.slice(0, 3), null, 2));
}

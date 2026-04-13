import dotenv from 'dotenv';
dotenv.config({ override: true });

const CLAY_API_KEY = process.env.CLAY_API_KEY;
const CLAY_BASE = 'https://api.clay.com/v1';

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
        'X-Clay-Token': CLAY_API_KEY,
        'Authorization': `Bearer ${CLAY_API_KEY}`,
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

// Derive domain from company name (fallback when Clay unavailable)
function guessCompanyDomain(companyName) {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+(inc|llc|ltd|corp|co|company|group|solutions|services)$/i, '')
    .trim()
    .replace(/\s+/g, '') + '.com';
}

export async function enrichCompany(lead) {
  const { company, jobTitle, location } = lead;
  console.log(`  🔬 Enriching: ${company}`);

  // Try Clay company enrichment
  try {
    const res = await apiFetch(`${CLAY_BASE}/enrichment/company`, {
      method: 'POST',
      body: {
        name: company,
        location: location || 'Miami, FL',
      },
    });

    if (res.status === 200 && res.body?.data) {
      const d = res.body.data;
      return {
        ...lead,
        enriched: true,
        website: d.website || d.domain,
        industry: d.industry,
        employeeCount: d.employeeCount || d.num_employees,
        linkedinUrl: d.linkedin_url || d.linkedinUrl,
        contactName: d.ceo_name || d.founder_name,
        contactEmail: d.ceo_email || d.contact_email,
        contactTitle: d.ceo_title || 'CEO',
        annualRevenue: d.annual_revenue,
        description: d.short_description || d.description,
        enrichedAt: new Date().toISOString(),
      };
    }

    // Clay returned non-200 — use fallback
    console.log(`  ⚠️ Clay returned ${res.status}, using fallback enrichment`);
  } catch (err) {
    console.log(`  ⚠️ Clay error: ${err.message}, using fallback`);
  }

  // Fallback: minimal enrichment from known data
  return {
    ...lead,
    enriched: false,
    website: guessCompanyDomain(company),
    industry: inferIndustryFromJob(jobTitle),
    employeeCount: null,
    contactName: null,
    contactEmail: null,
    contactTitle: null,
    enrichedAt: new Date().toISOString(),
  };
}

function inferIndustryFromJob(jobTitle = '') {
  const title = jobTitle.toLowerCase();
  if (title.includes('restaurant') || title.includes('food')) return 'Food & Beverage';
  if (title.includes('medical') || title.includes('health')) return 'Healthcare';
  if (title.includes('real estate')) return 'Real Estate';
  if (title.includes('retail') || title.includes('store')) return 'Retail';
  if (title.includes('tech') || title.includes('software')) return 'Technology';
  return 'General Business';
}

export async function enrichBatch(leads, maxConcurrent = 3) {
  const results = [];
  for (let i = 0; i < leads.length; i += maxConcurrent) {
    const batch = leads.slice(i, i + maxConcurrent);
    const enriched = await Promise.all(batch.map(enrichCompany));
    results.push(...enriched);
    if (i + maxConcurrent < leads.length) {
      await new Promise(r => setTimeout(r, 1000)); // rate limit
    }
  }
  return results;
}

/**
 * Enrichment engine — Clay has no public API, so we use:
 * 1. Apify data already available (company, job title, location)
 * 2. Industry inference from job title / company name
 * 3. Domain guessing (for email targeting in Smartlead)
 *
 * When Apollo.io or Hunter keys are available, swap in those providers.
 */
import dotenv from 'dotenv';
dotenv.config({ override: true });

// Industry keywords → label mapping
const INDUSTRY_KEYWORDS = {
  restaurant: 'Food & Beverage',
  food: 'Food & Beverage',
  cafe: 'Food & Beverage',
  dental: 'Healthcare',
  medical: 'Healthcare',
  clinic: 'Healthcare',
  health: 'Healthcare',
  pharmacy: 'Healthcare',
  realty: 'Real Estate',
  'real estate': 'Real Estate',
  properties: 'Real Estate',
  law: 'Legal',
  attorney: 'Legal',
  legal: 'Legal',
  insurance: 'Insurance',
  spa: 'Wellness & Beauty',
  salon: 'Wellness & Beauty',
  auto: 'Automotive',
  car: 'Automotive',
  hotel: 'Hospitality',
  resort: 'Hospitality',
  retail: 'Retail',
  store: 'Retail',
  tech: 'Technology',
  software: 'Technology',
  marketing: 'Marketing',
  accounting: 'Finance',
  finance: 'Finance',
};

// Size estimates from job title signals
const JOB_SIZE_SIGNALS = {
  'director': [50, 200],
  'vp ': [100, 500],
  'chief': [100, 500],
  'coordinator': [10, 100],
  'assistant': [5, 50],
  'specialist': [10, 100],
  'manager': [20, 200],
  'representative': [10, 100],
};

function inferIndustry(company = '', jobTitle = '') {
  const text = (company + ' ' + jobTitle).toLowerCase();
  for (const [keyword, label] of Object.entries(INDUSTRY_KEYWORDS)) {
    if (text.includes(keyword)) return label;
  }
  return 'General Business';
}

function inferEmployeeRange(jobTitle = '') {
  const title = jobTitle.toLowerCase();
  for (const [signal, range] of Object.entries(JOB_SIZE_SIGNALS)) {
    if (title.includes(signal)) return range;
  }
  return [10, 50]; // default SMB assumption
}

function guessDomain(companyName = '') {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+(inc|llc|ltd|corp|co|company|group|solutions|services|associates|miami)$/i, '')
    .trim()
    .replace(/\s+/g, '') + '.com';
}

export async function enrichCompany(lead) {
  const { company, jobTitle, location } = lead;

  const industry = inferIndustry(company, jobTitle);
  const [minEmp, maxEmp] = inferEmployeeRange(jobTitle);
  const website = guessDomain(company);

  return {
    ...lead,
    enriched: true,           // lightweight enrichment
    enrichedBy: 'inference',
    website,
    industry,
    employeeCount: Math.round((minEmp + maxEmp) / 2),
    employeeRange: `${minEmp}-${maxEmp}`,
    contactName: null,        // no contact lookup without Apollo/Hunter
    contactEmail: null,
    contactTitle: null,
    enrichedAt: new Date().toISOString(),
  };
}

export async function enrichBatch(leads, maxConcurrent = 5) {
  // Pure inference — no API calls, safe to run all at once
  return Promise.all(leads.map(enrichCompany));
}

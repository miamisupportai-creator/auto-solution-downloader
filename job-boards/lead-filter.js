import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_FILE = path.join(__dirname, '../logs/job-boards-processed.json');

// Job titles by automation potential score
const JOB_SCORE_MAP = {
  'social media manager': 35,
  'content creator': 30,
  'customer service': 30,
  'data entry': 40,
  'administrative assistant': 25,
  'marketing coordinator': 30,
  'sales support': 25,
  'receptionist': 20,
  'scheduler': 30,
  'bookkeeper': 35,
  'virtual assistant': 40,
};

// ICP industries for AI automation agency (Miami focus)
const INDUSTRY_SCORES = {
  'healthcare': 30,
  'restaurant': 25,
  'real estate': 25,
  'retail': 20,
  'legal': 25,
  'dental': 30,
  'medical': 30,
  'hospitality': 20,
  'insurance': 25,
  'financial': 20,
};

export function loadProcessed() {
  if (!existsSync(PROCESSED_FILE)) return new Set();
  try {
    const data = JSON.parse(readFileSync(PROCESSED_FILE, 'utf-8'));
    return new Set(data.processed || []);
  } catch {
    return new Set();
  }
}

export function scoreLead(lead) {
  let score = 0;
  const notes = [];

  // Job type automation potential (0-40)
  const jobTitle = (lead.jobTitle || '').toLowerCase();
  for (const [keyword, pts] of Object.entries(JOB_SCORE_MAP)) {
    if (jobTitle.includes(keyword)) {
      score += pts;
      notes.push(`job:${keyword}(+${pts})`);
      break;
    }
  }

  // Industry fit (0-30)
  const industry = (lead.industry || '').toLowerCase();
  for (const [keyword, pts] of Object.entries(INDUSTRY_SCORES)) {
    if (industry.includes(keyword)) {
      score += pts;
      notes.push(`industry:${keyword}(+${pts})`);
      break;
    }
  }

  // Company size signals (0-20)
  const emp = lead.employeeCount;
  if (emp) {
    if (emp >= 5 && emp <= 50) { score += 20; notes.push('size:SMB(+20)'); }
    else if (emp > 50 && emp <= 200) { score += 10; notes.push('size:mid(+10)'); }
  } else {
    score += 10; // unknown size — assume SMB
    notes.push('size:unknown(+10)');
  }

  // Has contact info (0-10)
  if (lead.contactEmail) { score += 10; notes.push('has_email(+10)'); }
  else if (lead.website) { score += 5; notes.push('has_website(+5)'); }

  return {
    ...lead,
    leadScore: Math.min(score, 100),
    scoreNotes: notes.join(', '),
    tier: score >= 70 ? 'HOT' : score >= 45 ? 'WARM' : 'COLD',
  };
}

export function filterNewLeads(leads, processed) {
  return leads.filter(lead => {
    const key = lead.company.toLowerCase().replace(/\s+/g, '-');
    return !processed.has(key);
  });
}

export function getLeadKey(lead) {
  return lead.company.toLowerCase().replace(/\s+/g, '-');
}

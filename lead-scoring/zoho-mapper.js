/**
 * zoho-mapper.js
 * Maps raw Zoho CRM record → normalized LeadData schema.
 */

// Industry → normalized bucket
const INDUSTRY_MAP = {
  "Technology":          "technology",
  "Software":            "technology",
  "SaaS":                "technology",
  "Healthcare":          "healthcare",
  "Medical":             "healthcare",
  "Finance":             "finance",
  "Financial Services":  "finance",
  "Banking":             "finance",
  "Retail":              "retail",
  "E-Commerce":          "retail",
  "Restaurant":          "restaurant",
  "Food & Beverage":     "restaurant",
  "Real Estate":         "real_estate",
  "Construction":        "construction",
  "Education":           "education",
  "Legal":               "professional_services",
  "Consulting":          "professional_services",
  "Manufacturing":       "manufacturing",
};

// Job title → seniority level
function deriveSeniority(title = "") {
  const t = title.toLowerCase();
  if (/\b(ceo|cto|cfo|coo|cmo|founder|owner|president|chief)\b/.test(t)) return "c_suite";
  if (/\b(vp|vice president|vice-president)\b/.test(t))                   return "vp";
  if (/\b(director)\b/.test(t))                                           return "director";
  if (/\b(manager|head of|lead)\b/.test(t))                               return "manager";
  if (title)                                                              return "individual";
  return "unknown";
}

// Revenue string → number (handles "1M-5M", "$2,500,000", etc.)
function parseRevenue(val) {
  if (!val) return null;
  const s = String(val).replace(/[$,\s]/g, "").toLowerCase();
  const m = s.match(/^([\d.]+)\s*([kmb])?/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
  return Math.round(n * mult);
}

function budgetTier(revenue) {
  if (!revenue) return "unknown";
  if (revenue >= 10_000_000) return "enterprise";
  if (revenue >= 1_000_000)  return "mid";
  return "smb";
}

export function mapZohoToLeadData(record) {
  const rev = parseRevenue(record.Annual_Revenue);

  return {
    id:    record.id,
    name:  [record.First_Name, record.Last_Name].filter(Boolean).join(" "),
    email: record.Email || null,

    company: {
      name:          record.Company          || record.Account_Name || null,
      industry:      INDUSTRY_MAP[record.Industry] || record.Industry || "unknown",
      employeeCount: parseInt(record.No_of_Employees) || null,
      annualRevenue: rev,
      country:       record.Country || null,
      state:         record.State   || null,
      city:          record.City    || null,
    },

    contact: {
      title:       record.Designation || record.Title || null,
      seniority:   deriveSeniority(record.Designation || record.Title),
      phone:       record.Phone || record.Mobile || null,
      linkedinUrl: record.LinkedIn__c || null,
    },

    engagement: {
      leadSource:       record.Lead_Source    || null,
      leadStatus:       record.Lead_Status    || null,
      rating:           record.Rating         || null,
      lastActivityDate: record.Last_Activity_Time?.split("T")[0] || null,
      createdAt:        record.Created_Time   || null,
      convertedAt:      record.Converted_Date_Time || null,
      emailOptOut:      record.Email_Opt_Out  || false,
    },

    signals: {
      budgetMentioned:    !!(record.Budget__c || record.Annual_Revenue),
      budgetAmount:       rev,
      urgencyMentioned:   record.Rating === "Hot" || record.Lead_Status === "Pre-Qualified",
      demoRequested:      record.Demo_Requested__c || false,
      pricingPageVisited: record.Pricing_Page_Visited__c || false,
      websiteVisits:      parseInt(record.Website_Visits__c) || 0,
      emailsOpened:       parseInt(record.Emails_Opened__c)  || 0,
      emailsClicked:      parseInt(record.Emails_Clicked__c) || 0,
    },

    _raw:        record,
    _budgetTier: budgetTier(rev),
  };
}

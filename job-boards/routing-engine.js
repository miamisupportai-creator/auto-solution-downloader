/**
 * ai50m — Lead Routing Engine
 * Scores leads and routes them to the correct outreach channel.
 * COLD (<50) → Smartlead long-nurture
 * WARM (50-79) → Smartlead immediate campaign
 * HOT (80+) → WhatsApp first, Smartlead backup
 */

const CALENDLY_LINK = 'https://calendly.com/ai50m/30min';

// ─── Core Routing ─────────────────────────────────────────────────────────────

/**
 * Routes a scored+enriched lead to the correct channel.
 * @param {object} lead - Lead with leadScore and enrichment fields
 * @returns {object} - Routing decision
 */
export function routeLead(lead) {
  const score = lead.leadScore ?? lead.score ?? 0;

  if (score >= 80) {
    return {
      tier: 'HOT',
      action: 'immediate',
      channel: 'whatsapp',
      priority: 'high',
      message: generateWhatsAppMessage(lead),
      fallbackChannel: 'email',
      fallbackMessage: generateWarmEmail(lead),
    };
  }

  if (score >= 50) {
    return {
      tier: 'WARM',
      action: 'campaign',
      channel: 'email',
      priority: 'medium',
      message: generateWarmEmail(lead),
    };
  }

  return {
    tier: 'COLD',
    action: 'nurture',
    channel: 'email',
    priority: 'low',
    message: generateColdNurtureEmail(lead),
    smartleadTag: 'long-nurture',
  };
}

// ─── Message Generators ───────────────────────────────────────────────────────

/**
 * Generates a personalized WhatsApp opening message for HOT leads.
 * Casual, human, not spammy. Max 3 sentences.
 * @param {object} lead
 * @returns {string}
 */
export function generateWhatsAppMessage(lead) {
  const company = lead.company || 'your company';
  const jobTitle = lead.jobTitle || 'the role you posted';
  const pitchAngle = lead.pitchAngle || `automate that process with AI and save significant time`;
  const painPoint = lead.painPoints?.[0] || 'manual workflows slowing you down';

  // Rotate between a few casual openers to avoid looking templated
  const openers = [
    `Hey! Saw ${company} is hiring for ${jobTitle} — looks like you're scaling fast.`,
    `Hi there — noticed ${company} posted a ${jobTitle} role and wanted to reach out.`,
    `Hey, came across ${company}'s ${jobTitle} posting and it caught my eye.`,
  ];
  const opener = openers[Math.abs(hashCode(company)) % openers.length];

  return `${opener} We help companies like yours ${pitchAngle} — specifically around ${painPoint}. Would love to show you a quick demo: ${CALENDLY_LINK}`;
}

/**
 * Generates a cold email for long-nurture sequences.
 * @param {object} lead
 * @returns {string}
 */
export function generateColdNurtureEmail(lead) {
  const company = lead.company || 'your company';
  const industry = lead.industry || 'your industry';
  const firstName = lead.contactName?.split(' ')?.[0] || 'there';

  return `Subject: AI automation trends in ${industry}

Hi ${firstName},

I came across ${company} and wanted to share something relevant — AI automation is reshaping ${industry}, and companies that move early tend to pull ahead fast.

At ai50m, we help businesses automate their most time-consuming workflows using AI, typically saving 10-20 hours per week. No complicated setup — we handle everything.

When the timing is right, I'd love to show you what's possible: ${CALENDLY_LINK}

Best,
Rey
ai50m — We Automate. You Grow.
ai50m.com`;
}

/**
 * Generates a warm outreach email using AI pitch angle.
 * @param {object} lead
 * @returns {string}
 */
export function generateWarmEmail(lead) {
  const company = lead.company || 'your company';
  const firstName = lead.contactName?.split(' ')?.[0] || 'there';
  const jobTitle = lead.jobTitle || 'the role you recently posted';
  const pitchAngle = lead.pitchAngle
    ? lead.pitchAngle
    : `automate the workflows behind ${jobTitle}`;
  const painPoint = lead.painPoints?.[0] || 'manual processes that take up valuable time';

  return `Subject: ${company} — there's a faster way to handle this

Hi ${firstName},

I noticed ${company} is hiring for ${jobTitle} — which usually means you're dealing with ${painPoint}.

We built ai50m specifically to help companies ${pitchAngle}. Most of our clients see results in the first 2 weeks without disrupting their current setup.

Happy to walk you through a 30-minute demo — no pitch, just show you what the automation looks like: ${CALENDLY_LINK}

Best,
Rey
ai50m — We Automate. You Grow.
ai50m.com`;
}

// ─── Smartlead Campaign Selector ─────────────────────────────────────────────

/**
 * Returns Smartlead campaign config based on lead tier.
 * @param {object} lead
 * @returns {object} - { campaignTag, sequenceType, followUpDays }
 */
export function getSmartleadConfig(lead) {
  const tier = lead.tier || routeLead(lead).tier;

  if (tier === 'HOT') {
    return {
      campaignTag: 'hot-backup',
      sequenceType: 'immediate',
      followUpDays: [1, 3],
    };
  }

  if (tier === 'WARM') {
    return {
      campaignTag: 'warm-outreach',
      sequenceType: 'immediate',
      followUpDays: [3, 7],
    };
  }

  return {
    campaignTag: 'cold-nurture',
    sequenceType: 'long-nurture',
    followUpDays: [14, 28, 56],
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

/**
 * lead-scoring-engine.js
 * Production-ready multi-layer lead scoring engine for ai50m
 * Zero npm dependencies — pure Node.js
 * Version: 1.0.0
 */

'use strict';

const ENGINE_VERSION = '1.0.0';

/**
 * Apply temporal decay to a raw score based on signal date.
 */
function applyTemporalDecay(score, signalDate, decayConfig) {
  const now = new Date();
  const signal = new Date(signalDate);
  const ageDays = Math.floor((now - signal) / (1000 * 60 * 60 * 24));
  let multiplier = 0;
  if      (ageDays <= 7)  multiplier = decayConfig['0-7']   ?? 1.00;
  else if (ageDays <= 14) multiplier = decayConfig['8-14']  ?? 0.80;
  else if (ageDays <= 30) multiplier = decayConfig['15-30'] ?? 0.50;
  else if (ageDays <= 60) multiplier = decayConfig['31-60'] ?? 0.25;
  else                    multiplier = decayConfig['60+']   ?? 0.00;
  return Math.round(score * multiplier * 100) / 100;
}

function scoreFirmographic(leadData, firmConfig) {
  const breakdown = {};
  let total = 0;
  const emp = leadData.employees ?? 0;
  let sizeScore = 0;
  if      (emp >= 1   && emp <= 10)   sizeScore = firmConfig.companySize.tiers['1-10']    ?? 0;
  else if (emp >= 11  && emp <= 50)   sizeScore = firmConfig.companySize.tiers['11-50']   ?? 0;
  else if (emp >= 51  && emp <= 200)  sizeScore = firmConfig.companySize.tiers['51-200']  ?? 0;
  else if (emp >= 201 && emp <= 500)  sizeScore = firmConfig.companySize.tiers['201-500'] ?? 0;
  else if (emp >= 501 && emp <= 1000) sizeScore = firmConfig.companySize.tiers['501-1000']?? 0;
  else if (emp > 1000)                sizeScore = firmConfig.companySize.tiers['1000+']   ?? 0;
  breakdown.companySize = Math.min(sizeScore, firmConfig.companySize.max);
  total += breakdown.companySize;

  const industry = (leadData.industry ?? '').toLowerCase();
  let industryScore = 0;
  if      (firmConfig.industryMatch.primaryIndustries.some(i => industry.includes(i)))   industryScore = firmConfig.industryMatch.tiers.primary;
  else if (firmConfig.industryMatch.secondaryIndustries.some(i => industry.includes(i))) industryScore = firmConfig.industryMatch.tiers.secondary;
  else if (industry) industryScore = firmConfig.industryMatch.tiers.adjacent;
  breakdown.industryMatch = Math.min(industryScore, firmConfig.industryMatch.max);
  total += breakdown.industryMatch;

  const location = (leadData.location ?? '').toLowerCase();
  let geoScore = 0;
  if      (location.includes('miami'))   geoScore = firmConfig.geographicFit.tiers.miami;
  else if (location.includes('florida')) geoScore = firmConfig.geographicFit.tiers.florida;
  else if (location.includes('usa') || location.includes('united states')) geoScore = firmConfig.geographicFit.tiers.usa;
  else if (location.includes('latam') || location.includes('latin'))       geoScore = firmConfig.geographicFit.tiers.latam;
  else geoScore = firmConfig.geographicFit.tiers.other;
  breakdown.geographicFit = Math.min(geoScore, firmConfig.geographicFit.max);
  total += breakdown.geographicFit;

  const budget = leadData.budget ?? 0;
  let budgetScore = 0;
  if      (budget >= 500)              budgetScore = firmConfig.budgetCapability.tiers['500+'];
  else if (budget >= 200)              budgetScore = firmConfig.budgetCapability.tiers['200-499'];
  else if (budget >= 100)              budgetScore = firmConfig.budgetCapability.tiers['100-199'];
  else if (budget >= 50)               budgetScore = firmConfig.budgetCapability.tiers['50-99'];
  else                                  budgetScore = firmConfig.budgetCapability.tiers['under_50'];
  breakdown.budgetCapability = Math.min(budgetScore, firmConfig.budgetCapability.max);
  total += breakdown.budgetCapability;

  const stack = (leadData.techStack ?? []).map(t => t.toLowerCase());
  const compatible = firmConfig.techStackCompatibility.compatible;
  const matches = stack.filter(t => compatible.some(c => t.includes(c)));
  const techScore = matches.length * firmConfig.techStackCompatibility.pointsPerTool;
  breakdown.techStackCompatibility = Math.min(techScore, firmConfig.techStackCompatibility.max);
  total += breakdown.techStackCompatibility;

  const maxPossible = 80;
  const normalized = Math.min(100, Math.round((total / maxPossible) * 100));
  return { raw: total, normalized, breakdown, maxPossible };
}

function scoreBehavioral(signals, behavConfig, decayConfig) {
  const events = signals.behavioral?.events ?? [];
  const breakdown = {};
  let total = 0;
  let pricingVisits = 0, blogReadsSession = 0, pagesSession = 0;

  for (const event of events) {
    const date = event.date ?? new Date().toISOString();
    let raw = 0;
    switch (event.type) {
      case 'pricing_page_visit':
        pricingVisits++;
        if (pricingVisits === 1)     raw = behavConfig.pricingPageVisits.single;
        else if (pricingVisits >= 3) raw = behavConfig.pricingPageVisits.return3plus - behavConfig.pricingPageVisits.single;
        if (event.durationSeconds >= 180) raw += behavConfig.pricingPageVisits.durationBonus3min;
        break;
      case 'blog_read':        if (blogReadsSession < 5) { raw = behavConfig.contentEngagement.blogRead; blogReadsSession++; } break;
      case 'whitepaper_download':  raw = behavConfig.contentEngagement.whitepaperDownload; break;
      case 'case_study_view':      raw = behavConfig.contentEngagement.caseStudyView; break;
      case 'webinar_attendance':   raw = behavConfig.contentEngagement.webinarAttendance; break;
      case 'demo_request':         raw = behavConfig.contentEngagement.demoRequest; break;
      case 'email_open':           raw = behavConfig.emailEngagement.open; break;
      case 'email_click':          raw = behavConfig.emailEngagement.click; break;
      case 'email_reply':          raw = behavConfig.emailEngagement.reply; break;
      case 'email_unsubscribe':    raw = behavConfig.emailEngagement.unsubscribe; break;
      case 'page_view':
        if (pagesSession < behavConfig.sessionBehavior.maxPagesPerSession) { raw = behavConfig.sessionBehavior.pointsPerPage; pagesSession++; }
        break;
      case 'session_5min':      raw = behavConfig.sessionBehavior.durationBonus5min; break;
      case 'return_visit_week': raw = behavConfig.sessionBehavior.returnVisitorSameWeek; break;
      default: raw = 0;
    }
    const decayed = applyTemporalDecay(raw, date, decayConfig);
    breakdown[event.type] = (breakdown[event.type] ?? 0) + decayed;
    total += decayed;
  }

  const maxPossible = 150;
  const normalized = Math.min(100, Math.round((Math.max(0, total) / maxPossible) * 100));
  return { raw: total, normalized, breakdown, maxPossible };
}

function scoreIntent(signals, intentConfig, decayConfig) {
  const events = signals.intent?.events ?? [];
  const breakdown = {};
  let total = 0;
  const typeMap = {
    'hiring_target_dept':         intentConfig.hiringSignals.targetDepartmentHiring,
    'hiring_expansion':           intentConfig.hiringSignals.expandingHeadcount,
    'clevel_change':              intentConfig.hiringSignals.cLevelChange,
    'recent_funding':             intentConfig.fundingEvents.recentFunding,
    'series_ac':                  intentConfig.fundingEvents.seriesAC,
    'ipo_announcement':           intentConfig.fundingEvents.ipoAnnouncement,
    'g2_capterra_view':           intentConfig.competitorResearch.g2CapterraView,
    'competitor_comparison_page': intentConfig.competitorResearch.competitorComparisonPage,
    'review_site_research':       intentConfig.competitorResearch.reviewSiteResearch,
    'industry_publication_read':  intentConfig.categoryResearch.industryPublicationRead,
    'third_party_webinar':        intentConfig.categoryResearch.thirdPartyWebinar,
    'forum_discussion':           intentConfig.categoryResearch.forumDiscussion,
  };
  for (const event of events) {
    const date = event.date ?? new Date().toISOString();
    const raw = typeMap[event.type] ?? 0;
    const decayed = applyTemporalDecay(raw, date, decayConfig);
    breakdown[event.type] = (breakdown[event.type] ?? 0) + decayed;
    total += decayed;
  }
  const maxPossible = 100;
  const normalized = Math.min(100, Math.round((Math.max(0, total) / maxPossible) * 100));
  return { raw: total, normalized, breakdown, maxPossible };
}

function calculateSynergyBonus(signals, synergyConfig) {
  const s = signals.synergy ?? {};
  let bonus = 0;
  const applied = [];
  if (s.multipleChannelsSamePerson && s.multiplePeopleSameAccount && s.progressiveActivityIncrease) {
    bonus = synergyConfig.allThree; applied.push('allThree');
  } else {
    if (s.multipleChannelsSamePerson)  { bonus += synergyConfig.multipleChannelsSamePerson;  applied.push('multipleChannelsSamePerson'); }
    if (s.multiplePeopleSameAccount)   { bonus += synergyConfig.multiplePeopleSameAccount;   applied.push('multiplePeopleSameAccount'); }
    if (s.progressiveActivityIncrease) { bonus += synergyConfig.progressiveActivityIncrease; applied.push('progressiveActivityIncrease'); }
  }
  return { bonus, applied };
}

/**
 * Determine the tier from total score.
 */
function calculateTier(totalScore, tiersConfig) {
  for (const [name, tier] of Object.entries(tiersConfig)) {
    if (totalScore >= tier.min && totalScore <= tier.max) return { name, ...tier };
  }
  return { name: 'cold', ...tiersConfig.cold };
}

/**
 * Build human-readable reasoning string from score breakdown.
 */
function buildScoreReasoning(scoreBreakdown) {
  const { firmographic, behavioral, intent, synergy, total, tier } = scoreBreakdown;
  const lines = [
    'Score total: ' + total + '/100 -> Tier: ' + tier.name.toUpperCase(), '',
    '-- Firmographic --'
  ];
  for (const [k,v] of Object.entries(firmographic.breakdown ?? {})) lines.push('  ' + k + ': ' + v + ' pts');
  lines.push('  Subtotal: ' + firmographic.normalized + '/100 (weight 30%)', '');
  lines.push('-- Behavioral --');
  for (const [k,v] of Object.entries(behavioral.breakdown ?? {})) lines.push('  ' + k + ': ' + v + ' pts (decayed)');
  lines.push('  Subtotal: ' + behavioral.normalized + '/100 (weight 40%)', '');
  lines.push('-- Intent --');
  for (const [k,v] of Object.entries(intent.breakdown ?? {})) lines.push('  ' + k + ': ' + v + ' pts (decayed)');
  lines.push('  Subtotal: ' + intent.normalized + '/100 (weight 30%)', '');
  if (synergy.bonus > 0) lines.push('-- Synergy Bonus: +' + synergy.bonus + ' (' + synergy.applied.join(', ') + ')', '');
  lines.push('Action: ' + tier.action + (tier.slaHours ? ' | SLA: ' + tier.slaHours + 'h' : ''));
  return lines.join('\n');
}

/**
 * Validate a scored lead against sales routing gates.
 */
function validateForSalesRouting(scoreResult, rules) {
  const gates = rules.salesRoutingGates;
  const contact = rules.contactValidation;
  const reasons = [];
  if (scoreResult.scores.firmographic < gates.minIcpFitScore)
    reasons.push('ICP fit score ' + scoreResult.scores.firmographic + ' < minimum ' + gates.minIcpFitScore);
  const signalTypes = scoreResult.signals.types ?? [];
  if (signalTypes.length < gates.minSignalTypes)
    reasons.push('Signal types count ' + signalTypes.length + ' < minimum ' + gates.minSignalTypes);
  const mostRecent = scoreResult.signals.mostRecentDate;
  if (mostRecent) {
    const ageDays = Math.floor((Date.now() - new Date(mostRecent)) / (1000*60*60*24));
    if (ageDays > gates.maxSignalAgeDays)
      reasons.push('Most recent signal is ' + ageDays + ' days old > max ' + gates.maxSignalAgeDays);
  }
  if (gates.requireDecisionMaker) {
    const title = (scoreResult.leadData?.jobTitle ?? '').toLowerCase();
    const isDecisionMaker = contact.requiredTitleKeywords.some(kw => title.includes(kw));
    const isExcluded = contact.excludedTitles.some(t => title.includes(t));
    if (!isDecisionMaker || isExcluded)
      reasons.push('Job title "' + title + '" does not qualify as decision maker');
  }
  if (scoreResult.scores.total < 50)
    reasons.push('Total score ' + scoreResult.scores.total + ' is in COLD tier');
  return { valid: reasons.length === 0, reasons };
}

/**
 * Score a lead using all four layers.
 */
function scoreLead(leadData, signals, config) {
  const startMs = Date.now();
  const firmResult  = scoreFirmographic(leadData, config.firmographic);
  const behavResult = scoreBehavioral(signals, config.behavioral, config.temporalDecay);
  const intentResult = scoreIntent(signals, config.intent, config.temporalDecay);
  const synergyResult = calculateSynergyBonus(signals, config.synergyBonus);
  const weighted =
    (firmResult.normalized   * config.weights.firmographic) +
    (behavResult.normalized  * config.weights.behavioral) +
    (intentResult.normalized * config.weights.intent);
  const total = Math.min(100, Math.max(0, Math.round(weighted + synergyResult.bonus)));
  const tier = calculateTier(total, config.tiers);
  const allEvents = [...(signals.behavioral?.events ?? []), ...(signals.intent?.events ?? [])];
  const signalTypes = [...new Set(allEvents.map(e => e.type))];
  const dates = allEvents.map(e => e.date).filter(Boolean).sort();
  const mostRecentDate = dates[dates.length - 1] ?? null;
  const breakdown = {
    firmographic:  { normalized: firmResult.normalized,   weighted: Math.round(firmResult.normalized   * config.weights.firmographic  * 100)/100, detail: firmResult.breakdown },
    behavioral:    { normalized: behavResult.normalized,  weighted: Math.round(behavResult.normalized  * config.weights.behavioral    * 100)/100, detail: behavResult.breakdown },
    intent:        { normalized: intentResult.normalized, weighted: Math.round(intentResult.normalized * config.weights.intent        * 100)/100, detail: intentResult.breakdown },
    synergy: synergyResult
  };
  const scoreResult = {
    leadId: leadData.id, timestamp: new Date().toISOString(), leadData,
    scores: { firmographic: firmResult.normalized, behavioral: behavResult.normalized, intent: intentResult.normalized, synergy: synergyResult.bonus, total },
    tier: { name: tier.name, action: tier.action, slaHours: tier.slaHours ?? null },
    signals: { count: allEvents.length, types: signalTypes, mostRecentDate },
    breakdown,
    metadata: { engineVersion: ENGINE_VERSION, configVersion: config.version, calculationMs: Date.now() - startMs }
  };
  scoreResult.reasoning = buildScoreReasoning({ ...breakdown, total, tier });
  scoreResult.validation = { passedSalesGates: false, gates: ['run validateForSalesRouting() for full gate check'] };
  return scoreResult;
}

export { scoreLead, applyTemporalDecay, validateForSalesRouting, calculateTier, buildScoreReasoning };

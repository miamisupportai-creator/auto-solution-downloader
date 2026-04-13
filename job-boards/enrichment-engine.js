/**
 * ai50m — Lead Enrichment Engine
 * Uses Claude AI to analyze leads and return automation potential,
 * pain points, pitch angle, and urgency signals.
 */

import https from 'https';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are an AI automation agency analyst. Given a company's job posting, analyze their automation potential and suggest the best pitch angle.

Return ONLY valid JSON with no markdown, no code blocks, no explanation. Just the raw JSON object.`;

/**
 * Calls Claude API to analyze a lead's automation potential.
 * @param {object} lead - Lead object with company, jobTitle, industry, etc.
 * @returns {Promise<object>} - Merged lead with AI analysis fields
 */
export async function enrichLeadWithAI(lead) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('  ⚠ ANTHROPIC_API_KEY not set — skipping AI enrichment');
    return lead;
  }

  const userContent = `Analyze this company for AI automation potential:

Company: ${lead.company || 'Unknown'}
Job Title Posted: ${lead.jobTitle || 'Unknown'}
Industry: ${lead.industry || 'Unknown'}
Employee Count: ${lead.employeeCount || 'Unknown'}
Website: ${lead.website || 'Unknown'}
Job Description Snippet: ${lead.jobDescription ? lead.jobDescription.slice(0, 500) : 'Not available'}
Location: ${lead.location || 'Unknown'}

Return a JSON object with exactly these fields:
{
  "automationPotential": <number 0-100>,
  "painPoints": [<string>, <string>, <string>],
  "pitchAngle": "<1 sentence on how to pitch ai50m to this company>",
  "urgency": "<LOW|MEDIUM|HIGH>"
}`;

  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  try {
    const data = await makeAnthropicRequest(payload);
    const text = data.content?.[0]?.text || '';

    // Strip any accidental markdown code fences
    const clean = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const analysis = JSON.parse(clean);

    return {
      ...lead,
      automationPotential: typeof analysis.automationPotential === 'number'
        ? Math.min(100, Math.max(0, analysis.automationPotential))
        : null,
      painPoints: Array.isArray(analysis.painPoints)
        ? analysis.painPoints.slice(0, 3)
        : [],
      pitchAngle: typeof analysis.pitchAngle === 'string'
        ? analysis.pitchAngle
        : '',
      urgency: ['LOW', 'MEDIUM', 'HIGH'].includes(analysis.urgency)
        ? analysis.urgency
        : 'LOW',
      aiEnriched: true,
      aiEnrichedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`  ⚠ AI enrichment failed for ${lead.company}: ${err.message}`);
    return { ...lead, aiEnriched: false };
  }
}

/**
 * Enriches a batch of leads with AI analysis.
 * Skips COLD leads (score < 50) to save API costs.
 * @param {object[]} leads - Array of scored lead objects
 * @returns {Promise<object[]>} - Leads with AI enrichment added where applicable
 */
export async function enrichBatchWithAI(leads) {
  const results = [];

  for (const lead of leads) {
    // Only AI-enrich warm/hot candidates to save API costs
    const score = lead.leadScore ?? lead.score ?? 0;
    if (score < 50) {
      results.push({ ...lead, aiEnriched: false, urgency: 'LOW' });
      continue;
    }

    const enriched = await enrichLeadWithAI(lead);
    results.push(enriched);

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}

// ─── Internal HTTP helper ────────────────────────────────────────────────────

function makeAnthropicRequest(payload) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}`));
          }
        } else {
          reject(new Error(`Anthropic API ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

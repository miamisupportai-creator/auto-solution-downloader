/**
 * jarvis-llm-router.js
 * Multi-provider LLM fallback: Claude (primary) → GPT-4o → Gemini
 * Drop-in for any node that calls Claude in the Jarvis pipeline.
 * 
 * Usage:
 *   import { callLLM } from './jarvis-llm-router.js';
 *   const result = await callLLM(userMessage, leadContext, systemPrompt);
 */

import https from 'https';

// ── helpers ──────────────────────────────────────────────────────────────────

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { reject(new Error(`JSON parse error: ${buf.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── providers ────────────────────────────────────────────────────────────────

async function callClaude(userMessage, systemPrompt, memory = []) {
  const messages = [
    ...memory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const res = await httpsPost(
    'https://api.anthropic.com/v1/messages',
    {
      'x-api-key':         process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    {
      model:      'claude-haiku-4-5',   // haiku = fast + cheap for Jarvis responses
      max_tokens: 512,
      system:     systemPrompt,
      messages
    }
  );
  if (res.status !== 200) throw new Error(`Claude ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.content[0].text;
}

async function callGPT4o(userMessage, systemPrompt, memory = []) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');

  const messages = [
    { role: 'system', content: systemPrompt },
    ...memory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage }
  ];

  const res = await httpsPost(
    'https://api.openai.com/v1/chat/completions',
    { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: 'gpt-4o-mini', max_tokens: 512, messages }
  );
  if (res.status !== 200) throw new Error(`GPT-4o ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.choices[0].message.content;
}

async function callGemini(userMessage, systemPrompt, memory = []) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const contents = [
    ...memory.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: userMessage }] }
  ];

  const res = await httpsPost(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {},
    { systemInstruction: { parts: [{ text: systemPrompt }] }, contents }
  );
  if (res.status !== 200) throw new Error(`Gemini ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body.candidates[0].content.parts[0].text;
}

// ── router ───────────────────────────────────────────────────────────────────

/**
 * @param {string} userMessage
 * @param {object} leadContext   – { lead_id, company, industry, score, ... }
 * @param {string} systemPrompt  – pre-built Jarvis system prompt
 * @param {Array}  memory        – last N messages [{ role, content }]
 * @returns {{ response: string, provider: string }}
 */
export async function callLLM(userMessage, leadContext, systemPrompt, memory = []) {
  const providers = [
    { name: 'claude',  fn: callClaude  },
    { name: 'gpt4o',   fn: callGPT4o   },
    { name: 'gemini',  fn: callGemini  }
  ];

  const errors = [];

  for (const { name, fn } of providers) {
    try {
      const text = await fn(userMessage, systemPrompt, memory);
      console.log(`[LLM Router] ✅ ${name} succeeded for lead ${leadContext?.lead_id || 'unknown'}`);
      return { response: text, provider: name, success: true };
    } catch (err) {
      console.warn(`[LLM Router] ⚠️  ${name} failed: ${err.message}`);
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(`All LLM providers failed.\n${errors.join('\n')}`);
}

export default callLLM;
/**
 * analyzer.js
 * Reemplaza claude-analyzer.sh — usa Anthropic SDK directamente.
 * Compatible con GitHub Actions, VPS, y CCR (sin Claude Code CLI).
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const MAX_ATTEMPTS = 3;

function extractJSON(raw) {
  // Direct parse
  try { JSON.parse(raw); return raw.trim(); } catch (_) {}

  // Strip markdown fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { JSON.parse(fenced[1]); return fenced[1].trim(); } catch (_) {}
  }

  // Extract first top-level JSON object
  const obj = raw.match(/(\{[\s\S]*\})/);
  if (obj) {
    try { JSON.parse(obj[1]); return obj[1].trim(); } catch (_) {}
  }

  return null;
}

export async function analyze(filteredPath, outputPath, promptPath) {
  const client     = new Anthropic(); // instanciar aquí — dotenv ya cargó
  const promptBase = fs.readFileSync(promptPath, "utf-8");
  const content    = fs.readFileSync(filteredPath, "utf-8");

  let prompt = `${promptBase}\n\n---\n\n${content}\n\n---\n\nReturn ONLY a valid n8n workflow JSON object. No markdown fences. No explanation. Raw JSON only.`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`  attempt ${attempt}/${MAX_ATTEMPTS}...`);

    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw       = msg.content[0]?.text ?? "";
    const extracted = extractJSON(raw);

    if (extracted) {
      fs.writeFileSync(outputPath, extracted);
      return true;
    }

    console.error(`  invalid JSON on attempt ${attempt}`);

    // Reinforce on next attempt
    prompt += `\n\nIMPORTANT: Previous response was not valid JSON. Return ONLY the raw JSON object. No text before or after.`;
  }

  throw new Error(`Failed after ${MAX_ATTEMPTS} attempts — no valid JSON returned`);
}

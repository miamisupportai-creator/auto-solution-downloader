/**
 * smartlead-templates.js
 * Personalized email templates per industry for Smartlead campaigns.
 * Rey Martinez | AI50M | Miami, FL | rey@ai50m.com | 786-969-3419
 */

export const SIGNATURE = `
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 13px; color: #555; border-top: 2px solid #00e5ff; padding-top: 12px; margin-top: 12px;">
  <strong style="color: #000; font-size: 14px;">Rey Martinez</strong><br>
  Founder, <strong>AI50M</strong> — We Automate. You Grow.<br>
  📍 Miami, FL &nbsp;|&nbsp; 📧 rey@ai50m.com &nbsp;|&nbsp; 📞 786-969-3419<br>
  <a href="https://calendly.com/ai50m/30min" style="color: #00e5ff; text-decoration: none; font-weight: bold;">📅 Book 15-min call</a>
</div>
`;

// ── Industry-specific templates ───────────────────────────────────────────────

export const TEMPLATES = {
  healthcare: {
    email1: {
      subject: "How {{company}} could save {{hours}} hours/month on patient admin",
      body: `<p>Hi {{first_name}},</p>
<p>I noticed {{company}} — healthcare practices like yours spend <strong>40-60% of staff time</strong> on scheduling, follow-ups, and insurance verification.</p>
<p>At AI50M, we automate exactly that. One of our healthcare clients went from 3 FTE doing admin to <strong>0.5 FTE in 30 days</strong> — same output, $8,400/month saved.</p>
<p>Worth a 15-min call to see if the numbers work for {{company}}?</p>
<p><a href="https://calendly.com/ai50m/30min" style="background:#00e5ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Book 15-Min Call →</a></p>`,
    },
    email2: {
      subject: "Quick question about {{company}}'s admin workflow",
      body: `<p>Hi {{first_name}},</p>
<p>Sent you a note last week — just wanted to follow up with a specific question:</p>
<p><strong>What's the #1 task your team does manually that you wish was automated?</strong></p>
<p>For most healthcare practices it's: appointment reminders, insurance pre-auth, or patient follow-up sequences. We build those in 2-3 weeks.</p>
<p>2-minute reply or a quick call?</p>`,
    },
    email3: {
      subject: "Last note — {{company}} automation",
      body: `<p>Hi {{first_name}},</p>
<p>I'll keep this short — I reach out to healthcare businesses in Miami because we genuinely get results for them.</p>
<p>If now isn't the right time, totally fine. But if you ever want to see what's possible, the calendar link is always open.</p>
<p><a href="https://calendly.com/ai50m/30min">https://calendly.com/ai50m/30min</a></p>
<p>Take care,</p>`,
    },
  },

  restaurant: {
    email1: {
      subject: "{{company}}: cut 15h/week of manual work — here's how",
      body: `<p>Hi {{first_name}},</p>
<p>Restaurant operations are brutal — ordering, scheduling, customer follow-up, review responses. Most owners spend <strong>15-20 hours/week</strong> on tasks that should be automated.</p>
<p>AI50M builds automation for Miami restaurants. We handle: reservation follow-ups, loyalty messages, supplier ordering, and social media responses — all on autopilot.</p>
<p>Can I show you a 5-minute demo built for {{company}}?</p>
<p><a href="https://calendly.com/ai50m/30min" style="background:#00e5ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">See the Demo →</a></p>`,
    },
    email2: {
      subject: "The automation {{company}} is missing",
      body: `<p>Hi {{first_name}},</p>
<p>Quick follow-up — did my last email land in spam? (It happens with automation talk 😅)</p>
<p>Here's the 1-line pitch: <strong>we save Miami restaurants 15+ hours/week and $2K+/month</strong> by automating the tedious stuff.</p>
<p>15 minutes — that's all it takes to know if it works for you.</p>`,
    },
    email3: {
      subject: "Closing the loop on {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Not going to keep following up — I respect your inbox.</p>
<p>If you ever want to explore AI automation for {{company}}, I'm at rey@ai50m.com or 786-969-3419.</p>
<p>Wish you a great season,</p>`,
    },
  },

  retail: {
    email1: {
      subject: "{{company}}: automate inventory + customer follow-up (saves ~20h/week)",
      body: `<p>Hi {{first_name}},</p>
<p>Retail teams spend enormous time on inventory alerts, abandoned cart follow-ups, and customer service responses. AI50M automates all three.</p>
<p>For {{company}}, I'm thinking: <strong>automated reorder alerts → WhatsApp customer follow-ups → AI response templates</strong>. Setup in 2 weeks.</p>
<p>Quick 15-min call to show you the numbers?</p>
<p><a href="https://calendly.com/ai50m/30min" style="background:#00e5ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Book Call →</a></p>`,
    },
    email2: {
      subject: "One question for {{first_name}} at {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Simple question: <strong>how many hours does your team spend on customer follow-ups weekly?</strong></p>
<p>We've seen retail teams cut that from 10h → 1h with AI automation. Happy to show {{company}} exactly how.</p>`,
    },
    email3: {
      subject: "Last one — {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Last note from me. If the timing's off, no worries at all.</p>
<p>When it makes sense: rey@ai50m.com | 786-969-3419</p>`,
    },
  },

  services: {
    email1: {
      subject: "How {{company}} could close more deals with less manual work",
      body: `<p>Hi {{first_name}},</p>
<p>Service businesses leave money on the table every day — leads that don't get followed up fast enough, proposals that go out late, clients who don't get check-ins.</p>
<p>AI50M builds automation that: <strong>follows up leads in 60 seconds, auto-generates proposals, and sends client check-ins on schedule</strong>. No extra headcount.</p>
<p>{{company}} could be doing this in 2 weeks. Want to see how?</p>
<p><a href="https://calendly.com/ai50m/30min" style="background:#00e5ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">15-Min Call →</a></p>`,
    },
    email2: {
      subject: "{{company}}'s leads — are they being followed up fast enough?",
      body: `<p>Hi {{first_name}},</p>
<p>Studies show leads contacted within 5 minutes are <strong>21x more likely to convert</strong>. Most service businesses respond in hours.</p>
<p>We fix that for {{company}} — automated instant follow-up, personalized to each lead's request. 15 minutes to show you?</p>`,
    },
    email3: {
      subject: "Wrapping up — {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Last note. If there's ever a need for AI automation at {{company}}, I'm here.</p>
<p>rey@ai50m.com | 786-969-3419 | Miami, FL</p>`,
    },
  },

  default: {
    email1: {
      subject: "How {{company}} could save {{hours}} hours/month — AI automation",
      body: `<p>Hi {{first_name}},</p>
<p>I came across {{company}} and wanted to reach out directly.</p>
<p>At AI50M (Miami), we help businesses automate their most time-consuming workflows — our clients typically <strong>save 20-50 hours/month</strong> within the first 30 days.</p>
<p>Worth a 15-min call to see if it applies to {{company}}?</p>
<p><a href="https://calendly.com/ai50m/30min" style="background:#00e5ff;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Book 15-Min Call →</a></p>`,
    },
    email2: {
      subject: "Quick follow-up — {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Following up on my note last week about automation for {{company}}.</p>
<p>If now's not the right time, totally fine — but if you want to see what's possible in 15 minutes, the calendar's open.</p>
<p><a href="https://calendly.com/ai50m/30min">Book a time →</a></p>`,
    },
    email3: {
      subject: "Last note — {{company}}",
      body: `<p>Hi {{first_name}},</p>
<p>Last one from me. If AI automation ever becomes a priority for {{company}}, I'm at rey@ai50m.com.</p>
<p>Best,</p>`,
    },
  },
};

/**
 * Get template for a specific industry and sequence number
 */
export function getTemplate(industry = 'default', sequenceNum = 1, vars = {}) {
  const industryKey = Object.keys(TEMPLATES).find(k =>
    (industry || '').toLowerCase().includes(k)
  ) || 'default';

  const emailKey = `email${sequenceNum}`;
  const template = TEMPLATES[industryKey]?.[emailKey] || TEMPLATES.default[emailKey];

  if (!template) return null;

  // Replace variables
  const replace = (str) => str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || `{{${key}}}`);

  return {
    subject: replace(template.subject),
    body: replace(template.body) + SIGNATURE,
    industry: industryKey,
    sequence: sequenceNum,
  };
}

/**
 * Build a 3-email Smartlead sequence for a lead
 */
export function buildSequence(lead) {
  const vars = {
    first_name: lead.name?.split(' ')[0] || 'there',
    company: lead.company || 'your company',
    hours: lead.hoursPerMonth || 20,
    industry: lead.industry || 'your industry',
  };

  return [
    { ...getTemplate(lead.industry, 1, vars), delayDays: 0 },
    { ...getTemplate(lead.industry, 2, vars), delayDays: 3 },
    { ...getTemplate(lead.industry, 3, vars), delayDays: 7 },
  ];
}

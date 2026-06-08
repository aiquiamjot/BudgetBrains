'use strict';

function buildBudgetHash() {
  const { netPay, splits, subitems } = S.overview;
  const payload = JSON.stringify({ netPay, splits, subitems });
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) + h) ^ payload.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function buildGroqPrompt() {
  const { netPay, splits, subitems } = S.overview;

  const catTotal = cat => subitems
    .filter(i => i.category === cat)
    .reduce((s, i) => s + Number(i.amount || 0), 0);

  const catLines = cat => subitems
    .filter(i => i.category === cat)
    .map(i => `  - ${i.name || 'Unnamed'}: ₱${i.amount}`)
    .join('\n') || '  (no items)';

  const needsAlloc   = (splits.needs   / 100) * netPay;
  const wantsAlloc   = (splits.wants   / 100) * netPay;
  const savingsAlloc = (splits.savings / 100) * netPay;

  const needsTotal   = catTotal('needs');
  const wantsTotal   = catTotal('wants');
  const savingsTotal = catTotal('savings');
  const unallocated  = netPay - needsTotal - wantsTotal - savingsTotal;

  const systemMsg = `You are a personal finance analyst. Analyze the user's monthly budget and return ONLY a valid JSON object — no markdown, no explanation, no code fences. The JSON must have exactly these keys:
{
  "type": "A creative 2-5 word spending personality name (e.g. The Safety-First Saver)",
  "emoji": "One emoji that represents this personality",
  "description": "2-3 sentences assessing their spending habits, strengths, and areas to watch",
  "tips": ["Tip 1 (specific and actionable)", "Tip 2", "Tip 3"],
  "score": <integer 0-100 representing overall budget health>
}
Score rubric: 90-100 excellent, 70-89 good, 50-69 fair, below 50 needs work. Base score on savings rate, needs/wants balance, and whether allocations are fully used.`;

  const userMsg = `Monthly budget data:
Net monthly pay: ₱${netPay}
Allocation splits: Needs ${splits.needs}% | Wants ${splits.wants}% | Savings ${splits.savings}%

Needs allocated: ₱${needsAlloc.toFixed(2)}, actual spent: ₱${needsTotal.toFixed(2)}
${catLines('needs')}

Wants allocated: ₱${wantsAlloc.toFixed(2)}, actual spent: ₱${wantsTotal.toFixed(2)}
${catLines('wants')}

Savings allocated: ₱${savingsAlloc.toFixed(2)}, actual saved: ₱${savingsTotal.toFixed(2)}
${catLines('savings')}

Unallocated remainder: ₱${unallocated.toFixed(2)}`;

  return [
    { role: 'system', content: systemMsg },
    { role: 'user',   content: userMsg   },
  ];
}

async function callGroqAPI(apiKey) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: buildGroqPrompt(),
      temperature: 0.7,
      max_tokens: 512,
      response_format: { type: 'json_object' },
    }),
  });

  if (!resp.ok) {
    if (resp.status === 401) throw new Error('Invalid API key. Check your Groq key and try again.');
    if (resp.status === 429) throw new Error('Rate limit reached. Wait a moment and try again.');
    throw new Error(`Groq API error ${resp.status}. Try again.`);
  }

  const data = await resp.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error('Empty response from Groq. Try again.');

  let profile;
  try { profile = JSON.parse(raw); } catch {
    throw new Error('Could not parse Groq response. Try again.');
  }

  for (const k of ['type', 'emoji', 'description', 'tips', 'score']) {
    if (profile[k] === undefined) throw new Error(`Groq returned incomplete data (missing "${k}"). Try again.`);
  }
  if (!Array.isArray(profile.tips)) throw new Error('Groq returned malformed tips. Try again.');
  profile.score = Math.min(100, Math.max(0, Math.round(Number(profile.score) || 0)));

  return profile;
}

async function analyzePersonality() {
  if (!S.groqKey) { renderPersonalityPanel(); return; }

  renderPersonalityLoading();

  try {
    const result = await callGroqAPI(S.groqKey);
    S.groqProfile = {
      result,
      budgetHash: buildBudgetHash(),
      savedAt: new Date().toISOString(),
    };
    save('groqProfile');
    renderPersonalityResult();
  } catch (err) {
    renderPersonalityError(err.message);
  }
}

// Netlify function: POST /api/chat  (all server code in one file)
// Coach instructions sent to the AI as the system prompt.
export const SYSTEM_PROMPT = `# TCF Canada Task 3 – Correction Coach

You are a strict but encouraging French coach for a student preparing TCF Canada Expression orale, Task 3: presenting and defending her opinion on a current or social issue. Her prepared answer should last about 3 minutes; the examiner's questions fill the rest of the time. Her level is A2, aiming for B1. She writes her answer, corrects it with you, then learns it by heart and presents it in class without reading.

## Step 1 – The student sends her answer
She gives the topic, then writes her full answer herself. If she sends only the topic, ask her to write her full answer first. Never write any part of the answer for her.

## Step 2 – Task check (before any grammar)
Her messages may end with a line starting "[Automatic check". The app adds it; the student did not write it and cannot see it. It gives the exact word count and the connectors found. Always use these numbers. Never count words yourself and never mention the automatic check by that name.

Check three things and show them as a short checklist with ✅ or ❌:

1. **Length:** at least 300 words (about 3 minutes spoken at a learner's pace, roughly 100 words per minute). Show her word count and the estimated speaking time (words ÷ 100, in minutes).
2. **Connectors:** at least 5 different connectors (for example: d'abord, ensuite, de plus, par exemple, cependant, pourtant, en revanche, par contre, c'est pourquoi, donc, parce que, en effet, d'un côté / d'un autre côté, pour conclure, en conclusion). List the ones she used.
3. **Structure:** she must present AND defend a clear personal opinion on the topic. Check these 7 parts:
   1. Introduction (40–50 words): presents the topic and the two opinions people have, linked by a contrast connector (cependant / en revanche / pourtant / par contre).
   2. My opinion (15–25 words): a clear position, e.g. "À mon avis, …".
   3. Argument 1 (50–70 words): idea + reason + example.
   4. Argument 2 (50–70 words): idea + reason + example.
   5. Problem / other side (40–50 words): a real counter-argument, introduced by a contrast connector.
   6. Solution (30–40 words): what could be done about this problem.
   7. Conclusion (20–30 words): "Pour conclure / En conclusion, …" and her opinion again.

If anything is ❌, explain briefly in simple English what is missing or too short, and which parts to develop. You may name connectors she could use, but do not write her sentences. Ask her to complete her answer and send the FULL new version. Do not start grammar yet.
If she has already sent 2 complete versions and something is still ❌, say so in one line and move on to Step 3 anyway.

## Step 3 – Grammar correction
Check ONLY these four error types. Ignore everything else, including accents, spelling and punctuation:
- [V] Verb conjugation / tense: e.g. "le sport jouer" instead of "le sport joue".
- [∅] Missing verb: a sentence or clause with no conjugated verb.
- [P] Preposition: e.g. "participer dans", "aider à les enfants", "par conclure".
- [M] Wrong word / English word: e.g. "online", "subjects", "team", "bénéfices" for "avantages".

While she is correcting, do NOT rewrite her text and do NOT give the correct answer for her sentence.

She is an A2 learner. Explain every error the way a kind, patient teacher would explain it to a high-school student who is learning French for the first time. Assume she does not know grammar words: if you use one (verb, subject, conjugate, infinitive, preposition, masculine/feminine), explain it in a few plain words the first time.

For each error, use this layout:

**Error 1 [code] – short name of the problem** (e.g. "The verb is not conjugated")
- **Your sentence:** quote her sentence and show the wrong part in bold.
- **What's wrong:** 1–2 simple sentences saying exactly which word is the problem and why it is wrong.
- **The rule:** explain the rule step by step in simple English, as if teaching it for the first time. Say why French works this way when it helps.
- **Example with different words:** give 1–2 short, everyday French examples that use the same rule but DIFFERENT words from her sentence, each with the English meaning. Show the wrong form and the right form side by side (❌ … / ✅ …) so she sees the difference.
- **Memory tip:** one short trick to remember the rule (a pattern, a comparison with English or Hindi, or a question to ask herself).
- **Your turn:** ask her to rewrite her sentence herself.

Keep each sentence short and friendly, but do not skip any part of the explanation. The goal is that she understands the rule well enough to fix the mistake alone and not repeat it.
Handle at most 3 errors at a time, then continue with the next ones.

When she sends a corrected sentence:
- If it is correct, tell her clearly and say in one sentence WHY it is now correct (which rule she applied), then move on.
- If it is still wrong, explain again in a different, even simpler way, with a new example, and ask again.
- After 3 unsuccessful attempts on the same error, move on; it will be fixed in the final version.

## Step 4 – Ideas
About once per text, or whenever an idea is unclear or off-topic, ask her to explain that idea in English. Tell her honestly whether it answers the topic and whether it has a reason and an example. If an idea is irrelevant or weak, say why in one or two sentences and ask her to find a better one. Do not supply ideas yourself.

## Step 5 – Final result
When she has gone through all the errors, finish with:
- **Task check:** the final checklist (length with word count and minutes, connectors, the 7 parts).
- **Her 3 most frequent error types** in this text, with one example of each.
- **Her corrected version:** the full text with every remaining error fixed. Keep her own words, ideas, structure and length as much as possible; change only what is needed to make it correct. B1 level at most, short clear sentences she can say aloud and remember. Do not add new ideas or impressive vocabulary.
- After the text, list in one short line each the sentences you fixed that she could not correct herself.
- Remind her: learn this version by heart and practise saying it aloud without reading, in about 3 minutes.

## Style rules
- Use simple English for explanations and simple French for examples. Short sentences, but complete explanations: never just name the error without teaching the rule.
- Be encouraging, but do not praise mistakes and do not lower the standard.
- Never give the corrected version before she has worked through the task check and the errors herself, even if she asks. Tell her it comes at the end.
`;

// Uses your own GEMINI_API_KEY (Google free tier) if set, otherwise Netlify's AI Gateway.

const MAX_MESSAGES = 60;        // keep the conversation a reasonable size
const MAX_CHARS = 8000;         // per message


// ---- automatic task check: exact word count and connectors (added to the student's message) ----
const CONNECTORS = [
  "tout d'abord", "d'abord", "premièrement", "deuxièmement", "ensuite", "puis", "de plus", "en plus", "en outre",
  "par ailleurs", "enfin", "cependant", "pourtant", "en revanche", "par contre", "néanmoins", "toutefois",
  "d'un côté", "d'un autre côté", "de l'autre côté", "d'une part", "d'autre part",
  "c'est pourquoi", "par conséquent", "donc", "ainsi", "parce que", "car", "puisque", "grâce à", "à cause de",
  "en effet", "par exemple", "notamment", "alors que", "tandis que", "même si", "bien que",
  "pour conclure", "en conclusion", "finalement", "bref", "pour finir"
];
export function analyse(text) {
  const m = text.match(/ma\s+réponse\s*:([\s\S]*)/i);
  const answer = (m ? m[1] : text).replace(/[’`]/g, "'");
  const words = (answer.match(/[A-Za-zÀ-ÿ0-9]+(?:['-][A-Za-zÀ-ÿ0-9]+)*/g) || []).length;
  const lower = " " + answer.toLowerCase().replace(/\s+/g, " ") + " ";
  const found = [];
  let rest = lower;
  for (const c of [...CONNECTORS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp("(^|[^a-zà-ÿ'])" + c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=[^a-zà-ÿ]|$)", "g");
    if (re.test(rest)) { found.push(c); rest = rest.replace(re, "$1 "); }
  }
  return { words, found };
}

async function runCoach(body, passwordHeader) {
  const requiredPassword = process.env.APP_PASSWORD;
  if (requiredPassword && passwordHeader !== requiredPassword) {
    return { status: 401, data: { error: "Wrong or missing password." } };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { status: 500, data: { error: "Server is missing GEMINI_API_KEY." } };
  }

  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) {
    return { status: 400, data: { error: "No messages sent." } };
  }

  const clean = messages
    .slice(-MAX_MESSAGES)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // The conversation must start and end with a student message.
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return { status: 400, data: { error: "The last message must come from the student." } };
  }

  // Add the automatic check to the latest message when it looks like a full answer.
  const last = clean[clean.length - 1];
  const { words, found } = analyse(last.content);
  if (words >= 60) {
    last.content += `\n\n[Automatic check – added by the app, not written by the student: word count = ${words} (≈ ${(words / 100).toFixed(1)} min spoken); connectors found = ${found.length}${found.length ? " (" + found.join(", ") + ")" : ""}.]`;
  }

  // On Netlify, the AI Gateway provides GOOGLE_GEMINI_BASE_URL together with its own GEMINI_API_KEY.
  // If you set your own GEMINI_API_KEY, Netlify leaves both alone and requests go straight to Google.
  const gateway = !!process.env.GOOGLE_GEMINI_BASE_URL;
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");

  // The first model is tried first. When Google says a model is busy (or unavailable),
  // the next one is tried automatically, so the student rarely sees a "high demand" error.
  const preferred = process.env.GEMINI_MODEL || (gateway ? "gemini-3.8-flash" : "gemini-flash-lite-latest");
  const backups = gateway
    ? ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
    : ["gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
  const models = [preferred, ...backups.filter(m => m !== preferred)];

  const contents = clean.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // One model, with short "thinking" so the reply arrives before Netlify's time limit.
  // Newer models use thinkingLevel, older ones thinkingBudget; if one is rejected, try the next.
  async function ask(model) {
    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let r;
    for (const thinking of [{ thinkingLevel: "low" }, { thinkingBudget: 0 }, null]) {
      const generationConfig = { maxOutputTokens: 6000, temperature: 0.4 };
      if (thinking) generationConfig.thinkingConfig = thinking;
      r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents, generationConfig }),
      });
      if (r.status !== 400) break;
      const err = await r.clone().json().catch(() => ({}));
      if (!/think/i.test(err?.error?.message || "")) break;
    }
    return r;
  }

  const startedAt = Date.now();
  let res, data = {};
  for (const model of models) {
    if (Date.now() - startedAt > 18000) break;          // stay inside Netlify's time limit
    try { res = await ask(model); } catch (e) { continue; }
    data = await res.json().catch(() => ({}));
    if (res.ok) break;
    const busy = [429, 500, 503, 504].includes(res.status) || res.status === 404 ||
      /high demand|overloaded|unavailable|not found/i.test(data?.error?.message || "");
    if (!busy) break;                                   // a real error (e.g. bad key): stop and report it
    await new Promise(r => setTimeout(r, 800));
  }

  if (!res) {
    return { status: 503, data: { error: "The coach is very busy right now. Please wait a minute and press Send again." } };
  }
  if (!res.ok) {
    if ([429, 500, 503, 504].includes(res.status) || /high demand|overloaded|unavailable/i.test(data?.error?.message || "")) {
      return { status: 503, data: { error: "The coach is very busy right now. Please wait a minute and press Send again." } };
    }
    const msg = data?.error?.message || `Gemini API error (${res.status}).`;
    return { status: 502, data: { error: msg } };
  }

  const reply = (data.candidates?.[0]?.content?.parts || [])
    .filter(p => typeof p.text === "string" && !p.thought)
    .map(p => p.text)
    .join("")
    .trim();

  if (!reply) {
    return { status: 502, data: { error: "The coach gave an empty answer. Please press Send again." } };
  }
  return { status: 200, data: { reply } };
}

export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Use POST." }, { status: 405 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { status, data } = await runCoach(body, req.headers.get("x-app-password"));
    return Response.json(data, { status });
  } catch (err) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config = { path: "/api/chat" };

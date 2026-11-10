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

While she is correcting, do NOT rewrite her text and do NOT give the correct answer. For each error:
- Quote her sentence and mark the error with its code.
- Say what kind of problem it is in one short line of simple English.
- You may give a hint (the rule, a question, or a similar example with different words), but not the correct form for her sentence.
- Ask her to reformulate the sentence herself.
- Handle at most 3 errors at a time, then continue with the next ones.

When she sends a corrected sentence: if it is correct, say so briefly and move on. If it is still wrong, give a stronger hint and ask again. After 3 unsuccessful attempts on the same error, move on; it will be fixed in the final version.

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
- Use simple English for explanations and simple French for examples. Be short and direct.
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
function analyse(text) {
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

  const model = process.env.GEMINI_MODEL || (process.env.GOOGLE_GEMINI_BASE_URL ? "gemini-3.8-flash" : "gemini-flash-latest");
  // On Netlify, the AI Gateway provides GOOGLE_GEMINI_BASE_URL together with its own GEMINI_API_KEY.
  // If you set your own GEMINI_API_KEY, Netlify leaves both alone and requests go straight to Google.
  const base = (process.env.GOOGLE_GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  // Keep the model's "thinking" short so the reply arrives before Netlify's time limit.
  // Newer models use thinkingLevel, older ones thinkingBudget; if one is rejected, try the next.
  const thinkingOptions = [{ thinkingLevel: "low" }, { thinkingBudget: 0 }, null];
  let res;
  for (const thinking of thinkingOptions) {
    const generationConfig = { maxOutputTokens: 4096, temperature: 0.4 };
    if (thinking) generationConfig.thinkingConfig = thinking;
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: clean.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig,
      }),
    });
    if (res.status !== 400) break;
    const err = await res.clone().json().catch(() => ({}));
    if (!/think/i.test(err?.error?.message || "")) break;
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 429) {
    return { status: 429, data: { error: "The free limit was reached for now. Wait a minute and press Send again (or try again tomorrow if it keeps happening)." } };
  }
  if (!res.ok) {
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

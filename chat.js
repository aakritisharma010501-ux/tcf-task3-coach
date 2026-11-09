// Netlify function: POST /api/chat  (all server code in one file)
// Coach instructions sent to the AI as the system prompt.
export const SYSTEM_PROMPT = `# TCF Canada Task 3 – Correction Coach

You are a strict but encouraging French writing coach for a student preparing TCF Canada Expression orale, Task 3 (giving and defending an opinion). Her level is A2, aiming for B1. She will learn her final answer by heart and present it in class without reading.

## How a session works

1. The student gives the topic, then writes her full answer herself. If she sends only the topic, ask her to write her answer first. Do not write any part of the answer for her.

2. Check ONLY these four error types. Ignore everything else, including accents, spelling and punctuation:
   - [V] Verb conjugation / tense: e.g. "le sport jouer" instead of "le sport joue".
   - [∅] Missing verb: a sentence or clause with no conjugated verb.
   - [P] Preposition: e.g. "participer dans", "aider à les enfants", "par conclure".
   - [M] Wrong word / English word: e.g. "online", "subjects", "team", "bénéfices" for "avantages".

3. While she is correcting, do NOT rewrite her text and do NOT give the correct answer. For each error:
   - Quote her sentence and mark the error with its code.
   - Say what kind of problem it is in one short line of simple English.
   - You may give a hint (the rule, a question, or a similar example with different words), but not the correct form for her sentence.
   - Ask her to reformulate the sentence herself.
   - Handle at most 3 errors at a time so she is not overwhelmed, then continue with the next ones.

4. When she sends a corrected sentence:
   - If it is correct, say so briefly and move on.
   - If it is still wrong, give a stronger hint and ask again.
   - After 3 unsuccessful attempts on the same error, move on. It will be fixed in the final corrected version.

5. Check her ideas. About once per text, or whenever an idea is unclear or seems off-topic, ask her to explain that idea in English. Then tell her honestly whether the idea answers the topic, and whether it has a reason and an example (every idea needs claim + reason + example). If an idea is irrelevant or weak, say why in one or two sentences and ask her to find a better one. Do not supply ideas yourself.

6. When she has gone through all the errors, finish with:
   - **Her 3 most frequent error types** in this text, with one example of each.
   - **Her corrected version**: the full text with every remaining error fixed. Rules for this version:
     - Keep her own words, ideas and sentence order as much as possible. Change only what is needed to make it correct.
     - Keep it at B1 level at most, with short, clear sentences she can say aloud and remember. Do not add new ideas or impressive vocabulary.
     - After the text, list in one short line each the sentences you fixed that she could not correct herself, so she knows what to pay attention to.
   - Remind her: learn this version by heart and practise saying it aloud without reading.

## Style rules

- Use simple English for explanations and simple French for examples. Be short and direct.
- Be encouraging, but do not praise mistakes and do not lower the standard.
- Never give the corrected version before she has worked through the errors herself, even if she asks. Tell her it comes at the end.
`;

// Uses your own GEMINI_API_KEY (Google free tier) if set, otherwise Netlify's AI Gateway.

const MAX_MESSAGES = 60;        // keep the conversation a reasonable size
const MAX_CHARS = 8000;         // per message

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

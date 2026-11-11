// Netlify Edge Function: POST /api/coach
// Streams the coach's reply as Gemini writes it, so long explanations are never cut off
// by the 30-second limit of normal functions. The coach instructions live in ../../chat.js.
import { SYSTEM_PROMPT, analyse } from "../../chat.js";

const BUSY = "The coach is very busy right now. Please wait a minute and press Send again.";
const MAX_MESSAGES = 60;
const MAX_CHARS = 8000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
  const env = k => Netlify.env.get(k);

  const pw = env("APP_PASSWORD");
  if (pw && req.headers.get("x-app-password") !== pw) {
    return Response.json({ error: "Wrong or missing password." }, { status: 401 });
  }
  const apiKey = env("GEMINI_API_KEY");
  if (!apiKey) return Response.json({ error: "Server is missing GEMINI_API_KEY." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const clean = messages
    .slice(-MAX_MESSAGES)
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return Response.json({ error: "The last message must come from the student." }, { status: 400 });
  }

  // Exact word count and connectors, added to the latest message for the coach (the student never sees it).
  const last = clean[clean.length - 1];
  const { words, found } = analyse(last.content);
  if (words >= 60) {
    last.content += `\n\n[Automatic check – added by the app, not written by the student: word count = ${words} (≈ ${(words / 100).toFixed(1)} min spoken); connectors found = ${found.length}${found.length ? " (" + found.join(", ") + ")" : ""}.]`;
  }

  const gateway = !!env("GOOGLE_GEMINI_BASE_URL");
  const base = (env("GOOGLE_GEMINI_BASE_URL") || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
  const preferred = env("GEMINI_MODEL") || (gateway ? "gemini-3.8-flash" : "gemini-flash-lite-latest");
  const backups = gateway
    ? ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
    : ["gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.5-flash"];
  const models = [preferred, ...backups.filter(m => m !== preferred)];
  const contents = clean.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

  // Open a streaming request to one model; newer models use thinkingLevel, older ones thinkingBudget.
  async function open(model) {
    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
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

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = t => controller.enqueue(enc.encode(t));
      let lastErr = BUSY;
      for (const model of models) {
        let res;
        try { res = await open(model); } catch (e) { continue; }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const msg = data?.error?.message || `Gemini API error (${res.status}).`;
          const busy = [404, 429, 500, 503, 504].includes(res.status) || /high demand|overloaded|unavailable|not found/i.test(msg);
          if (busy) { await sleep(500); continue; }
          send("[[ERROR]]" + msg); controller.close(); return;   // a real error, e.g. a bad key
        }
        // Read Gemini's server-sent events and pass the text on as it arrives.
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "", got = false;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) { if (buf.trim()) send("\n\n[[LEFTOVER]]" + buf.length); break; }
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, i).trim();
              buf = buf.slice(i + 1);
              if (!line.startsWith("data:")) continue;
              let obj;
              try { obj = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
              for (const p of obj.candidates?.[0]?.content?.parts || []) {
                if (typeof p.text === "string" && !p.thought && p.text) { send(p.text); got = true; }
              }
            }
          }
        } catch (e) {
          send("\n\n[[STREAMERR]]" + (e && (e.name + ": " + e.message))); controller.close(); return;
        }
        if (got) { controller.close(); return; }
        lastErr = "The coach gave an empty answer. Please press Send again.";
      }
      send("[[ERROR]]" + lastErr);
      controller.close();
    },
  });

  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
};

export const config = { path: "/api/coach" };

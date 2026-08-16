// Vercel serverless function — this is what makes AI auto-fill work without
// ever putting your Anthropic API key in the browser. Deploy this project to
// Vercel, set ANTHROPIC_API_KEY as an environment variable in the Vercel
// dashboard (never in client code, never with a VITE_ / NEXT_PUBLIC_ prefix,
// which would ship it to every visitor), and this route becomes live at
// /api/ai/extract-resume automatically — no extra config needed.
//
// NOT wired up by default. The frontend already points at this URL and
// fails gracefully if it 404s (see runAutoFill in App.jsx) — deploying the
// static site alone gives you a fully working resume builder minus AI
// import. Add this file + the env var whenever you're ready for that
// feature; nothing else needs to change.

// --- Minimal in-memory rate limiter -----------------------------------
// Good enough for a single-region MVP on Vercel's default runtime. It
// resets whenever the function cold-starts and won't be consistent across
// multiple concurrent instances under real load — that's a known,
// deliberate limitation, not an oversight. If this endpoint gets popular
// enough for that to matter, swap this for a shared store (e.g. Upstash
// Redis) using the same interface (checkRateLimit(ip) -> boolean).
const requestLog = new Map(); // ip -> array of timestamps (ms)
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;

function checkRateLimit(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    requestLog.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return true;
}

// --- Request validation --------------------------------------------------
const MAX_TEXT_CHARS = 12000;
const MAX_PDF_BASE64_CHARS = 12_000_000; // ~9MB decoded, matches the frontend's 8MB original-file cap plus base64 overhead

function validateContent(content) {
  if (typeof content === "string") {
    if (content.length === 0) return "Content is empty.";
    if (content.length > MAX_TEXT_CHARS + 2000) return "Content is too long."; // + slack for the wrapping prompt text
    return null;
  }
  if (Array.isArray(content)) {
    const doc = content.find((b) => b && b.type === "document");
    if (doc) {
      if (doc.source?.media_type !== "application/pdf") return "Only PDF documents are supported.";
      if (typeof doc.source?.data !== "string" || doc.source.data.length === 0) return "Missing document data.";
      if (doc.source.data.length > MAX_PDF_BASE64_CHARS) return "PDF is too large.";
    }
    return null;
  }
  return "Unrecognized content shape.";
}

// --- Output validation -----------------------------------------------------
// Never trust JSON.parse(modelOutput) blindly — this checks the parsed
// result actually has the shape the frontend expects before it's returned,
// so a malformed or unexpected model response can't silently corrupt a
// user's resume or crash the client.
function validateExtractedResume(obj) {
  if (!obj || typeof obj !== "object") return null;
  const str = (v) => (typeof v === "string" ? v : "");
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    name: str(obj.name), title: str(obj.title), email: str(obj.email),
    phone: str(obj.phone), location: str(obj.location), link: str(obj.link),
    summary: str(obj.summary), skills: str(obj.skills),
    experience: arr(obj.experience).slice(0, 20).map((e) => ({
      role: str(e?.role), org: str(e?.org), start: str(e?.start), end: str(e?.end), desc: str(e?.desc),
    })),
    education: arr(obj.education).slice(0, 10).map((e) => ({
      school: str(e?.school), degree: str(e?.degree), year: str(e?.year),
    })),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests — please wait a minute and try again." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Deliberately vague to the client — never reveal server configuration
    // details, even ones as seemingly harmless as "which env var is unset."
    console.error("ANTHROPIC_API_KEY is not configured");
    res.status(503).json({ error: "AI import isn't available right now." });
    return;
  }

  const { content } = req.body || {};
  const validationError = validateContent(content);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const EXTRACTION_SCHEMA = `{
  "name": "", "title": "", "email": "", "phone": "", "location": "", "link": "",
  "summary": "",
  "skills": "comma, separated, list",
  "experience": [{"role": "", "org": "", "start": "", "end": "", "desc": ""}],
  "education": [{"school": "", "degree": "", "year": ""}]
}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error("Anthropic API error", response.status, await response.text().catch(() => ""));
      res.status(502).json({ error: "The AI service didn't respond as expected. Please try again." });
      return;
    }

    const result = await response.json();
    const raw = (result.content || []).map((c) => c.text || "").join("").trim();
    const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: "Couldn't read the extracted resume data. Please try again or paste the text manually." });
      return;
    }

    const validated = validateExtractedResume(parsed);
    if (!validated) {
      res.status(502).json({ error: "The extracted data wasn't in the expected format. Please try again." });
      return;
    }

    res.status(200).json(validated);
  } catch (e) {
    if (e.name === "AbortError") {
      res.status(504).json({ error: "That took too long. Please try again with a shorter document." });
      return;
    }
    console.error("extract-resume handler error", e);
    res.status(500).json({ error: "Something went wrong processing that. Your resume hasn't been changed." });
  }
}

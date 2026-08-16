# Resume Builder Pro

A free resume/CV builder — multiple templates, PDF export, US Letter & A4,
optional AI-assisted import, no account required. Everything is stored in
the visitor's own browser (IndexedDB) — there is no database and, in its
default configuration, no backend at all.

This document assumes no prior deployment experience.

---

## What's actually running here

- **The app itself** (`src/`) is a static site: plain HTML/CSS/JS after
  it's built, no server required to serve it.
- **AI auto-fill is off by default** in this v1. The button is there, but
  until you deploy the optional backend (see below), clicking it shows a
  friendly "couldn't process that" message instead of working — it does
  **not** crash the app.
- **Ads are off by default** (`VITE_ADS_ENABLED=false`), showing a dashed
  placeholder box instead, so the layout doesn't jump once you turn them on.

---

## 1. Run it locally

You need [Node.js](https://nodejs.org) installed (any recent version, 18+).

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`). Changes to the
code appear instantly.

---

## 2. Deploy it for real (Vercel, free tier)

Vercel is the simplest option here: connect a GitHub repo, it builds and
deploys automatically, HTTPS is automatic, and custom domains are a few
clicks.

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), sign up (free), click **Add New
   → Project**, and select your repository.
3. Vercel auto-detects Vite — leave the default build settings as-is
   (`npm run build`, output directory `dist`).
4. Click **Deploy**. In a minute or two you'll have a live URL like
   `resume-builder-pro.vercel.app`.

That's it — the resume builder itself (everything except AI import) is now
live and fully working, for free.

### Connecting your own domain

In the Vercel project dashboard: **Settings → Domains → Add**, type your
domain (e.g. `myresumesite.com`), and Vercel shows you exactly which DNS
records to add at your domain registrar (usually one or two records).
HTTPS is issued and renewed automatically once DNS propagates — no
certificate management needed on your end.

---

## 3. Adding AI auto-fill (optional, do this later)

This requires the one file in `api/ai/extract-resume.js`, which is already
written and included — Vercel automatically turns anything in `api/` into a
live serverless endpoint, no extra setup required beyond one environment
variable.

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. In your Vercel project: **Settings → Environment Variables**, add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key
   - **Do not** prefix it with `VITE_` — that would expose it to every
     visitor's browser, which is exactly what this whole architecture
     exists to avoid.
3. Redeploy (Vercel does this automatically on the next push, or click
   **Redeploy** in the dashboard).

The backend already includes rate limiting (5 requests/minute/IP), request
size limits, and validates the AI's response before ever returning it to
the browser — see the comments in that file for specifics. Its core logic
(rate limiting, input/output validation) has automated tests passing; the
actual live call to Anthropic has not been tested end-to-end since building
this, since that requires a real key and network access neither of which
were available while building it — test it yourself with a real resume
before relying on it.

---

## 4. Adding ads (AdSense)

1. Apply at [google.com/adsense](https://www.google.com/adsense) with your
   live domain. Approval typically needs some real content/traffic first —
   this won't happen on day one.
2. Once approved, add to `index.html`'s `<head>`, replacing `ca-pub-XXXX`
   with your real publisher ID:
   ```html
   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX" crossorigin="anonymous"></script>
   ```
3. Set these environment variables (in Vercel, and in `.env.local` if
   testing ads locally):
   ```
   VITE_ADS_ENABLED=true
   VITE_ADSENSE_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
   ```
4. Redeploy. The three `<AdSlot>` placements (above the editor, below the
   resume preview, and a sidebar footer slot) now request real ads instead
   of showing placeholders.

The app is designed so ads can never break it: if the AdSense script fails
to load, is blocked, or errors, `AdSlot` just renders nothing in that spot
— the rest of the page is completely unaffected either way.

---

## 5. Privacy policy & terms

Not included as finished legal text — writing your actual privacy policy
isn't something to take from a template verbatim, especially once AdSense
is involved (Google requires you to disclose its data use specifically).
What to cover, based on what this app actually does:

- Resume data is stored only in the visitor's browser (IndexedDB) — not
  sent to any server unless they use AI auto-fill.
- AI auto-fill sends the pasted/uploaded resume text to Anthropic's API via
  your backend, for the sole purpose of extracting structured fields — not
  stored server-side beyond that request.
- If/when ads are enabled: Google AdSense uses cookies/identifiers for ad
  personalization — link to
  [Google's own disclosure](https://policies.google.com/technologies/partner-sites),
  which is what AdSense's terms require you to do.
- A short note on how to delete their data — which is just the "Delete all
  local data" button already in the app, since there's no server-side copy
  to also worry about.

A generator like [Termly](https://termly.io) or
[GetTerms](https://getterms.io) can turn the above into an actual policy
page quickly once you know what to declare.

---

## What's genuinely tested vs. what isn't

**Tested, with real automated tests, in a real browser:**
- The IndexedDB storage module — get/set/delete/list, data export/import,
  clear-all, and (this is the one that matters) **data surviving a real
  page reload**, verified two ways: through the app, and by reading
  IndexedDB directly.
- The full app running against that real storage (not a mock) — resume
  creation, editing, autosave, all previously-verified features.
- AI auto-fill failing gracefully when the backend doesn't exist (the
  default state of this deploy).
- The backend function's validation and rate-limiting logic, tested in
  isolation.

**Not tested (couldn't be, in this environment):**
- The backend's actual live call to Anthropic's API — needs a real key and
  network access. Test this yourself with a real resume once it's deployed
  with a key configured, before considering AI import production-ready.
- AdSense integration itself — needs a real approved account and their
  script, neither available while building this.

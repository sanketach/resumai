import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Download, User, Briefcase, GraduationCap, Sparkles, Mail, Phone, MapPin, Link as LinkIcon, FileText, Check, Loader2, LayoutTemplate, ImagePlus, X, UploadCloud, Wand2, Type, Palette, Lock } from "lucide-react";
import mammoth from "mammoth";
import { storage } from "./lib/storage.js";
import AdSlot from "./AdSlot.jsx";

const ACCENTS = [
  { name: "Sunset", from: "#FF5A36", to: "#FFB199" },
  { name: "Ink", from: "#1F2937", to: "#6B7685" },
  { name: "Moss", from: "#2F7A4F", to: "#8FE3A8" },
  { name: "Cobalt", from: "#2A4B8D", to: "#5EA8FF" },
  { name: "Plum", from: "#7A3F8D", to: "#D48DFF" },
  { name: "Amber", from: "#B8791A", to: "#FFCB61" },
];

const FONTS = [
  { id: "georgia", name: "Georgia", css: "Georgia, 'Times New Roman', serif" },
  { id: "times", name: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { id: "garamond", name: "Garamond", css: "Garamond, 'EB Garamond', serif" },
  { id: "playfair", name: "Playfair Display", css: "'Playfair Display', Georgia, serif" },
  { id: "helvetica", name: "Helvetica", css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "calibri", name: "Calibri", css: "Calibri, Candara, Segoe, 'Segoe UI', sans-serif" },
  { id: "poppins", name: "Poppins", css: "'Poppins', Helvetica, sans-serif" },
  { id: "montserrat", name: "Montserrat", css: "'Montserrat', Helvetica, sans-serif" },
  { id: "lato", name: "Lato", css: "'Lato', Helvetica, sans-serif" },
];

const TEMPLATES = [
  { id: "editorial", name: "Editorial", headerAlign: "left", ruleWeight: 3, sidebarAccent: false, layout: "flow", columns: 1 },
  { id: "minimal", name: "Minimal", headerAlign: "left", ruleWeight: 1, sidebarAccent: false, layout: "flow", columns: 1 },
  { id: "bold", name: "Bold", headerAlign: "center", ruleWeight: 0, sidebarAccent: false, layout: "flow", columns: 1 },
  { id: "classic", name: "Classic", headerAlign: "center", ruleWeight: 1, sidebarAccent: false, layout: "flow", columns: 1 },
  { id: "modern", name: "Modern", headerAlign: "left", ruleWeight: 0, sidebarAccent: true, layout: "flow", columns: 1 },
  { id: "sidebar", name: "Sidebar", headerAlign: "left", ruleWeight: 0, sidebarAccent: false, layout: "sidebar", columns: 2 },
  { id: "navy", name: "Navy Split", headerAlign: "left", ruleWeight: 0, sidebarAccent: false, layout: "navy", columns: 2 },
  // Modeled after the dense, education-first CS/engineering student resume
  // format — leads with Education (not Experience), and is the one template
  // that surfaces Projects/Certifications/Extracurricular directly.
  { id: "student", name: "Student", headerAlign: "center", ruleWeight: 0, sidebarAccent: false, layout: "student", columns: 1 },
];

// The two page sizes that cover the overwhelming majority of real-world resume
// use: US Letter (US, Canada, parts of Latin America) and A4 (everywhere else
// — Europe, UK, most of Asia, Africa, Australia). Legal/other sizes aren't
// meaningfully used for resumes, so intentionally not offered here.
const PAGE_SIZES = {
  letter: { id: "letter", name: "US Letter", width: "8.5in", height: "11in", cssSize: "letter" },
  a4: { id: "a4", name: "A4", width: "210mm", height: "297mm", cssSize: "A4" },
};

const emptyExp = () => ({ id: crypto.randomUUID(), role: "", org: "", start: "", end: "", desc: "" });
const emptyEdu = () => ({ id: crypto.randomUUID(), school: "", degree: "", year: "" });
const emptyProject = () => ({ id: crypto.randomUUID(), name: "", stack: "", link: "", desc: "" });
const emptyCert = () => ({ id: crypto.randomUUID(), name: "", issuer: "", link: "" });
const emptyExtra = () => ({ id: crypto.randomUUID(), org: "", role: "", start: "", end: "", location: "", desc: "", link: "" });

// Turns free-typed link text into a safe href — used for the header
// portfolio/LinkedIn link and every Project/Certification/Extracurricular
// link. Rejects any explicit scheme other than http/https (blocks
// javascript:, data:, vbscript:, etc. before it ever reaches an href) and
// auto-prepends https:// to bare domains so "linkedin.com/in/x" works
// without the user having to type the protocol.
const safeUrl = (raw) => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const blankResume = () => ({
  name: "", title: "", email: "", phone: "", location: "", link: "", photo: null,
  summary: "", skills: "", experience: [emptyExp()], education: [emptyEdu()],
  achievements: "", languages: "", interests: "",
  projects: [], certifications: [], extracurricular: [],
  declaration: { enabled: false, text: "I hereby declare that the information provided above is true and correct to the best of my knowledge and belief.", place: "", date: "" },
  accent: ACCENTS[0].from, template: "editorial", font: "georgia", pageSize: "letter",
});

const FIELD_WEIGHTS = ["name", "title", "email", "phone", "location", "link", "summary", "skills", "achievements", "languages", "interests"];

export default function ResumeBuilderPro() {
  const [index, setIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [data, setData] = useState(blankResume());
  const [status, setStatus] = useState("loading");
  const saveTimer = useRef(null);
  // Data changes caused by loading/switching resumes shouldn't schedule a
  // redundant "save it right back" autosave — only genuine edits should.
  const skipNextAutosave = useRef(false);
  // Tracks the save that is currently debounced/in-flight so it can be
  // flushed immediately (instead of silently cancelled) when the user
  // navigates away before the 600ms debounce fires.
  const pendingSave = useRef(null);

  const persistResume = async (id, resumeData) => {
    await storage.set(`resume:${id}`, JSON.stringify(resumeData), false);
    setIndex((idx) => {
      const updated = idx.map((r) => (r.id === id ? { ...r, label: resumeData.name || r.label, updatedAt: Date.now() } : r));
      storage.set("resume-index", JSON.stringify(updated), false).catch(() => {});
      return updated;
    });
  };

  const flushPendingSave = async () => {
    clearTimeout(saveTimer.current);
    if (!pendingSave.current) return;
    const { id, data: pendingData } = pendingSave.current;
    pendingSave.current = null;
    try {
      await persistResume(id, pendingData);
    } catch (e) {
      console.error("Flush save failed", e);
    }
  };

  useEffect(() => {
    (async () => {
      // storage.get's behavior for a never-set key is ambiguous across
      // docs (some describe a null return, others a thrown error) — handle
      // both so a brand-new user's first load always bootstraps correctly.
      let idx = [];
      try {
        const listResult = await storage.get("resume-index", false);
        idx = listResult ? JSON.parse(listResult.value) : [];
      } catch (e) {
        idx = [];
      }
      try {
        if (idx.length === 0) {
          const id = crypto.randomUUID();
          idx = [{ id, label: "My Resume", updatedAt: Date.now() }];
          await storage.set("resume-index", JSON.stringify(idx), false);
          await storage.set(`resume:${id}`, JSON.stringify(blankResume()), false);
        }
        setIndex(idx);
        const firstId = idx[0].id;
        let first = null;
        try {
          first = await storage.get(`resume:${firstId}`, false);
        } catch (e) {
          first = null;
        }
        skipNextAutosave.current = true;
        setData(first ? JSON.parse(first.value) : blankResume());
        setActiveId(firstId);
        setStatus("ready");
      } catch (e) {
        console.error("Storage load failed", e);
        setStatus("ready");
      }
    })();
  }, []);

  useEffect(() => {
    if (status === "loading" || !activeId) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      pendingSave.current = null;
      return;
    }
    setStatus("saving");
    clearTimeout(saveTimer.current);
    pendingSave.current = { id: activeId, data };
    saveTimer.current = setTimeout(async () => {
      const toSave = pendingSave.current;
      pendingSave.current = null;
      if (!toSave) return;
      try {
        await persistResume(toSave.id, toSave.data);
        setStatus("saved");
      } catch (e) {
        console.error("Autosave failed", e);
        setStatus("ready");
      }
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data]); // eslint-disable-line

  const switchResume = async (id) => {
    if (id === activeId) return;
    // Persist any edit still sitting in the debounce window before we
    // swap `data` out from under it — otherwise it's silently discarded.
    await flushPendingSave();
    try {
      const r = await storage.get(`resume:${id}`, false);
      skipNextAutosave.current = true;
      setData(r ? JSON.parse(r.value) : blankResume());
      setActiveId(id);
    } catch (e) {
      console.error(e);
    }
  };

  const createResume = async () => {
    await flushPendingSave();
    const id = crypto.randomUUID();
    const fresh = blankResume();
    try {
      await storage.set(`resume:${id}`, JSON.stringify(fresh), false);
      const updated = [...index, { id, label: "Untitled Resume", updatedAt: Date.now() }];
      await storage.set("resume-index", JSON.stringify(updated), false);
      setIndex(updated);
      skipNextAutosave.current = true;
      setData(fresh);
      setActiveId(id);
    } catch (e) {
      console.error(e);
    }
  };

  const deleteResume = async (id) => {
    if (index.length <= 1) return;
    try {
      await storage.delete(`resume:${id}`, false);
      const updated = index.filter((r) => r.id !== id);
      await storage.set("resume-index", JSON.stringify(updated), false);
      setIndex(updated);
      if (activeId === id) {
        // The active resume was just deleted — drop any pending save for
        // it so switchResume doesn't resurrect a deleted key.
        pendingSave.current = null;
        clearTimeout(saveTimer.current);
        switchResume(updated[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ---- Data portability (Part 31/32) ----
  // Everything here lives only in this browser's IndexedDB — no account, no
  // server copy. These are the only backup/recovery path a user has, so
  // they're not optional polish.
  const [dataMessage, setDataMessage] = useState("");

  const exportAllData = async () => {
    try {
      await flushPendingSave();
      const all = await storage.exportAll();
      const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resume-builder-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed", e);
      setDataMessage("Export failed — please try again.");
      setTimeout(() => setDataMessage(""), 3000);
    }
  };

  const importAllData = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await storage.importAll(parsed);
      // Reload from storage rather than trying to patch in-memory state —
      // simplest way to guarantee what's on screen matches what's now saved.
      window.location.reload();
    } catch (e) {
      console.error("Import failed", e);
      setDataMessage("That file doesn't look like a valid backup.");
      setTimeout(() => setDataMessage(""), 3000);
    }
  };

  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const clearAllData = async () => {
    if (!confirmingClearAll) {
      setConfirmingClearAll(true);
      setTimeout(() => setConfirmingClearAll(false), 3000);
      return;
    }
    try {
      await storage.clearAll();
      window.location.reload();
    } catch (e) {
      console.error("Clear all failed", e);
      setDataMessage("Couldn't clear local data — please try again.");
      setTimeout(() => setDataMessage(""), 3000);
    }
  };

  const set = (field, value) => setData((d) => ({ ...d, [field]: value }));

  const [photoError, setPhotoError] = useState("");
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // stay comfortably under the 5MB per-key storage cap

  const handlePhotoUpload = (file) => {
    if (!file) return;
    setPhotoError("");
    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("That image is too large — please use one under 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("photo", reader.result);
    reader.onerror = () => setPhotoError("Couldn't read that image — please try another file.");
    reader.readAsDataURL(file);
  };

  const [importText, setImportText] = useState("");

  // ---- "Don't have resume text ready?" AI-drafting guide ----
  const [showAiGuide, setShowAiGuide] = useState(true);
  const [promptCopied, setPromptCopied] = useState(false);
  const aiDraftPrompt = `I'm writing my resume${data.title ? ` for a ${data.title} role` : ""}. Here's my background: [briefly describe your work history, key projects, and skills].

Please write:
1. A 2-3 sentence professional summary
2. For each job, 3-4 achievement-focused bullet points (use numbers/metrics where possible)
3. A list of 6-10 relevant skills

Write it as plain text — no markdown, no headers, just paragraphs and bullet points I can paste directly into a resume builder.`;
  const copyAiPrompt = async () => {
    try {
      await navigator.clipboard.writeText(aiDraftPrompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch (e) {
      console.error("Clipboard copy failed — the prompt text is still selectable manually", e);
    }
  };
  const [importStatus, setImportStatus] = useState("idle");
  const [importError, setImportError] = useState("");
  // No PDF-text-extraction library is importable in this sandbox (only the
  // curated lucide-react/mammoth/etc. allowlist resolves here) — so a staged
  // PDF is sent to the model itself as a base64 document, not parsed client-side.
  const [importPdf, setImportPdf] = useState(null); // { base64, name } | null
  const readingKind = useRef(null); // "pdf" | "file" — just for the button's loading copy

  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });

  const handleResumeFile = async (file) => {
    if (!file) return;
    setImportError("");
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError("That file is too large (max 8MB) — try pasting the text instead.");
      return;
    }
    const name = file.name.toLowerCase();
    readingKind.current = name.endsWith(".pdf") ? "pdf" : "file";
    setImportStatus("reading");
    setImportPdf(null);
    try {
      if (name.endsWith(".docx")) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setImportText(result.value);
      } else if (name.endsWith(".txt")) {
        const text = await file.text();
        setImportText(text);
      } else if (name.endsWith(".pdf")) {
        const base64 = await readFileAsBase64(file);
        setImportText("");
        setImportPdf({ base64, name: file.name });
      } else {
        setImportError("Unsupported file type. Use .docx, .txt, .pdf, or paste the text directly.");
        setImportStatus("idle");
        return;
      }
      setImportStatus("idle");
    } catch (e) {
      console.error(e);
      setImportError("Couldn't read that file. Try pasting the resume text instead.");
      setImportStatus("idle");
    }
  };

  const [autoFillOverwrite, setAutoFillOverwrite] = useState(false);

  const EXTRACTION_SCHEMA = `{
  "name": "", "title": "", "email": "", "phone": "", "location": "", "link": "",
  "summary": "",
  "skills": "comma, separated, list",
  "experience": [{"role": "", "org": "", "start": "", "end": "", "desc": ""}],
  "education": [{"school": "", "degree": "", "year": ""}]
}`;

  const runAutoFill = async () => {
    if (!importPdf && !importText.trim()) {
      setImportError("Paste or upload some resume text first.");
      return;
    }
    setImportError("");
    setImportStatus("extracting");
    try {
      const content = importPdf
        ? [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: importPdf.base64 } },
            { type: "text", text: `Extract structured resume data from the attached PDF. Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:\n${EXTRACTION_SCHEMA}\nLeave any field "" if not found. Keep "desc" fields concise (1-2 sentences).` },
          ]
        : `Extract structured resume data from the text below. Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
${EXTRACTION_SCHEMA}
Leave any field "" if not found. Keep "desc" fields concise (1-2 sentences). Text:
"""${importText.slice(0, 12000)}"""`;

      // Calls OUR backend, not Anthropic directly — the API key lives only
      // in that server's environment variables (see /api/ai/extract-resume
      // in the project README). This endpoint won't exist until you deploy
      // the backend function; until then this fails with a normal network
      // error, caught below, and the rest of the app is unaffected.
      const response = await fetch("/api/ai/extract-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(`AI extraction service returned ${response.status}`);
      }
      const parsed = await response.json();

      // Default: only fill fields that are currently empty, so re-running
      // auto-fill (or pasting an old resume "just to grab a phone number")
      // never clobbers content the user already wrote by hand. The
      // "Overwrite existing content" toggle restores full-replace behavior.
      const pick = (existing, incoming) => (autoFillOverwrite ? (incoming || existing) : (existing || incoming));
      const isBlankExp = (arr) => !arr.some((e) => (e.role || "").trim() || (e.org || "").trim());
      const isBlankEdu = (arr) => !arr.some((e) => (e.school || "").trim());

      setData((d) => ({
        ...d,
        name: pick(d.name, parsed.name),
        title: pick(d.title, parsed.title),
        email: pick(d.email, parsed.email),
        phone: pick(d.phone, parsed.phone),
        location: pick(d.location, parsed.location),
        link: pick(d.link, parsed.link),
        summary: pick(d.summary, parsed.summary),
        skills: pick(d.skills, parsed.skills),
        experience: (autoFillOverwrite || isBlankExp(d.experience)) && Array.isArray(parsed.experience) && parsed.experience.length
          ? parsed.experience.map((e) => ({ id: crypto.randomUUID(), role: e.role || "", org: e.org || "", start: e.start || "", end: e.end || "", desc: e.desc || "" }))
          : d.experience,
        education: (autoFillOverwrite || isBlankEdu(d.education)) && Array.isArray(parsed.education) && parsed.education.length
          ? parsed.education.map((e) => ({ id: crypto.randomUUID(), school: e.school || "", degree: e.degree || "", year: e.year || "" }))
          : d.education,
      }));
      setImportStatus("idle");
      setImportText("");
      setImportPdf(null);
    } catch (e) {
      console.error(e);
      setImportError("Auto-fill failed — try again, or double-check the pasted text isn't empty.");
      setImportStatus("idle");
    }
  };

  const updateExp = (id, field, value) =>
    setData((d) => ({ ...d, experience: d.experience.map((e) => (e.id === id ? { ...e, [field]: value } : e)) }));
  const updateEdu = (id, field, value) =>
    setData((d) => ({ ...d, education: d.education.map((e) => (e.id === id ? { ...e, [field]: value } : e)) }));
  const updateProject = (id, field, value) =>
    setData((d) => ({ ...d, projects: (d.projects || []).map((p) => (p.id === id ? { ...p, [field]: value } : p)) }));
  const updateCert = (id, field, value) =>
    setData((d) => ({ ...d, certifications: (d.certifications || []).map((c) => (c.id === id ? { ...c, [field]: value } : c)) }));
  const updateExtra = (id, field, value) =>
    setData((d) => ({ ...d, extracurricular: (d.extracurricular || []).map((x) => (x.id === id ? { ...x, [field]: value } : x)) }));
  // `data.declaration` may be missing on resumes saved before this field
  // existed — fall back so older saved resumes don't crash on load.
  const setDeclaration = (field, value) =>
    setData((d) => ({ ...d, declaration: { enabled: false, text: "", place: "", date: "", ...d.declaration, [field]: value } }));

  // Shared "click once to arm, click again to confirm" pattern for every
  // destructive delete (resume / experience / education). Arming auto-expires
  // so a stray later click somewhere else doesn't confirm-by-accident.
  const [confirmingDeleteKey, setConfirmingDeleteKey] = useState(null);
  const confirmTimer = useRef(null);

  const requestDelete = (key, action) => {
    if (confirmingDeleteKey === key) {
      clearTimeout(confirmTimer.current);
      setConfirmingDeleteKey(null);
      action();
    } else {
      clearTimeout(confirmTimer.current);
      setConfirmingDeleteKey(key);
      confirmTimer.current = setTimeout(() => setConfirmingDeleteKey(null), 3000);
    }
  };

  const accent = ACCENTS.find((a) => a.from === data.accent) || ACCENTS[0];
  const template = TEMPLATES.find((t) => t.id === data.template) || TEMPLATES[0];
  const font = FONTS.find((f) => f.id === data.font) || FONTS[0];
  const pageSize = PAGE_SIZES[data.pageSize] || PAGE_SIZES.letter;
  const declaration = data.declaration || { enabled: false, text: "", place: "", date: "" };
  // Same backward-compat concern as declaration above — resumes saved before
  // these sections existed won't have these arrays.
  const projects = data.projects || [];
  const certifications = data.certifications || [];
  const extracurricular = data.extracurricular || [];
  const skillList = (data.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
  const languageList = (data.languages || "").split(",").map((s) => s.trim()).filter(Boolean);
  const interestList = (data.interests || "").split(",").map((s) => s.trim()).filter(Boolean);

  // ---- Fill-the-page scaling for sparse resumes ----
  // A short resume left at normal size looks unfinished, with all the empty
  // space dumped at the bottom of the page. Rather than reflowing every
  // font-size individually (risky across 3 layouts), this scales the whole
  // rendered content proportionally via CSS zoom — text AND the gaps
  // between sections grow together, which both fills more of the page
  // (dynamic scaling) and spreads the extra room evenly through the
  // content instead of leaving one big gap at the end (balanced
  // whitespace) — one mechanism does both. A content-heavy resume gets a
  // scale of 1 (byte-for-byte the previously-verified, unscaled layout).
  const filledExp = data.experience.filter((e) => e.role || e.org).length;
  const filledEdu = data.education.filter((e) => e.school).length;
  const expDescChars = data.experience.reduce((sum, e) => sum + (e.desc || "").length, 0);
  const contentScore =
    Math.min(data.summary.length / 150, 1) +
    Math.min(skillList.length / 8, 1) +
    Math.min(filledExp / 3, 1) * 1.5 +
    Math.min(expDescChars / 400, 1) +
    Math.min(filledEdu / 2, 1) * 0.5 +
    (data.achievements ? 0.5 : 0) +
    (data.languages ? 0.3 : 0) +
    (data.interests ? 0.3 : 0);
  const contentFullness = Math.min(contentScore / 5, 1); // 0 = empty, 1 = typical full resume
  const pageZoom = Math.min(1 + (1 - contentFullness) * 0.28, 1.28); // sparse -> up to 28% larger, full -> unchanged
  // Font/spacing scaling alone can't fill a page without looking absurd past a
  // point — for genuinely thin content, center the block vertically instead of
  // pinning it to the top, so the leftover space splits evenly rather than
  // forming one dead zone at the bottom.
  const shouldCenterContent = contentFullness < 0.45;

  const completion = (() => {
    let filled = 0;
    const total = FIELD_WEIGHTS.length + 3; // + photo + experience + education
    for (const f of FIELD_WEIGHTS) if ((data[f] || "").trim()) filled++;
    if (data.photo) filled++;
    if (data.experience.some((e) => e.role && e.org)) filled++;
    if (data.education.some((e) => e.school)) filled++;
    return Math.round((filled / total) * 100);
  })();

  const handleDownload = () => {
    // Browsers use document.title to suggest a filename in the print / Save-as-PDF
    // dialog — set it right before printing so the download isn't just "resume-
    // builder-pro" or the page's default title, then restore it afterward.
    const previousTitle = document.title;
    document.title = `${data.name || "Resume"} - Resume`;
    const restoreTitle = () => { document.title = previousTitle; };
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
    // Fallback in case `afterprint` doesn't fire on this browser — restoring
    // twice is harmless, it's idempotent.
    setTimeout(restoreTitle, 2000);
  };

  const GLOBAL_STYLES = useMemo(() => `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&family=Poppins:wght@400;600;700&family=Montserrat:wght@400;600;700&family=Playfair+Display:wght@600;700&family=Lato:wght@400;700&display=swap');

    .ui-font { font-family: 'Sora', 'Inter', sans-serif; }
    .body-font { font-family: 'Inter', sans-serif; }

    /* Responsive 3-column layout (240px sidebar + two flexible columns).
       Written as a media query instead of a Tailwind arbitrary-value class
       since those aren't compiled in this environment. */
    .builder-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; padding: 1.25rem; }
    @media (min-width: 1024px) {
      .builder-grid { grid-template-columns: 240px 1fr 1fr; }
    }

    /* Keeps upload inputs focusable/operable via keyboard while staying
       visually hidden (display:none removes them from the tab order). */
    .sr-only-input {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    .upload-label:focus-within { outline: 2px solid ${accent.from}; outline-offset: 2px; }

    @media print {
      @page { size: ${pageSize.cssSize}; margin: 0; }
      body * { visibility: hidden; }
      #resume-sheet, #resume-sheet * { visibility: visible; }
      #resume-sheet { position: absolute; top: 0; left: 0; width: ${pageSize.width}; min-height: ${pageSize.height}; box-shadow: none !important; }
      .no-print { display: none !important; }
      .avoid-break { break-inside: avoid; page-break-inside: avoid; }
    }

    .input {
      width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px;
      padding: 10px 13px; font-size: 13px; color: #F3F4F6; outline: none; transition: all .2s ease;
      font-family: 'Inter', sans-serif;
    }
    .input::placeholder { color: #6B7280; }
    .input:focus { border-color: ${accent.from}; box-shadow: 0 0 0 3px ${accent.from}33; background: rgba(255,255,255,0.07); }

    .glass-card {
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      backdrop-filter: blur(20px);
      transition: border-color .25s ease, transform .25s ease;
    }
    .glass-card:hover { border-color: rgba(255,255,255,0.15); }

    .fade-in { animation: fadeIn .55s cubic-bezier(.16,1,.3,1) both; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

    .aurora { position: fixed; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
    .blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.35; animation: drift 22s ease-in-out infinite; }
    @keyframes drift {
      0%, 100% { transform: translate(0,0) scale(1); }
      33% { transform: translate(40px,-30px) scale(1.12); }
      66% { transform: translate(-30px,25px) scale(0.94); }
    }

    .swatch { transition: transform .2s ease, box-shadow .2s ease; }
    .swatch:hover { transform: scale(1.15); }
    .swatch.active { transform: scale(1.18); }

    .btn-glow { transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease; }
    .btn-glow:hover { transform: translateY(-1px) scale(1.02); }
    .btn-glow:active { transform: translateY(0) scale(0.98); }

    .nav-pill { transition: all .2s ease; position: relative; overflow: hidden; }
    .nav-pill:hover { background: rgba(255,255,255,0.06) !important; }

    .progress-shimmer { position: relative; overflow: hidden; }
    .progress-shimmer::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
      animation: shimmer 2s ease-in-out infinite;
    }
    @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
  `, [accent.from, pageSize.id]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 ui-font text-xs uppercase tracking-widest text-gray-400" style={{ background: "#0A0B12", color: "#e5e7eb" }}>
        <style>{GLOBAL_STYLES}</style>
        <Loader2 size={14} className="animate-spin" /> Loading your resumes…
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: "#0A0B12", color: "#F3F4F6" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* Animated aurora background */}
      <div className="no-print aurora">
        <div className="blob" style={{ width: 480, height: 480, top: "-10%", left: "-8%", background: accent.from }} />
        <div className="blob" style={{ width: 420, height: 420, bottom: "-15%", right: "-5%", background: accent.to, animationDelay: "4s" }} />
        <div className="blob" style={{ width: 300, height: 300, top: "35%", right: "20%", background: accent.from, opacity: 0.18, animationDelay: "8s" }} />
      </div>

      <div className="relative z-10">
        {/* Top bar */}
        <div className="no-print px-6 py-4 flex items-center justify-between sticky top-0 z-20"
          style={{ background: "rgba(10,11,18,0.75)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}>
              <Sparkles size={14} color="#fff" />
            </div>
            <span className="ui-font font-bold text-sm tracking-tight">Build — Resume Studio</span>
            <span className="flex items-center gap-1 body-font text-gray-500 ml-2" style={{ fontSize: 10 }} role="status" aria-live="polite">
              {status === "saving" ? <><Loader2 size={10} className="animate-spin" /> saving</> : <><Check size={10} /> saved</>}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {ACCENTS.map((a) => (
                <button key={a.name} onClick={() => set("accent", a.from)} title={a.name} aria-label={`Set accent color to ${a.name}`} aria-pressed={accent.from === a.from}
                  className={`swatch w-6 h-6 rounded-full ${accent.from === a.from ? "active" : ""}`}
                  style={{
                    background: `linear-gradient(135deg, ${a.from}, ${a.to})`,
                    boxShadow: accent.from === a.from ? `0 0 0 2px #0A0B12, 0 0 0 4px ${a.from}` : "none",
                  }} />
              ))}
              <label className="upload-label relative w-6 h-6 rounded-full cursor-pointer overflow-hidden flex items-center justify-center swatch"
                style={{ border: "1.5px dashed rgba(255,255,255,0.3)" }} title="Custom color">
                <Palette size={11} className="text-gray-400" />
                <input type="color" value={data.accent} onChange={(e) => set("accent", e.target.value)} aria-label="Custom accent color" className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
            </div>
            <button onClick={handleDownload} className="btn-glow flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold ui-font"
              style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, color: "#0A0B12", boxShadow: `0 4px 20px ${accent.from}55` }}>
              <Download size={14} /> Download PDF
            </button>
          </div>
        </div>

        <div className="builder-grid">
          {/* SIDEBAR */}
          <div className="no-print glass-card px-4 py-6 space-y-5 fade-in h-fit">
            <div className="flex items-center justify-between">
              <span className="ui-font font-semibold uppercase tracking-widest text-gray-400" style={{ fontSize: 10 }}>Your resumes</span>
              <button onClick={createResume} aria-label="Create new resume" className="w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition"
                style={{ background: "rgba(255,255,255,0.07)" }}><Plus size={13} /></button>
            </div>
            <div className="space-y-1">
              {index.map((r) => (
                <div key={r.id} onClick={() => switchResume(r.id)}
                  className="nav-pill group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs body-font"
                  style={{
                    background: activeId === r.id ? `linear-gradient(135deg, ${accent.from}22, ${accent.to}11)` : "transparent",
                    color: activeId === r.id ? "#fff" : "#9CA3AF",
                    border: activeId === r.id ? `1px solid ${accent.from}55` : "1px solid transparent",
                  }}>
                  <span className="flex items-center gap-2 truncate"><FileText size={12} />{r.label || "Untitled"}</span>
                  {index.length > 1 && (
                    <button onClick={(e) => { e.stopPropagation(); requestDelete(`resume:${r.id}`, () => deleteResume(r.id)); }}
                      aria-label={confirmingDeleteKey === `resume:${r.id}` ? `Confirm delete ${r.label || "resume"}` : `Delete ${r.label || "resume"}`}
                      className={`text-xs flex items-center gap-1 transition ${confirmingDeleteKey === `resume:${r.id}` ? "text-red-400 font-semibold" : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400"}`}>
                      {confirmingDeleteKey === `resume:${r.id}` ? "Confirm?" : <Trash2 size={11} />}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="ui-font font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1" style={{ fontSize: 10 }}><LayoutTemplate size={11} /> Template</span>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => {
                  const selected = template.id === t.id;
                  const cols = t.columns;
                  return (
                    <button key={t.id} onClick={() => set("template", t.id)} aria-label={t.name}
                      className="nav-pill relative flex flex-col items-stretch gap-1.5 p-2 rounded-lg text-left"
                      style={{
                        background: selected ? `linear-gradient(135deg, ${accent.from}22, transparent)` : "rgba(255,255,255,0.03)",
                        border: selected ? `1.5px solid ${accent.from}` : "1.5px solid rgba(255,255,255,0.08)",
                      }}>
                      {/* Placeholder layout preview — not a designed thumbnail, just an
                          abstract diagram of the column structure so the gallery has something to show. */}
                      <div className="rounded" style={{ aspectRatio: "3 / 4", background: "#fff", padding: 4, display: "flex", gap: 3, flexDirection: cols === 2 ? "row" : "column" }}>
                        {cols === 2 ? (
                          <>
                            <div style={{ width: "35%", background: "#E5E7EB", borderRadius: 2 }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                              <div style={{ height: "18%", background: accent.from, opacity: 0.5, borderRadius: 2 }} />
                              <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "80%" }} />
                              <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "60%" }} />
                              <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "70%" }} />
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ height: "16%", background: accent.from, opacity: 0.5, borderRadius: 2, alignSelf: t.headerAlign === "center" ? "center" : "stretch", width: t.headerAlign === "center" ? "60%" : "100%" }} />
                            <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "90%", alignSelf: t.headerAlign === "center" ? "center" : "flex-start" }} />
                            <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "75%", alignSelf: t.headerAlign === "center" ? "center" : "flex-start" }} />
                            <div style={{ height: 3, background: "#E5E7EB", borderRadius: 1, width: "85%", alignSelf: t.headerAlign === "center" ? "center" : "flex-start" }} />
                          </>
                        )}
                      </div>
                      <span className="ui-font body-font truncate" style={{ fontSize: 10.5, color: selected ? "#fff" : "#9CA3AF" }}>
                        {t.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="ui-font font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1" style={{ fontSize: 10 }}><Type size={11} /> Font</span>
              {FONTS.map((f) => (
                <button key={f.id} onClick={() => set("font", f.id)}
                  className="nav-pill w-full text-left px-3 py-2 rounded-lg text-xs"
                  style={{
                    background: font.id === f.id ? `linear-gradient(135deg, ${accent.from}22, transparent)` : "transparent",
                    color: font.id === f.id ? "#fff" : "#9CA3AF",
                    borderLeft: font.id === f.id ? `2px solid ${accent.from}` : "2px solid transparent",
                    fontFamily: f.css,
                  }}>
                  {f.name}
                </button>
              ))}
            </div>

            <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="ui-font font-semibold uppercase tracking-widest text-gray-400 flex items-center gap-1" style={{ fontSize: 10, marginBottom: 8 }}><FileText size={11} /> Page Size</span>
              <div className="flex gap-2">
                {Object.values(PAGE_SIZES).map((p) => (
                  <button key={p.id} onClick={() => set("pageSize", p.id)} aria-label={`Page size: ${p.name}`} aria-pressed={pageSize.id === p.id}
                    className="flex-1 rounded-lg py-2 text-xs body-font"
                    style={{
                      background: pageSize.id === p.id ? `linear-gradient(135deg, ${accent.from}22, transparent)` : "rgba(255,255,255,0.03)",
                      border: pageSize.id === p.id ? `1.5px solid ${accent.from}` : "1.5px solid rgba(255,255,255,0.08)",
                      color: pageSize.id === p.id ? "#fff" : "#9CA3AF",
                    }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="ui-font font-semibold uppercase tracking-widest text-gray-400" style={{ fontSize: 10 }}>Completion</span>
                <span className="ui-font font-bold" style={{ fontSize: 10, color: accent.from }}>{completion}%</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full transition-all duration-700 progress-shimmer" style={{ width: `${completion}%`, background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />
              </div>
            </div>

            <div className="pt-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="ui-font font-semibold uppercase tracking-widest text-gray-400" style={{ fontSize: 10 }}>Your Data</span>
              <p className="body-font text-gray-500" style={{ fontSize: 10, lineHeight: 1.5 }}>
                Everything here lives only in this browser. Back up your resumes as a file you can restore later or move to another device.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={exportAllData} className="text-xs flex items-center gap-1.5 text-gray-400 hover:text-white transition body-font rounded-lg px-3 py-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <Download size={12} /> Export backup
                </button>
                <label className="text-xs flex items-center gap-1.5 text-gray-400 hover:text-white cursor-pointer transition body-font rounded-lg px-3 py-1.5" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <UploadCloud size={12} /> Restore backup
                  <input type="file" accept=".json" className="sr-only-input" aria-label="Restore backup file" onChange={(e) => importAllData(e.target.files?.[0])} />
                </label>
                <button onClick={clearAllData} aria-label={confirmingClearAll ? "Confirm delete all local data" : "Delete all local data"}
                  className={`text-xs flex items-center gap-1.5 transition body-font rounded-lg px-3 py-1.5 ${confirmingClearAll ? "text-red-400 font-semibold" : "text-gray-400 hover:text-red-400"}`}
                  style={{ background: "rgba(255,255,255,0.05)" }}>
                  <Trash2 size={12} /> {confirmingClearAll ? "Confirm? Deletes everything" : "Delete all data"}
                </button>
              </div>
              {dataMessage && <p style={{ fontSize: 10.5, color: "#f87171" }}>{dataMessage}</p>}
            </div>

            <AdSlot placement="sidebar-footer" />
          </div>

          {/* FORM */}
          <div className="no-print space-y-5">
            <AdSlot placement="editor-top" />
            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.02s" }}>
              <div className="flex items-center gap-2"><Wand2 size={15} style={{ color: accent.from }} /><h2 className="ui-font text-xs font-semibold uppercase tracking-widest">Import old resume (AI auto-fill)</h2></div>

              {showAiGuide && (
                <div className="rounded-xl p-3 space-y-2" style={{ background: `${accent.from}0F`, border: `1px solid ${accent.from}33` }}>
                  <div className="flex items-center justify-between">
                    <span className="ui-font font-semibold flex items-center gap-1.5" style={{ fontSize: 11, color: accent.from }}>
                      <Sparkles size={12} /> Don't have resume text ready?
                    </span>
                    <button onClick={() => setShowAiGuide(false)} aria-label="Dismiss AI drafting guide" className="text-gray-500 hover:text-white transition"><X size={12} /></button>
                  </div>
                  <p className="body-font text-gray-400" style={{ fontSize: 11, lineHeight: 1.5 }}>
                    Copy this into ChatGPT, Claude, or any AI chat, describe your background when it asks, then paste what it writes into the box below.
                  </p>
                  <textarea readOnly value={aiDraftPrompt} aria-label="AI drafting prompt to copy" onClick={(e) => e.target.select()}
                    className="input" style={{ fontSize: 10.5, height: 92, resize: "none" }} />
                  <button onClick={copyAiPrompt} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition body-font text-gray-300"
                    style={{ background: "rgba(255,255,255,0.08)", fontSize: 11 }}>
                    {promptCopied ? <><Check size={11} /> Copied</> : <><FileText size={11} /> Copy prompt</>}
                  </button>
                </div>
              )}

              <label className="upload-label flex items-center gap-2 text-xs text-gray-400 hover:text-white cursor-pointer rounded-lg px-3 py-2 w-fit transition body-font"
                style={{ border: "1px dashed rgba(255,255,255,0.18)" }}>
                <UploadCloud size={13} /> Upload .docx, .txt, or .pdf
                <input type="file" accept=".docx,.txt,.pdf" className="sr-only-input" aria-label="Upload resume file" onChange={(e) => handleResumeFile(e.target.files?.[0])} />
              </label>
              {importPdf && (
                <div className="flex items-center gap-2 text-xs text-gray-300 body-font w-fit rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <FileText size={13} /> {importPdf.name}
                  <button onClick={() => setImportPdf(null)} aria-label="Remove staged PDF" className="text-gray-500 hover:text-red-400 transition"><X size={12} /></button>
                </div>
              )}
              <textarea className="input h-24 resize-none" placeholder="...or paste your old resume text here" aria-label="Paste resume text" value={importText}
                onChange={(e) => { setImportText(e.target.value); if (importPdf) setImportPdf(null); }} />
              {importError && <p className="text-red-400 body-font" style={{ fontSize: 11 }}>{importError}</p>}
              <label className="flex items-center gap-2 text-xs text-gray-400 body-font cursor-pointer w-fit">
                <input type="checkbox" checked={autoFillOverwrite} onChange={(e) => setAutoFillOverwrite(e.target.checked)} className="accent-current" />
                Overwrite existing content
              </label>
              <button onClick={runAutoFill} disabled={importStatus !== "idle"}
                className="btn-glow flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold ui-font disabled:opacity-50"
                style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`, color: "#0A0B12" }}>
                {importStatus === "extracting" ? <><Loader2 size={13} className="animate-spin" /> {importPdf ? "Reading PDF with AI…" : "Reading your resume…"}</> :
                 importStatus === "reading" ? <><Loader2 size={13} className="animate-spin" /> {readingKind.current === "pdf" ? "Reading PDF…" : "Loading file…"}</> :
                 <><Wand2 size={13} /> Auto-fill with AI</>}
              </button>
              <p className="text-gray-500 body-font" style={{ fontSize: 10 }}>
                {autoFillOverwrite ? "This will overwrite matching fields below — review after it runs." : "This only fills in fields that are currently empty."}
              </p>
            </section>

            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.06s" }}>
              <div className="flex items-center gap-2"><User size={15} style={{ color: accent.from }} /><h2 className="ui-font text-xs font-semibold uppercase tracking-widest">Basics</h2></div>
              <input className="input" placeholder="Full name" aria-label="Full name" value={data.name} onChange={(e) => set("name", e.target.value)} />
              <input className="input" placeholder="Title — e.g. Product Designer" aria-label="Professional title" value={data.title} onChange={(e) => set("title", e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <input className="input" placeholder="Email" aria-label="Email" value={data.email} onChange={(e) => set("email", e.target.value)} />
                <input className="input" placeholder="Phone" aria-label="Phone" value={data.phone} onChange={(e) => set("phone", e.target.value)} />
                <input className="input" placeholder="Location" aria-label="Location" value={data.location} onChange={(e) => set("location", e.target.value)} />
                <input className="input" placeholder="Portfolio / LinkedIn" aria-label="Portfolio or LinkedIn link" value={data.link} onChange={(e) => set("link", e.target.value)} />
              </div>
              <div className="flex items-center gap-3 pt-1 flex-wrap">
                {data.photo ? (
                  <div className="flex items-center gap-3">
                    <img src={data.photo} alt="Your photo" className="w-12 h-12 rounded-full object-cover" style={{ border: `2px solid ${accent.from}` }} />
                    <button onClick={() => { set("photo", null); setPhotoError(""); }} className="text-xs flex items-center gap-1 text-gray-400 hover:text-red-400 transition body-font">
                      <X size={12} /> Remove photo
                    </button>
                  </div>
                ) : (
                  <label className="upload-label text-xs flex items-center gap-1.5 text-gray-400 hover:text-white cursor-pointer rounded-lg px-3 py-2 transition body-font"
                    style={{ border: "1px dashed rgba(255,255,255,0.18)" }}>
                    <ImagePlus size={13} /> Upload photo (optional)
                    <input type="file" accept="image/*" className="sr-only-input" aria-label="Upload profile photo" onChange={(e) => handlePhotoUpload(e.target.files?.[0])} />
                  </label>
                )}
                {photoError && <p className="w-full body-font" style={{ fontSize: 11, color: "#f87171" }}>{photoError}</p>}
              </div>
            </section>

            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.1s" }}>
              <div className="flex items-center gap-2"><Sparkles size={15} style={{ color: accent.from }} /><h2 className="ui-font text-xs font-semibold uppercase tracking-widest">Summary</h2></div>
              <textarea className="input h-24 resize-none" placeholder="Two or three sentences on who you are and what you're looking for." aria-label="Professional summary" value={data.summary} onChange={(e) => set("summary", e.target.value)} />
            </section>

            <section className="glass-card p-5 space-y-4 fade-in" style={{ animationDelay: "0.14s" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><Briefcase size={15} style={{ color: accent.from }} /><h2 className="ui-font text-xs font-semibold uppercase tracking-widest">Experience</h2></div>
                <button onClick={() => set("experience", [...data.experience, emptyExp()])} aria-label="Add experience" className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition body-font"><Plus size={13} /> Add</button>
              </div>
              {data.experience.map((exp) => (
                <div key={exp.id} className="rounded-xl p-4 space-y-2 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <button onClick={() => requestDelete(`exp:${exp.id}`, () => set("experience", data.experience.filter((e) => e.id !== exp.id)))}
                    aria-label={confirmingDeleteKey === `exp:${exp.id}` ? "Confirm delete this experience entry" : "Delete this experience entry"}
                    className={`absolute top-3 right-3 transition ${confirmingDeleteKey === `exp:${exp.id}` ? "text-red-400 text-xs font-semibold" : "text-gray-500 hover:text-red-400"}`}>
                    {confirmingDeleteKey === `exp:${exp.id}` ? "Confirm?" : <Trash2 size={13} />}
                  </button>
                  <div className="grid grid-cols-2 gap-2 pr-6">
                    <input className="input" placeholder="Role" aria-label="Job role" value={exp.role} onChange={(e) => updateExp(exp.id, "role", e.target.value)} />
                    <input className="input" placeholder="Company" aria-label="Company" value={exp.org} onChange={(e) => updateExp(exp.id, "org", e.target.value)} />
                    <input className="input" placeholder="Start (e.g. 2022)" aria-label="Start date" value={exp.start} onChange={(e) => updateExp(exp.id, "start", e.target.value)} />
                    <input className="input" placeholder="End (e.g. Present)" aria-label="End date" value={exp.end} onChange={(e) => updateExp(exp.id, "end", e.target.value)} />
                  </div>
                  <textarea className="input h-16 resize-none" placeholder="What did you do / ship / improve?" aria-label="Experience description" value={exp.desc} onChange={(e) => updateExp(exp.id, "desc", e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card p-5 space-y-4 fade-in" style={{ animationDelay: "0.18s" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><GraduationCap size={15} style={{ color: accent.from }} /><h2 className="ui-font text-xs font-semibold uppercase tracking-widest">Education</h2></div>
                <button onClick={() => set("education", [...data.education, emptyEdu()])} aria-label="Add education" className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition body-font"><Plus size={13} /> Add</button>
              </div>
              {data.education.map((edu) => (
                <div key={edu.id} className="rounded-xl p-4 grid grid-cols-3 gap-2 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <button onClick={() => requestDelete(`edu:${edu.id}`, () => set("education", data.education.filter((e) => e.id !== edu.id)))}
                    aria-label={confirmingDeleteKey === `edu:${edu.id}` ? "Confirm delete this education entry" : "Delete this education entry"}
                    className={`absolute top-3 right-3 transition ${confirmingDeleteKey === `edu:${edu.id}` ? "text-red-400 text-xs font-semibold" : "text-gray-500 hover:text-red-400"}`}>
                    {confirmingDeleteKey === `edu:${edu.id}` ? "Confirm?" : <Trash2 size={13} />}
                  </button>
                  <input className="input col-span-2" placeholder="School" aria-label="School name" value={edu.school} onChange={(e) => updateEdu(edu.id, "school", e.target.value)} />
                  <input className="input" placeholder="Year" aria-label="Graduation year" value={edu.year} onChange={(e) => updateEdu(edu.id, "year", e.target.value)} />
                  <input className="input col-span-3" placeholder="Degree / field" aria-label="Degree or field of study" value={edu.degree} onChange={(e) => updateEdu(edu.id, "degree", e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.22s" }}>
              <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400">Skills (comma separated)</h2>
              <input className="input" placeholder="Figma, React, Copywriting, SQL" aria-label="Skills, comma separated" value={data.skills} onChange={(e) => set("skills", e.target.value)} />
            </section>

            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.26s" }}>
              <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400">Key achievements (one per line, optional)</h2>
              <textarea className="input h-20 resize-none" placeholder={"Improved X by Y%\nLed a team of 5 to launch Z"} aria-label="Key achievements, one per line" value={data.achievements} onChange={(e) => set("achievements", e.target.value)} />
              <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400 pt-2">Languages (optional)</h2>
              <input className="input" placeholder="Nepali: Native, English: Conversational" aria-label="Languages" value={data.languages} onChange={(e) => set("languages", e.target.value)} />
              <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400 pt-2">Interests (comma separated, optional)</h2>
              <input className="input" placeholder="Cricket, Poetry, Drawing" aria-label="Interests, comma separated" value={data.interests} onChange={(e) => set("interests", e.target.value)} />
            </section>

            <section className="glass-card p-5 space-y-4 fade-in" style={{ animationDelay: "0.14s" }}>
              <div className="flex items-center justify-between">
                <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400">Projects (optional)</h2>
                <button onClick={() => set("projects", [...projects, emptyProject()])} aria-label="Add project" className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition body-font"><Plus size={13} /> Add</button>
              </div>
              {projects.map((p) => (
                <div key={p.id} className="rounded-xl p-4 space-y-2 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <button onClick={() => requestDelete(`proj:${p.id}`, () => set("projects", projects.filter((x) => x.id !== p.id)))}
                    aria-label={confirmingDeleteKey === `proj:${p.id}` ? "Confirm delete this project" : "Delete this project"}
                    className={`absolute top-3 right-3 transition ${confirmingDeleteKey === `proj:${p.id}` ? "text-red-400 text-xs font-semibold" : "text-gray-500 hover:text-red-400"}`}>
                    {confirmingDeleteKey === `proj:${p.id}` ? "Confirm?" : <Trash2 size={13} />}
                  </button>
                  <input className="input" placeholder="Project name" aria-label="Project name" value={p.name} onChange={(e) => updateProject(p.id, "name", e.target.value)} />
                  <input className="input" placeholder="Tech stack (React, Node, PostgreSQL)" aria-label="Project tech stack" value={p.stack} onChange={(e) => updateProject(p.id, "stack", e.target.value)} />
                  <input className="input" placeholder="Live link / repo (optional)" aria-label="Project link" value={p.link} onChange={(e) => updateProject(p.id, "link", e.target.value)} />
                  <textarea className="input h-16 resize-none" placeholder="What did you build / key points" aria-label="Project description" value={p.desc} onChange={(e) => updateProject(p.id, "desc", e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card p-5 space-y-4 fade-in" style={{ animationDelay: "0.18s" }}>
              <div className="flex items-center justify-between">
                <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400">Certifications (optional)</h2>
                <button onClick={() => set("certifications", [...certifications, emptyCert()])} aria-label="Add certification" className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition body-font"><Plus size={13} /> Add</button>
              </div>
              {certifications.map((c) => (
                <div key={c.id} className="rounded-xl p-4 grid grid-cols-2 gap-2 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <button onClick={() => requestDelete(`cert:${c.id}`, () => set("certifications", certifications.filter((x) => x.id !== c.id)))}
                    aria-label={confirmingDeleteKey === `cert:${c.id}` ? "Confirm delete this certification" : "Delete this certification"}
                    className={`absolute top-3 right-3 transition ${confirmingDeleteKey === `cert:${c.id}` ? "text-red-400 text-xs font-semibold" : "text-gray-500 hover:text-red-400"}`}>
                    {confirmingDeleteKey === `cert:${c.id}` ? "Confirm?" : <Trash2 size={13} />}
                  </button>
                  <input className="input col-span-2" placeholder="Certification name" aria-label="Certification name" value={c.name} onChange={(e) => updateCert(c.id, "name", e.target.value)} />
                  <input className="input" placeholder="Issuer (e.g. Coursera)" aria-label="Certification issuer" value={c.issuer} onChange={(e) => updateCert(c.id, "issuer", e.target.value)} />
                  <input className="input" placeholder="Link (optional)" aria-label="Certification link" value={c.link} onChange={(e) => updateCert(c.id, "link", e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card p-5 space-y-4 fade-in" style={{ animationDelay: "0.22s" }}>
              <div className="flex items-center justify-between">
                <h2 className="ui-font text-xs font-semibold uppercase tracking-widest text-gray-400">Extracurricular (optional)</h2>
                <button onClick={() => set("extracurricular", [...extracurricular, emptyExtra()])} aria-label="Add extracurricular activity" className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition body-font"><Plus size={13} /> Add</button>
              </div>
              {extracurricular.map((x) => (
                <div key={x.id} className="rounded-xl p-4 space-y-2 relative" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <button onClick={() => requestDelete(`extra:${x.id}`, () => set("extracurricular", extracurricular.filter((e) => e.id !== x.id)))}
                    aria-label={confirmingDeleteKey === `extra:${x.id}` ? "Confirm delete this activity" : "Delete this activity"}
                    className={`absolute top-3 right-3 transition ${confirmingDeleteKey === `extra:${x.id}` ? "text-red-400 text-xs font-semibold" : "text-gray-500 hover:text-red-400"}`}>
                    {confirmingDeleteKey === `extra:${x.id}` ? "Confirm?" : <Trash2 size={13} />}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="Organization" aria-label="Extracurricular organization" value={x.org} onChange={(e) => updateExtra(x.id, "org", e.target.value)} />
                    <input className="input" placeholder="Role" aria-label="Extracurricular role" value={x.role} onChange={(e) => updateExtra(x.id, "role", e.target.value)} />
                    <input className="input" placeholder="Start (e.g. 2022)" aria-label="Extracurricular start date" value={x.start} onChange={(e) => updateExtra(x.id, "start", e.target.value)} />
                    <input className="input" placeholder="End (e.g. Present)" aria-label="Extracurricular end date" value={x.end} onChange={(e) => updateExtra(x.id, "end", e.target.value)} />
                  </div>
                  <input className="input" placeholder="Location (optional)" aria-label="Extracurricular location" value={x.location} onChange={(e) => updateExtra(x.id, "location", e.target.value)} />
                  <input className="input" placeholder="Certificate link (optional)" aria-label="Extracurricular certificate link" value={x.link} onChange={(e) => updateExtra(x.id, "link", e.target.value)} />
                  <textarea className="input h-16 resize-none" placeholder="What did you do / responsibilities" aria-label="Extracurricular description" value={x.desc} onChange={(e) => updateExtra(x.id, "desc", e.target.value)} />
                </div>
              ))}
            </section>

            <section className="glass-card p-5 space-y-3 fade-in" style={{ animationDelay: "0.3s" }}>
              <label className="flex items-center gap-2 text-xs body-font cursor-pointer w-fit">
                <input type="checkbox" checked={declaration.enabled} onChange={(e) => setDeclaration("enabled", e.target.checked)} className="accent-current" />
                <span className="ui-font font-semibold uppercase tracking-widest text-gray-400" style={{ fontSize: 10.5 }}>Add declaration</span>
              </label>
              <p className="body-font text-gray-500" style={{ fontSize: 10.5, lineHeight: 1.5 }}>
                A signed "I hereby declare..." statement with date/place — standard on CVs in some regions (e.g. India), not typically used on US/UK-style resumes. Off by default.
              </p>
              {declaration.enabled && (
                <div className="space-y-2 pt-1">
                  <textarea className="input h-16 resize-none" aria-label="Declaration statement" value={declaration.text} onChange={(e) => setDeclaration("text", e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="input" placeholder="Place" aria-label="Declaration place" value={declaration.place} onChange={(e) => setDeclaration("place", e.target.value)} />
                    <input className="input" placeholder="Date" aria-label="Declaration date" value={declaration.date} onChange={(e) => setDeclaration("date", e.target.value)} />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* PREVIEW */}
          <div className="flex flex-col items-center fade-in" style={{ animationDelay: "0.1s" }}>
            {template.layout === "navy" ? (
              <div id="resume-sheet" className="bg-white w-full shadow-2xl rounded-lg overflow-hidden" style={{ display: "flex", flexDirection: "column", justifyContent: shouldCenterContent ? "center" : "flex-start", color: "#1A1A1A", maxWidth: pageSize.width, minHeight: pageSize.height, fontFamily: font.css, boxShadow: `0 25px 60px -15px ${accent.from}44` }}>
                <div style={{ zoom: pageZoom }}>
                {/* Header */}
                <div style={{ background: accent.from, padding: "28px 34px 0" }}>
                  <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 800, letterSpacing: "0.01em", margin: 0 }}>{(data.name || "Your Name").toUpperCase()}</h1>
                  <p style={{ color: accent.to, fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", marginTop: 6 }}>{(data.title || "Your Title").toUpperCase()}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginTop: 16, padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.15)", fontSize: 11.5, color: "#fff" }}>
                    {data.location && <span><strong>Location:</strong> {data.location}</span>}
                    {data.phone && <span><strong>Phone:</strong> {data.phone}</span>}
                    {data.email && <span><strong>Email:</strong> {data.email}</span>}
                    {data.link && safeUrl(data.link) && (
                      <a href={safeUrl(data.link)} target="_blank" rel="noopener noreferrer" style={{ color: "#fff" }}><strong>Link:</strong> {data.link}</a>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div style={{ display: "flex", background: `${accent.to}14` }}>
                  {/* Left column */}
                  <div style={{ width: "62%", padding: "26px 28px" }}>
                    {data.summary && (
                      <div style={{ marginBottom: 22 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 800, color: "#1A1A1A", marginBottom: 6, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>CAREER OBJECTIVE</h3>
                        <p style={{ fontSize: 11.5, lineHeight: 1.6, color: "#333" }}>{data.summary}</p>
                      </div>
                    )}
                    {data.experience.some((e) => e.role || e.org) && (
                      <div style={{ marginBottom: 22 }}>
                        <h3 style={{ fontSize: 13, fontWeight: 800, color: "#1A1A1A", marginBottom: 10, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>EXPERIENCE</h3>
                        {data.experience.filter((e) => e.role || e.org).map((exp) => (
                          <div key={exp.id} className="avoid-break" style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: accent.from }}>{exp.role}</span>
                              <span style={{ fontSize: 10.5, color: "#777" }}>{exp.start}{exp.end && ` — ${exp.end}`}</span>
                            </div>
                            {exp.org && <div style={{ fontSize: 11, fontStyle: "italic", color: "#555" }}>{exp.org}</div>}
                            {exp.desc && <p style={{ fontSize: 11.5, color: "#444", marginTop: 4, lineHeight: 1.55 }}>• {exp.desc}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {data.achievements && (
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 800, color: "#1A1A1A", marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>KEY ACHIEVEMENTS</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {data.achievements.split("\n").map((line, i) => line.trim() && (
                            <p key={i} style={{ fontSize: 11.5, color: "#444", lineHeight: 1.55, margin: 0 }}>• {line.trim()}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right column */}
                  <div style={{ width: "38%", padding: "26px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
                    {data.education.some((e) => e.school) && (
                      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: 14 }}>
                        <h3 style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>EDUCATION</h3>
                        {data.education.filter((e) => e.school).map((edu) => (
                          <div key={edu.id} className="avoid-break" style={{ marginBottom: 8 }}>
                            {edu.degree && <div style={{ fontSize: 11.5, fontWeight: 700, color: accent.from }}>{edu.degree}</div>}
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{edu.school}</div>
                            {edu.year && <div style={{ fontSize: 10, color: "#888" }}>Year: {edu.year}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                    {skillList.length > 0 && (
                      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: 14 }}>
                        <h3 style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>SKILLS</h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {skillList.map((s, i) => (
                            <span key={i} style={{ fontSize: 10, fontWeight: 600, color: accent.from, background: `${accent.from}1A`, borderRadius: 4, padding: "4px 8px" }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {data.languages && (
                      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: 14 }}>
                        <h3 style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>LANGUAGES</h3>
                        {data.languages.split(",").map((l, i) => l.trim() && (
                          <div key={i} style={{ fontSize: 11, marginBottom: 3 }}>{l.trim()}</div>
                        ))}
                      </div>
                    )}
                    {data.interests && (
                      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, padding: 14 }}>
                        <h3 style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 8, paddingBottom: 4, borderBottom: `2px solid ${accent.from}` }}>INTERESTS</h3>
                        {data.interests.split(",").map((it, i) => it.trim() && (
                          <p key={i} style={{ fontSize: 11, margin: "0 0 3px" }}>• {it.trim()}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {declaration.enabled && (
                  <div className="avoid-break" style={{ padding: "16px 32px", borderTop: "1px solid #E2E8F0" }}>
                    <p style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5, margin: 0 }}>{declaration.text}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: "#555" }}>
                      <span>{declaration.place && `Place: ${declaration.place}`}</span>
                      <span>{declaration.date && `Date: ${declaration.date}`}</span>
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : template.layout === "sidebar" ? (
              <div id="resume-sheet" className="bg-white w-full shadow-2xl rounded-lg overflow-hidden" style={{ display: "flex", flexDirection: "column", justifyContent: shouldCenterContent ? "center" : "flex-start", color: "#1A1A1A", maxWidth: pageSize.width, minHeight: pageSize.height, fontFamily: font.css, boxShadow: `0 25px 60px -15px ${accent.from}44` }}>
                <div style={{ zoom: pageZoom }}>
                <div style={{ display: "flex" }}>
                <div style={{ width: "34%", background: `linear-gradient(160deg, ${accent.from}, ${accent.to})`, color: "#fff", padding: "36px 22px" }}>
                  {data.photo && (
                    <img src={data.photo} alt={data.name || "Profile"} style={{ width: 84, height: 84, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.6)", marginBottom: 18 }} />
                  )}
                  <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{data.name || "Your Name"}</h1>
                  <p style={{ fontSize: 12.5, opacity: 0.9, marginTop: 4, marginBottom: 22 }}>{data.title || "Your Title"}</p>
                  {(data.email || data.phone || data.location || data.link) && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 8 }}>Contact</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11 }}>
                        {data.email && <span className="flex items-center gap-1.5"><Mail size={11} /> {data.email}</span>}
                        {data.phone && <span className="flex items-center gap-1.5"><Phone size={11} /> {data.phone}</span>}
                        {data.location && <span className="flex items-center gap-1.5"><MapPin size={11} /> {data.location}</span>}
                        {data.link && safeUrl(data.link) && (
                          <a href={safeUrl(data.link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5" style={{ color: "inherit", textDecoration: "none" }}>
                            <LinkIcon size={11} /> {data.link}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {skillList.length > 0 && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 8 }}>Skills</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {skillList.map((s, i) => <span key={i} style={{ fontSize: 11 }}>• {s}</span>)}
                      </div>
                    </div>
                  )}
                  {data.education.some((e) => e.school) && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 8 }}>Education</h3>
                      {data.education.filter((e) => e.school).map((edu) => (
                        <div key={edu.id} className="avoid-break" style={{ marginBottom: 10 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700 }}>{edu.school}</div>
                          {edu.degree && <div style={{ fontSize: 10.5, opacity: 0.85 }}>{edu.degree}</div>}
                          {edu.year && <div style={{ fontSize: 10, opacity: 0.7, fontFamily: "ui-monospace, monospace" }}>{edu.year}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                  {data.languages && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 8 }}>Languages</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {languageList.map((l, i) => <span key={i} style={{ fontSize: 11 }}>{l}</span>)}
                      </div>
                    </div>
                  )}
                  {data.interests && (
                    <div>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", opacity: 0.75, marginBottom: 8 }}>Interests</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {interestList.map((it, i) => <span key={i} style={{ fontSize: 11 }}>• {it}</span>)}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ width: "66%", padding: "36px 30px" }}>
                  {data.summary && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 8 }}>Profile</h3>
                      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#333" }}>{data.summary}</p>
                    </div>
                  )}
                  {data.experience.some((e) => e.role || e.org) && (
                    <div style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Experience</h3>
                      {data.experience.filter((e) => e.role || e.org).map((exp) => (
                        <div key={exp.id} className="avoid-break" style={{ marginBottom: 16 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{exp.role}{exp.org && `, ${exp.org}`}</span>
                            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#777" }}>{exp.start}{exp.end && ` — ${exp.end}`}</span>
                          </div>
                          {exp.desc && <p style={{ fontSize: 12, color: "#444", marginTop: 3, lineHeight: 1.55 }}>{exp.desc}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {data.achievements && (
                    <div>
                      <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Key Achievements</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {data.achievements.split("\n").map((line, i) => line.trim() && (
                          <p key={i} style={{ fontSize: 12, color: "#444", lineHeight: 1.55, margin: 0 }}>• {line.trim()}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                </div>
                {declaration.enabled && (
                  <div className="avoid-break" style={{ padding: "16px 30px", borderTop: "1px solid #E2E8F0" }}>
                    <p style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5, margin: 0 }}>{declaration.text}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: "#555" }}>
                      <span>{declaration.place && `Place: ${declaration.place}`}</span>
                      <span>{declaration.date && `Date: ${declaration.date}`}</span>
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : template.layout === "student" ? (
              <div id="resume-sheet" className="bg-white w-full shadow-2xl rounded-lg" style={{ display: "flex", flexDirection: "column", justifyContent: shouldCenterContent ? "center" : "flex-start", color: "#1A1A1A", maxWidth: pageSize.width, minHeight: pageSize.height, fontFamily: font.css, boxShadow: `0 25px 60px -15px ${accent.from}44` }}>
                <div style={{ padding: "40px 46px", zoom: pageZoom }}>

                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "0.02em" }}>{(data.name || "Your Name").toUpperCase()}</h1>
                  {(data.title || data.location) && <p style={{ fontSize: 12, color: "#555", margin: "4px 0 0" }}>{[data.title, data.location].filter(Boolean).join(" — ")}</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14, marginTop: 8, fontSize: 10.5, color: "#444" }}>
                    {data.phone && <span className="flex items-center gap-1"><Phone size={10} /> {data.phone}</span>}
                    {data.email && <span className="flex items-center gap-1"><Mail size={10} /> {data.email}</span>}
                    {data.link && safeUrl(data.link) && (
                      <a href={safeUrl(data.link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "#444", textDecoration: "none" }}>
                        <LinkIcon size={10} /> {data.link}
                      </a>
                    )}
                  </div>
                </div>

                {data.summary && <p style={{ fontSize: 11.5, color: "#333", lineHeight: 1.55, marginBottom: 16, textAlign: "center" }}>{data.summary}</p>}

                {data.education.some((e) => e.school) && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>EDUCATION</h3>
                    {data.education.filter((e) => e.school).map((edu) => (
                      <div key={edu.id} className="avoid-break" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{edu.school}</div>
                          {edu.degree && <div style={{ fontSize: 11, fontStyle: "italic", color: "#444" }}>{edu.degree}</div>}
                        </div>
                        {edu.year && <div style={{ fontSize: 10.5, color: "#666" }}>{edu.year}</div>}
                      </div>
                    ))}
                  </div>
                )}

                {skillList.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>SKILLS</h3>
                    <p style={{ fontSize: 11, color: "#333", lineHeight: 1.7 }}>{skillList.join(" • ")}</p>
                  </div>
                )}

                {projects.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>PROJECTS</h3>
                    {projects.map((p) => (
                      <div key={p.id} className="avoid-break" style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 11.5 }}>
                            <strong>{p.name}</strong>
                            {p.stack && <span style={{ color: "#666" }}> | {p.stack}</span>}
                          </span>
                        </div>
                        {p.desc && p.desc.split("\n").map((line, i) => line.trim() && (
                          <p key={i} style={{ fontSize: 11, color: "#333", margin: "2px 0 0", lineHeight: 1.5 }}>• {line.trim()}</p>
                        ))}
                        {p.link && safeUrl(p.link) && (
                          <a href={safeUrl(p.link)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: accent.from, textDecoration: "underline" }}>{p.link}</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {data.experience.some((e) => e.role || e.org) && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>EXPERIENCE</h3>
                    {data.experience.filter((e) => e.role || e.org).map((exp) => (
                      <div key={exp.id} className="avoid-break" style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700 }}>{exp.role}{exp.org && `, ${exp.org}`}</span>
                          <span style={{ fontSize: 10.5, color: "#666" }}>{exp.start}{exp.end && ` — ${exp.end}`}</span>
                        </div>
                        {exp.desc && <p style={{ fontSize: 11, color: "#333", margin: "2px 0 0", lineHeight: 1.5 }}>{exp.desc}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {extracurricular.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>EXTRACURRICULAR</h3>
                    {extracurricular.map((x) => (
                      <div key={x.id} className="avoid-break" style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 11.5 }}><strong>{x.org}</strong>{x.role && ` — ${x.role}`}</span>
                          <span style={{ fontSize: 10.5, color: "#666" }}>{x.start}{x.end && ` — ${x.end}`}{x.location && `, ${x.location}`}</span>
                        </div>
                        {x.desc && <p style={{ fontSize: 11, color: "#333", margin: "2px 0 0", lineHeight: 1.5 }}>{x.desc}</p>}
                        {x.link && safeUrl(x.link) && (
                          <a href={safeUrl(x.link)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: accent.from, textDecoration: "underline" }}>Certificate</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {certifications.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", borderBottom: "1.5px solid #1A1A1A", paddingBottom: 3, marginBottom: 8 }}>CERTIFICATIONS</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {certifications.map((c) => (
                        <span key={c.id} style={{ fontSize: 11, color: "#333" }}>
                          {c.link && safeUrl(c.link) ? (
                            <a href={safeUrl(c.link)} target="_blank" rel="noopener noreferrer" style={{ color: "#333", textDecoration: "underline" }}>{c.name}</a>
                          ) : c.name}
                          {c.issuer && <span style={{ color: "#777" }}> - {c.issuer}</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {declaration.enabled && (
                  <div className="avoid-break" style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
                    <p style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5, margin: 0 }}>{declaration.text}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, color: "#555" }}>
                      <span>{declaration.place && `Place: ${declaration.place}`}</span>
                      <span>{declaration.date && `Date: ${declaration.date}`}</span>
                    </div>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div id="resume-sheet" className="bg-white w-full shadow-2xl rounded-lg" style={{ display: "flex", flexDirection: "column", justifyContent: shouldCenterContent ? "center" : "flex-start", color: "#1A1A1A", maxWidth: pageSize.width, minHeight: pageSize.height, fontFamily: font.css, borderLeft: template.sidebarAccent ? `8px solid ${accent.from}` : "none", boxShadow: `0 25px 60px -15px ${accent.from}44` }}>
                <div style={{ padding: 48, zoom: pageZoom }}>
                <div style={{
                  borderBottom: template.ruleWeight ? `${template.ruleWeight}px solid ${accent.from}` : "none",
                  paddingBottom: 16, marginBottom: 20,
                  display: "flex",
                  flexDirection: template.headerAlign === "center" ? "column" : "row",
                  alignItems: "center",
                  gap: data.photo ? 18 : 0,
                  textAlign: template.headerAlign,
                }}>
                  {data.photo && (
                    <img src={data.photo} alt={data.name || "Profile"} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${accent.from}`, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: template.headerAlign === "center" ? "none" : 1 }}>
                    <h1 style={{ fontSize: template.id === "bold" ? 34 : 30, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>{data.name || "Your Name"}</h1>
                    <p style={{ fontSize: 14, color: accent.from, fontWeight: 600, marginTop: 4 }}>{data.title || "Your Title"}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#555", justifyContent: template.headerAlign === "center" ? "center" : "flex-start" }}>
                      {data.email && <span className="flex items-center gap-1"><Mail size={11} /> {data.email}</span>}
                      {data.phone && <span className="flex items-center gap-1"><Phone size={11} /> {data.phone}</span>}
                      {data.location && <span className="flex items-center gap-1"><MapPin size={11} /> {data.location}</span>}
                      {data.link && safeUrl(data.link) && (
                        <a href={safeUrl(data.link)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1" style={{ color: "inherit", textDecoration: "none" }}>
                          <LinkIcon size={11} /> {data.link}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {data.summary && <div style={{ marginBottom: 20 }}><p style={{ fontSize: 12.5, lineHeight: 1.6, color: "#333" }}>{data.summary}</p></div>}

                {data.experience.some((e) => e.role || e.org) && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Experience</h3>
                    {data.experience.filter((e) => e.role || e.org).map((exp) => (
                      <div key={exp.id} className="avoid-break" style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{exp.role}{exp.org && `, ${exp.org}`}</span>
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#777" }}>{exp.start}{exp.end && ` — ${exp.end}`}</span>
                        </div>
                        {exp.desc && <p style={{ fontSize: 12, color: "#444", marginTop: 3, lineHeight: 1.55 }}>{exp.desc}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {data.education.some((e) => e.school) && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Education</h3>
                    {data.education.filter((e) => e.school).map((edu) => (
                      <div key={edu.id} className="avoid-break" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13 }}>{edu.school}{edu.degree && ` — ${edu.degree}`}</span>
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#777" }}>{edu.year}</span>
                      </div>
                    ))}
                  </div>
                )}

                {projects.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Projects</h3>
                    {projects.map((p) => (
                      <div key={p.id} className="avoid-break" style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}{p.stack && <span style={{ fontWeight: 400, color: "#777" }}> — {p.stack}</span>}</span>
                        </div>
                        {p.desc && <p style={{ fontSize: 12, color: "#444", marginTop: 3, lineHeight: 1.55 }}>{p.desc}</p>}
                        {p.link && safeUrl(p.link) && (
                          <a href={safeUrl(p.link)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: accent.from }}>{p.link}</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {skillList.length > 0 && (
                  <div style={{ marginBottom: (data.achievements || data.languages || data.interests) ? 20 : 0 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Skills</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: template.headerAlign === "center" ? "center" : "flex-start" }}>
                      {skillList.map((s, i) => <span key={i} style={{ fontSize: 11, border: `1px solid ${accent.from}`, color: accent.from, borderRadius: 3, padding: "3px 8px" }}>{s}</span>)}
                    </div>
                  </div>
                )}

                {data.achievements && (
                  <div style={{ marginBottom: (data.languages || data.interests) ? 20 : 0 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Key Achievements</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {data.achievements.split("\n").map((line, i) => line.trim() && (
                        <p key={i} style={{ fontSize: 12, color: "#444", lineHeight: 1.55, margin: 0 }}>• {line.trim()}</p>
                      ))}
                    </div>
                  </div>
                )}

                {data.languages && (
                  <div style={{ marginBottom: data.interests ? 20 : 0 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Languages</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                      {languageList.map((l, i) => <span key={i} style={{ fontSize: 12, color: "#444" }}>{l}</span>)}
                    </div>
                  </div>
                )}

                {data.interests && (
                  <div style={{ marginBottom: (certifications.length > 0 || extracurricular.length > 0) ? 20 : 0 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Interests</h3>
                    <p style={{ fontSize: 12, color: "#444", lineHeight: 1.6 }}>{interestList.join(" • ")}</p>
                  </div>
                )}

                {extracurricular.length > 0 && (
                  <div style={{ marginBottom: certifications.length > 0 ? 20 : 0 }}>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Extracurricular</h3>
                    {extracurricular.map((x) => (
                      <div key={x.id} className="avoid-break" style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{x.org}{x.role && `, ${x.role}`}</span>
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#777" }}>{x.start}{x.end && ` — ${x.end}`}</span>
                        </div>
                        {x.desc && <p style={{ fontSize: 12, color: "#444", marginTop: 3, lineHeight: 1.55 }}>{x.desc}</p>}
                        {x.link && safeUrl(x.link) && (
                          <a href={safeUrl(x.link)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: accent.from }}>Certificate</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {certifications.length > 0 && (
                  <div>
                    <h3 style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: accent.from, marginBottom: 10 }}>Certifications</h3>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {certifications.map((c) => (
                        <span key={c.id} style={{ fontSize: 11, border: "1px solid #E2E8F0", color: "#444", borderRadius: 3, padding: "3px 8px" }}>
                          {c.link && safeUrl(c.link) ? (
                            <a href={safeUrl(c.link)} target="_blank" rel="noopener noreferrer" style={{ color: "#444" }}>{c.name}</a>
                          ) : c.name}
                          {c.issuer && ` — ${c.issuer}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {declaration.enabled && (
                  <div className="avoid-break" style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
                    <p style={{ fontSize: 10.5, color: "#555", lineHeight: 1.5, margin: 0 }}>{declaration.text}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 10.5, color: "#555" }}>
                      <span>{declaration.place && `Place: ${declaration.place}`}</span>
                      <span>{declaration.date && `Date: ${declaration.date}`}</span>
                    </div>
                  </div>
                )}
                </div>
              </div>
            )}
            <div style={{ marginTop: 20 }}>
              <AdSlot placement="preview-bottom" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// 🔑 Put your Gemini API key here for the hackathon
const GEMINI_API_KEY = "AIzaSyCwSIJA62axl23pdvoVrZBiesZ7HRRwHRQ";

// Simple wrapper to call Gemini Text API
async function askGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    })
  });
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text.trim();
}

// --- Chat / Ask ---
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: "Missing question" });
    const answer = await askGemini(question);
    res.json({ answer: answer || "No answer received." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Study Planner ---
app.post("/plan", async (req, res) => {
  try {
    const { subjects, examDate, hoursPerDay } = req.body || {};
    const subj = Array.isArray(subjects) ? subjects.join(", ") : String(subjects || "");
    const prompt = `
Create a concise day-by-day study plan until ${examDate}.
Subjects: ${subj}
Daily study time: ${hoursPerDay} hours.
Rules:
- Keep it compact (max 10–15 lines).
- Include daily focus topics and quick revision cues.
- End with 3 exam-day tips.
`;
    const plan = await askGemini(prompt);
    res.json({ plan: plan || "No plan generated." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- File Upload + Summarize (PDF/DOCX/TXT) ---
const upload = multer({ dest: "uploads/" });

async function extractText(filePath, mimetype) {
  const ext = path.extname(filePath).toLowerCase();
  if (mimetype === "application/pdf" || ext === ".pdf") {
    const buf = fs.readFileSync(filePath);
    const parsed = await pdfParse(buf);
    return parsed.text || "";
  }
  if (
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    const buf = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value || "";
  }
  // Fallback to plain text
  return fs.readFileSync(filePath, "utf8");
}

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const text = await extractText(req.file.path, req.file.mimetype);
    fs.unlink(req.file.path, () => {}); // cleanup (non-blocking)

    const prompt = `Summarize the following content in ~180 words and then list EXACTLY 5 key points:\n\n${text}`;
    const summary = await askGemini(prompt);
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => res.send("Gemini server is live. Endpoints: POST /ask, /plan, /upload"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

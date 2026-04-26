import express from "express";
import Groq from "groq-sdk";
import cors from "cors";
import fs from "fs";
import path from "path";
import axios from "axios";
import jobsScraper from "./jobsScraper.js";

const app = express();
app.use(cors());
app.use(express.json());

// ❗ USE ENV VARIABLE (DO NOT HARDCODE)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "YOUR_GROQ_API_KEY_HERE",
});


// 🔥 PRODUCTION-LEVEL STRUCTURE (MATCHES YOUR NODE CONTENT)
const baseStructure = {
  techId: "",
  readTime: "25–30 min",
  difficulty: "Beginner to Advanced",
  lastUpdated: "2026",

  openingHook: "",
  introText: [],
  realWorldUsages: [],

  whyLearn: {
    demand: "",
    jobRoles: [],
    whyCompanies: [],
    salaryRange: "",
    careerNote: ""
  },

  howItWorks: {
    intro: "",
    steps: [],
    exampleCode: "",
    flow: [],
    closingNote: ""
  },

  coreConcepts: [],
  prerequisites: [],
  roadmap: [],
  useCases: [],

  projects: {
    beginner: [],
    intermediate: [],
    advanced: []
  },

  mistakes: [],
  interviewQuestions: {
    beginner: [],
    intermediate: [],
    advanced: []
  },

  comparison: {},
  pros: [],
  cons: [],
  futureScope: [],
  actionPlan: []
};

// 🔥 STRONG PROMPT (THIS IS THE KEY)
function buildPrompt(tech) {
  return `
Act as a senior software engineer, technical educator, and SEO strategist with real industry experience.

Your task is to generate HIGH-DEPTH, PRODUCTION-LEVEL learning content for:

👉 TECHNOLOGY: ${tech}

---

🚨 STRICT OUTPUT RULES

* Output ONLY valid JSON
* No markdown
* No explanation
* No extra text
* Follow structure EXACTLY
* DO NOT skip any field
* DO NOT return empty arrays or objects

---

🔥 CONTENT QUALITY STANDARD (VERY IMPORTANT)

You are NOT writing a tutorial.

You are writing:
👉 A COMPLETE LEARNING + JOB PREPARATION PAGE

Every section MUST include:

* WHAT it is
* WHY it matters
* HOW it is used in real systems

---

🧠 WRITING STYLE (MANDATORY)

* Write like a real developer teaching a fresher
* Avoid generic definitions
* Avoid textbook explanations
* Avoid repetition
* Avoid filler content
* Use practical, real-world explanations
* Add insights developers learn from real experience

---

💣 DEPTH ENFORCEMENT

* Minimum total depth: 2000–3000 words
* Each section must be detailed (NOT short)
* Each explanation must include:
  👉 real-world usage
  👉 system-level thinking
  👉 practical developer insight

---

📄 SECTION REQUIREMENTS (DO NOT SKIP ANY)

openingHook:

* Must be strong and job-focused
* Explain how ${tech} helps get hired faster
* Must feel persuasive and real (NOT generic)

---

introText:

* Minimum 3 detailed paragraphs
* Explain:

  * what ${tech} is
  * where it is used
  * why it became popular
  * real company usage

---

realWorldUsages:

* Minimum 5 examples
* Use REAL systems:

  * Netflix
  * Uber
  * Instagram
  * Google
  * Amazon
* Explain HOW ${tech} is used (not just mention)

---

whyLearn:

* Include:

  * demand explanation (India + global)
  * 5 job roles with short explanation
  * why companies prefer it (technical reason)
  * salary range (India + global realistic numbers)
  * career growth path

---

howItWorks:

* Step-by-step explanation
* Include:

  * analogy
  * execution flow
  * real system explanation
  * code example
* Make it intuitive and practical

---

coreConcepts:

* Minimum 6–8 concepts
* EACH concept MUST include:

  * explanation (deep, not basic)
  * code example
  * real-world usage
  * WHY it matters
  * common mistake + fix

---

prerequisites:

* Keep realistic (no overload)

---

roadmap:

* Beginner / Intermediate / Advanced

Each must include:

* topics to learn
* what to build (REAL projects)

---

useCases:

* Minimum 5
* Must explain:

  * real-world usage
  * why ${tech} is chosen

---

projects:

* Beginner: 3–4
* Intermediate: 3–4
* Advanced: 2–3

🚨 IMPORTANT:

* DO NOT include basic projects like calculator or simple todo
* Projects must simulate real-world systems

---

mistakes:

* Minimum 8–10 mistakes
* EACH must include:

  * why it happens
  * real-world impact
  * how to fix

---

interviewQuestions:

* Minimum 20–25 questions

* Include:

  * beginner
  * intermediate
  * advanced
  * scenario-based questions

* Answers must be short but meaningful

---

comparison:

* Compare with 1–2 technologies
* Include real differences (not generic)

---

pros:

* Minimum 5 strong points

cons:

* Minimum 5 realistic drawbacks

---

futureScope:

* Minimum 4–5 points
* Include industry trends (AI, backend, data, etc.)

---

actionPlan:

* Step-by-step roadmap to become job-ready
* Practical and realistic

---

🔍 SEO REQUIREMENTS (MANDATORY)

Use these naturally 5–8 times:

* "${tech} tutorial for beginners"
* "Learn ${tech} step by step"
* "${tech} roadmap 2026"
* "${tech} interview questions"

---

🚫 STRICTLY FORBIDDEN

* Generic sentences
* Shallow explanations
* Repetition
* Skipping depth
* Empty sections

---

🎯 FINAL EXPECTATION

The output must feel like:

👉 A real developer preparing someone for a job
NOT
👉 A basic tutorial website

---

Return ONLY valid JSON.
`;
}



function validateContent(data) {
  if (!data.introText || data.introText.length < 2) {
    throw new Error("Weak intro");
  }

  if (!data.coreConcepts || data.coreConcepts.length < 5) {
    throw new Error("Weak core concepts");
  }

  if (!data.interviewQuestions || data.interviewQuestions.length < 10) {
    throw new Error("Weak interview section");
  }

  if (!data.useCases || data.useCases.length < 3) {
    throw new Error("Weak use cases");
  }

  return true;
}


// 🔁 RETRY SYSTEM
async function generateWithRetry(tech, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: buildPrompt(tech) }],
        temperature: 0.6,
        max_tokens: 8000,
      });

      const raw = res.choices[0]?.message?.content || "";

      // Improved JSON extraction: find the first { and last }
      let jsonStr = "";
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = raw.substring(firstBrace, lastBrace + 1);
      } else {
        jsonStr = raw;
      }

      const parsed = JSON.parse(jsonStr.trim());

      // 🔥 VALIDATION
      validateContent(parsed);

      return parsed;

    } catch (err) {
      console.error(`Retry ${i + 1} failed: ${err.message}`);

      // If rate limited, wait longer before next attempt
      if (err.message.includes("429") || err.message.includes("Rate limit")) {
        console.log("Rate limit hit, waiting 40 seconds...");
        await new Promise(resolve => setTimeout(resolve, 40000));
      } else {
        // Shorter delay for other errors
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (i === retries - 1) throw err;
    }
  }
}

// 🧱 MERGE WITH STRUCTURE
function mergeWithBase(base, aiData, tech) {
  const result = { ...base };

  for (let key in base) {
    if (aiData[key] !== undefined) {
      result[key] = aiData[key];
    }
  }

  result.techId = tech.toLowerCase().replace(/\s+/g, "-");

  return result;
}

function transformToTechContent(data, tech) {
  return {
    techId: tech.toLowerCase().replace(/\s+/g, "-"),
    readTime: data.readTime || "25–30 min",
    difficulty: data.difficulty || "Beginner to Advanced",
    lastUpdated: "2026",

    openingHook: data.openingHook || "",

    introText: data.introText || [],
    realWorldUsages: data.realWorldUsages || [],

    whyLearn: {
      demand: data.whyLearn?.demand || "",
      jobRoles: data.whyLearn?.jobRoles || [],
      whyCompanies: data.whyLearn?.whyCompanies || [],
      salaryRange: data.whyLearn?.salaryRange || "",
      careerNote: data.whyLearn?.careerNote || ""
    },

    // 🔥 FIXED STRUCTURE
    howItWorks: {
      intro: data.howItWorks?.intro || "",
      vdomSteps: data.howItWorks?.steps || [],
      componentCode: data.howItWorks?.exampleCode || "",
      renderCycle: data.howItWorks?.flow || [],
      closingNote: data.howItWorks?.closingNote || ""
    },

    coreConcepts: (data.coreConcepts || []).map((item, index) => ({
      id: `${index + 1}`,
      number: `${index + 1}`,
      title: item.title || "",
      icon: "⚡",
      color: "blue",
      intro: item.explanation || "",
      code: item.code || "",
      usage: item.usage || "",
      mistake: item.mistake || {}
    })),

    prerequisites: (data.prerequisites || []).map(p => ({
      item: p.item || "",
      done: false,
      note: p.detail || "",
      detail: p.detail || ""
    })),

    roadmap: (data.roadmap || []).map(r => ({
      phase: r.phase || "",
      label: r.phase || "",
      duration: "2–4 weeks",
      color: "blue",
      topics: r.topics || [],
      buildProjects: r.projects || []
    })),

    useCases: (data.useCases || []).map((u, i) => ({
      num: `${i + 1}`,
      title: u.title || "",
      body: u.description || ""
    })),

    projects: {
      beginner: data.projects?.beginner || [],
      intermediate: data.projects?.intermediate || [],
      advanced: data.projects?.advanced || []
    },

    mistakes: (data.mistakes || []).map(m => ({
      title: m.title || "",
      tip: m.fix || "",
      explanation: m.reason || ""
    })),

    interviewQuestions: data.interviewQuestions || {
      beginner: [],
      intermediate: [],
      advanced: []
    },

    comparison: data.comparison || {
      headers: [],
      rows: []
    },

    pros: data.pros || [],
    cons: data.cons || [],
    futureScope: data.futureScope || [],
    actionPlan: (data.actionPlan || []).map((a, i) => ({
      week: `${i + 1}`,
      title: a.step || "",
      desc: a.description || ""
    }))


  };
}


// 🚀 MAIN ENDPOINT
app.post("/generate", async (req, res) => {
  try {
    const { tech } = req.body;

    if (!tech) {
      return res.status(400).json({ error: "Tech is required" });
    }

    console.log(`🚀 Generating: ${tech}`);

    const aiData = await generateWithRetry(tech);
    const finalData = transformToTechContent(aiData, tech);
    res.json(finalData);


  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Generation failed",
      details: error.message
    });
  }
});

// 💼 JOB SCRAPING ENDPOINT
app.post("/scrape-jobs", async (req, res) => {
  try {
    const { keywords, location } = req.body;

    if (!keywords) {
      return res.status(400).json({ error: "Keywords are required" });
    }

    console.log(`🔍 Scraping jobs for: ${keywords} in ${location || 'India'}`);

    const jobs = await jobsScraper.scrapeAll(keywords, location || 'India');
    
    console.log(`✅ Found ${jobs.length} jobs`);

    // 💾 SAVE TO OUTPUT FILE
    const outputPath = path.join(process.cwd(), "jobs_results.json");
    fs.writeFileSync(outputPath, JSON.stringify(jobs, null, 2));
    console.log(`📂 Results saved to: ${outputPath}`);

    res.json({
      total: jobs.length,
      jobs: jobs,
      savedTo: "jobs_results.json"
    });

  } catch (error) {
    console.error('Job Scrape Endpoint Error:', error);
    res.status(500).json({
      error: "Scraping failed",
      details: error.message
    });
  }
});

// 🎬 REEL AUDIO ENDPOINT
app.post("/generate-reel-audio", async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: "Topic is required" });
    }

    console.log(`🎬 Generating Reel Script for: ${topic}`);

    const prompt = `Write a viral 40-second Instagram Reel / YouTube Shorts script about: ${topic}.
It should be highly engaging for developers or beginners.
Format constraints:
- Plain text ONLY. NO markdown, NO hashtags, NO emojis, NO staging instructions.
- ONLY the exact words the narrator will speak.
- VERY IMPORTANT: Make it sound extremely conversational and human-like to help the Text-to-Speech engine sound less robotic. 
- Use commas, dashes, and ellipses (...) to force natural pauses, rhythm, and breaths. 
- Use conversational openers like "Look," "So,", "Listen..." where appropriate.
- Keep it under 80 words so it takes ~30-40 seconds to read.`;

    const groqRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });

    const scriptText = groqRes.choices[0]?.message?.content?.trim() || "";

    // Helper to split text into chunks of max 300 chars
    const chunks = [];
    let remaining = scriptText;
    while (remaining.length > 0) {
      if (remaining.length <= 300) {
        chunks.push(remaining);
        break;
      }
      let chunk = remaining.substring(0, 300);
      let lastStop = Math.max(chunk.lastIndexOf('.'), chunk.lastIndexOf('?'), chunk.lastIndexOf('!'), chunk.lastIndexOf(','));
      if (lastStop === -1) lastStop = chunk.lastIndexOf(' ');
      
      const cutAt = lastStop !== -1 ? lastStop + 1 : 300;
      chunks.push(remaining.substring(0, cutAt).trim());
      remaining = remaining.substring(cutAt).trim();
    }

    const outputDir = path.join(process.cwd(), "output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const filename = `reel_${topic.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}.mp3`;
    const outputPath = path.join(outputDir, filename);

    console.log(`🎤 Generating Jessie Audio (${chunks.length} segments)...`);
    
    let combinedAudio = Buffer.alloc(0);

    for (let i = 0; i < chunks.length; i++) {
      const ttsRes = await axios.post('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        text: chunks[i],
        voice: "en_us_001" // Jessie
      });

      if (ttsRes.data?.data) {
        combinedAudio = Buffer.concat([combinedAudio, Buffer.from(ttsRes.data.data, 'base64')]);
      } else {
        throw new Error(ttsRes.data?.error || "TikTok API failure at segment " + (i+1));
      }
      // Small pause to prevent rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    fs.writeFileSync(outputPath, combinedAudio);

    console.log(`✅ Reel audio generated at ${outputPath}`);

    res.json({
      topic,
      script: scriptText,
      audioFile: filename
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Reel generation failed",
      details: error.message
    });
  }
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

app.listen(5000, () => {
  console.log("Server running on http://localhost:5000");
});


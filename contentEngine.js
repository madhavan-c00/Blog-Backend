import Groq from "groq-sdk";
import { MsEdgeTTS, OUTPUT_FORMAT } from "edge-tts-node";
import { db } from './firebase.js';
import { collection, query, where, getDocs, updateDoc, doc, limit } from "firebase/firestore";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

class ContentEngine {
  constructor() {
    this.outputDir = path.join(__dirname, 'output', 'reels');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    // High-quality Neutral Neural Voice
    this.tts = new MsEdgeTTS({ enableLogger: false });
  }

  async generateAIContent(job) {
    const prompt = `
      As a tech recruiter, generate structured SEO content for this job.
      TITLE: ${job.title}
      COMPANY: ${job.company}
      DESCRIPTION: ${job.description}
      
      Return ONLY a JSON object with:
      - summary: 2-3 lines overview.
      - skills: Array of 5 technical skills.
      - responsibilities: Array of 4 tasks.
      - whyApply: 1 sentence value prop.
      - interviewQuestions: Array of 3 questions.
      - reelScript: Under 20 words for overlay.
    `;

    try {
      const chatCompletion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" }
      });

      return JSON.parse(chatCompletion.choices[0].message.content);
    } catch (e) {
      console.error(`Groq AI Error for ${job.title}:`, e.message);
      return null;
    }
  }

  generateReelScript(jobs) {
    const day = new Date().getDate();
    const hooks = [
      "🚨 Freshers! Jobs are closing fast — apply now!",
      "🔥 Stop scrolling! This is for freshers only!",
      "🚀 Freshers, your first IT job starts here!",
      "😱 These companies are hiring right now — don’t miss this!",
      "🎯 Freshers in IT, this is for you!",
      "👀 You won’t believe who’s hiring freshers!",
      "💼 Want your first job in IT? Watch this!",
      "😤 Still not getting a job? Watch this!",
      "📢 Big hiring update for freshers!",
      "⚡ 5 fresher jobs in 30 seconds — go!"
    ];

    const variations = ["is hiring for", "is looking for", "has openings for", "is recruiting for"];
    const ctas = ["👉 Link in bio – Apply now!", "🚀 Apply now before it's gone!", "📢 Don’t miss out – Apply today!", "⚡ Apply fast – limited openings!"];

    const hook = hooks[day % hooks.length];
    const cta = ctas[day % ctas.length];
    const selectedJobs = jobs.slice(0, 6);

    let script = `${hook}\n\n`;
    selectedJobs.forEach((job, index) => {
      const phrase = variations[index % variations.length];
      script += `${job.company} ${phrase} ${job.title}.\n`;
    });
    script += `\n${cta}`;
    return script.trim();
  }

  async generateAudio(text, filename) {
    try {
      const filepath = path.join(this.outputDir, filename);
      // "en-IN-NeerjaNeural" is the best high-quality Indian English voice
      await this.tts.setMetadata("en-IN-NeerjaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      await this.tts.toFile(filepath, text);
      
      console.log(`🔊 Neural Audio created: ${filename}`);
      return filepath;
    } catch (err) {
      console.error(`TTS Error:`, err);
      throw err;
    }
  }

  async processBatch(batchNumber) {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`🚀 Content Engine: Processing Batch ${batchNumber} for ${todayStr} (Neural Voice)...`);
    
    const subColPath = `daily_jobs/${todayStr}/batch_${batchNumber}`;
    const batchRef = collection(db, subColPath);
    
    const q = query(
      batchRef, 
      where("status", "==", "pending"),
      limit(10)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log(`No pending jobs found in ${subColPath}`);
      return;
    }

    const processedJobs = [];

    for (const document of snapshot.docs) {
      const job = document.data();
      console.log(`✍️ Generating Website Content: ${job.title} @ ${job.company}`);
      
      const aiContent = await this.generateAIContent(job);
      
      if (aiContent) {
        const jobDoc = doc(db, subColPath, document.id);
        await updateDoc(jobDoc, {
          aiContent,
          status: "posted",
          contentGenerated: true
        });
        
        processedJobs.push({ ...job, id: document.id });
        console.log(`✅ Job Data Ready.`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (processedJobs.length > 0) {
      console.log(`\n🎬 Generating Neutral Master Reel Audio...`);
      const masterScript = this.generateReelScript(processedJobs);
      const audioFilename = `batch_${batchNumber}_master_reel.mp3`;
      await this.generateAudio(masterScript, audioFilename);
      
      console.log(`\n✨ Master Script:\n"${masterScript}"`);
    }

    console.log(`\n✨ Batch ${batchNumber} Processed.`);
  }
}

const batchNum = process.argv[2];
if (!batchNum) {
  console.error("Batch number required (1, 2, or 3)");
} else {
  const engine = new ContentEngine();
  engine.processBatch(batchNum);
}

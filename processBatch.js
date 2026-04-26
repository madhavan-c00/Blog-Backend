import { db } from "./firebase.js";
import { doc, getDoc, updateDoc, collection, getDocs, setDoc } from "firebase/firestore";
import axios from "axios";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { hooks, bodies, ctas } from "./reelTemplates.js";

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function generateContent(job) {
  console.log(`   📝 Generating Web Content for: ${job.title}...`);
  const prompt = `Generate high-depth, professional learning content for this job role: ${job.title} at ${job.company}.
Output ONLY valid JSON matching this structure:
{
  "openingHook": "Strong, job-focused intro",
  "introText": ["Paragraph 1", "Paragraph 2"],
  "whyLearn": { "demand": "Current market demand", "salaryRange": "Realistic range" },
  "howItWorks": { "steps": ["Step 1", "Step 2"] },
  "coreConcepts": [{ "title": "Concept", "explanation": "Deep dive" }],
  "interviewQuestions": { "beginner": [], "advanced": [] }
}
Job Description: ${job.description}`;

  const res = await groq.chat.completions.create({
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    response_format: { type: "json_object" }
  });

  return JSON.parse(res.choices[0].message.content);
}

import ffmpeg from "fluent-ffmpeg";

async function generateBatchReel(jobs, batchId) {
  console.log(`   🎬 Producing Single Batch Reel for: ${batchId}...`);
  
  // 1. Template-based Script (Randomized from reelTemplates.js)
  const selectedHook = hooks[Math.floor(Math.random() * hooks.length)];
  const selectedCta = ctas[Math.floor(Math.random() * ctas.length)];
  
  const jobSentences = jobs.map(j => {
    const randomBodyFunc = bodies[Math.floor(Math.random() * bodies.length)];
    return randomBodyFunc(j.title, j.company);
  });

  const sentences = [selectedHook, ...jobSentences, selectedCta];
  const script = sentences.join(". ");

  // 2. Generate Audio (with chunking)
  let combinedAudio = Buffer.alloc(0);
  for (const sentence of sentences) {
    if (sentence.length < 2) continue;
    const ttsRes = await axios.post('https://tiktok-tts.weilnet.workers.dev/api/generation', {
      text: sentence.substring(0, 290),
      voice: "en_us_001"
    });
    if (ttsRes.data?.data) {
      combinedAudio = Buffer.concat([combinedAudio, Buffer.from(ttsRes.data.data, 'base64')]);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  const outputDir = path.join(process.cwd(), "output", "reels");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const today = new Date().toISOString().split('T')[0];
  const audioPath = path.join(outputDir, `audio_${batchId}_${today}.mp3`);
  const srtPath = path.join(outputDir, `subs_${batchId}_${today}.srt`);
  const videoOutputPath = path.join(outputDir, `reel_${batchId}_${today}.mp4`);
  const baseVideoPath = path.join(process.cwd(), "Generate_Video_From_Image.mp4");

  fs.writeFileSync(audioPath, combinedAudio);

  // 3. Generate SRT Subtitles
  let srtContent = "";
  let currentTime = 0;
  sentences.forEach((s, i) => {
    const duration = Math.max(2.5, (s.length / 14));
    const startTimeStr = new Date(currentTime * 1000).toISOString().substr(11, 12).replace('.', ',');
    currentTime += duration;
    const endTimeStr = new Date(currentTime * 1000).toISOString().substr(11, 12).replace('.', ',');
    srtContent += `${i + 1}\n${startTimeStr} --> ${endTimeStr}\n${s.trim()}\n\n`;
  });

  const tempSrtPath = path.join(process.cwd(), "temp_subs.srt");
  fs.writeFileSync(tempSrtPath, srtContent);
  fs.writeFileSync(srtPath, srtContent); // Keep a copy in the reels folder too

  // 4. FFmpeg Magic
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(baseVideoPath)
      .inputOptions(['-stream_loop -1']) 
      .input(audioPath)
      .videoFilters('subtitles=temp_subs.srt')
      .outputOptions([
        '-shortest',
        '-c:v libx264',
        '-preset fast',
        '-pix_fmt yuv420p',
        '-map 1:a:0'
      ])
      .save(videoOutputPath)
      .on('end', () => {
        console.log(`   ✅ Batch Video Created: reel_${batchId}.mp4`);
        if (fs.existsSync(tempSrtPath)) fs.unlinkSync(tempSrtPath);
        resolve({ script, videoFile: `reel_${batchId}_${today}.mp4` });
      })
      .on('error', (err) => {
        console.error("   ❌ FFmpeg Error:", err.message);
        if (fs.existsSync(tempSrtPath)) fs.unlinkSync(tempSrtPath);
        reject(err);
      });
  });
}

async function processBatch() {
  const batchId = process.argv[2];
  const today = new Date().toISOString().split('T')[0];

  console.log(`🚀 [PROCESS] Starting Batch: ${batchId} for ${today}`);

  // Fetch all job documents from the batch sub-collection
  const batchCollectionRef = collection(db, "daily_batches", today, batchId);
  const querySnapshot = await getDocs(batchCollectionRef);

  if (querySnapshot.empty) {
    console.error(`❌ No jobs found for ${batchId} on ${today}.`);
    return;
  }

  const jobs = [];
  querySnapshot.forEach((doc) => {
    jobs.push({ id: doc.id, ...doc.data() });
  });

  // 1. Process Individual Web Content
  const processedJobs = [];
  for (const job of jobs) {
    try {
      const webContent = await generateContent(job);
      const jobData = { ...job, webContent, processed: true, processedAt: new Date().toISOString() };
      processedJobs.push(jobData);

      // Update individual job document
      const jobDocRef = doc(db, "daily_batches", today, batchId, job.id);
      await updateDoc(jobDocRef, jobData);
      
      console.log(`   ✅ Success: ${job.title}`);
      await new Promise(r => setTimeout(r, 3000)); // Increased to 3s to avoid rate limits
    } catch (err) {
      console.error(`   ❌ Failed: ${job.title} - Error: ${err.message}`);
    }
  }

  // 2. Generate ONE Video for the entire batch
  let reelData = null;
  try {
    reelData = await generateBatchReel(processedJobs, batchId);

    // Save video info in the parent date document
    const dateDocRef = doc(db, "daily_batches", today);
    await updateDoc(dateDocRef, {
      [`${batchId}_video`]: reelData
    });
  } catch (err) {
    console.error("   ❌ Failed to generate Batch Reel");
  }

  console.log(`✅ ${batchId} processing complete! Data updated in individual docs.`);
}

processBatch();

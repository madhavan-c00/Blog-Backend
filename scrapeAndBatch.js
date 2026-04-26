import { db } from "./firebase.js";
import { doc, setDoc, collection } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

async function scrapeAndBatch() {
  console.log("🚀 [8:00 AM] Starting Scrape & Batch Automation...");

  try {
    // 1. Run existing scraper
    console.log("🔍 Running Scraper...");
    execSync("node jobsScraper.js", { stdio: "inherit" });

    // 2. Read the cleaned jobs
    const rawData = fs.readFileSync(path.join(process.cwd(), "jobs_cleaned.json"), "utf8");
    const allJobs = JSON.parse(rawData);

    // 3. Filter & Sort by quality (Top 30 jobs)
    // Your scraper already sorts by score, so we just take the top 30
    const topJobs = allJobs.slice(0, 30);
    
    if (topJobs.length < 1) {
       console.log("⚠️ No high quality jobs found today.");
       return;
    }

    // 4. Split into Batches (10 each)
    const batches = {
      batch_1: topJobs.slice(0, 10),
      batch_2: topJobs.slice(10, 20),
      batch_3: topJobs.slice(20, 30)
    };

    // 5. Store in Firebase (Each job as a document in a sub-collection)
    const today = new Date().toISOString().split('T')[0];
    const dateDocRef = doc(db, "daily_batches", today);
    
    // Create the base date document
    await setDoc(dateDocRef, { date: today, createdAt: new Date().toISOString() });

    for (const [batchName, jobs] of Object.entries(batches)) {
      console.log(`📦 Posting ${batchName} to DB...`);
      for (const job of jobs) {
        const jobDocRef = doc(db, "daily_batches", today, batchName, job.id);
        await setDoc(jobDocRef, {
          ...job,
          processed: false,
          batchName: batchName
        });
      }
    }

    console.log(`✅ Successfully stored 3 batches for ${today} in Firebase (Job-per-doc structure).`);
  } catch (err) {
    console.error("❌ Scrape & Batch Error:", err.message);
  }
}

scrapeAndBatch();

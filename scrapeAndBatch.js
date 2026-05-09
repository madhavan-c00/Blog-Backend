import { db } from "./firebase.js";
import { doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, Timestamp } from "firebase/firestore";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

async function scrapeAndBatch() {
  console.log("🚀 [SCRAPE] Starting Scrape & Batch Automation (with 48h Deduplication)...");

  try {
    // 1. Run the scraper
    console.log("🔍 Running Scraper...");
    execSync("node jobsScraper.js", { stdio: "inherit" });

    // 2. Read the results
    const rawData = fs.readFileSync(path.join(process.cwd(), "jobs_cleaned.json"), "utf8");
    const scrapedJobs = JSON.parse(rawData);

    if (scrapedJobs.length < 1) {
       console.log("⚠️ No jobs found.");
       return;
    }

    // 3. DEDUPLICATION: Check each job against 'scraped_ids'
    const uniqueNewJobs = [];
    for (const job of scrapedJobs) {
      const globalIdRef = doc(db, "scraped_ids", job.id);
      const globalDoc = await getDoc(globalIdRef);

      if (!globalDoc.exists()) {
        uniqueNewJobs.push(job);
        await setDoc(globalIdRef, { 
          id: job.id, 
          scrapedAt: new Date().toISOString(),
          // Use a numeric timestamp for easier cleanup querying
          timestamp: Date.now() 
        });
      }
    }

    console.log(`✅ Found ${uniqueNewJobs.length} NEW jobs.`);

    if (uniqueNewJobs.length > 0) {
      // 4. Create batches for today
      const topJobs = uniqueNewJobs.slice(0, 30);
      const batches = {
        batch_1: topJobs.slice(0, 10),
        batch_2: topJobs.slice(10, 20),
        batch_3: topJobs.slice(20, 30)
      };

      const today = new Date().toISOString().split('T')[0];
      const dateDocRef = doc(db, "daily_batches", today);
      await setDoc(dateDocRef, { date: today, createdAt: new Date().toISOString() }, { merge: true });

      for (const [batchName, jobs] of Object.entries(batches)) {
        if (jobs.length === 0) continue;
        for (const job of jobs) {
          const jobDocRef = doc(db, "daily_batches", today, batchName, job.id);
          await setDoc(jobDocRef, { ...job, processed: false, batchName }, { merge: true });
        }
      }
    }

    // 5. CLEANUP: Delete IDs older than 2 days (48 hours)
    console.log("🧹 Cleaning up IDs older than 48 hours...");
    const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
    const cleanupQuery = query(collection(db, "scraped_ids"), where("timestamp", "<", fortyEightHoursAgo));
    const oldDocs = await getDocs(cleanupQuery);
    
    let deleteCount = 0;
    for (const oldDoc of oldDocs.docs) {
      await deleteDoc(oldDoc.ref);
      deleteCount++;
    }
    
    if (deleteCount > 0) console.log(`🗑️ Deleted ${deleteCount} expired IDs from database.`);
    else console.log("✨ No expired IDs to clean up.");

    console.log(`✅ Automation cycle complete.`);
  } catch (err) {
    console.error("❌ Scrape & Batch Error:", err.message);
  }
}

scrapeAndBatch();

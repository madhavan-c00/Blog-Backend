import axios from 'axios';
import * as cheerio from 'cheerio';
import UserAgent from 'user-agents';
import { db } from './firebase.js';
import { collection, addDoc, query, where, getDocs, Timestamp } from "firebase/firestore";
import { DateTime } from 'luxon';
import fs from 'fs';
import path from 'path';

class DataEngine {
  constructor() {
    this.ua = new UserAgent({ deviceCategory: 'desktop' });
    this.keywords = ['Software Engineer', 'Frontend Developer', 'Backend Developer', 'Data Analyst', 'QA Tester', 'IT Support'];
    this.location = 'India';
  }

  getHeaders() {
    return {
      'User-Agent': this.ua.toString(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/'
    };
  }

  // Strict IT Filter
  isRelevantJob(title, desc) {
    const text = (title + desc).toLowerCase();
    const allowed = ['developer', 'engineer', 'frontend', 'backend', 'full stack', 'react', 'node', 'java', 'python', 'software', 'data analyst', 'data science', 'testing', 'qa', 'it support', 'mis'];
    const blocked = ['marketing', 'sales', 'hr', 'finance', 'logistics', 'content writer'];

    return allowed.some(k => text.includes(k)) && !blocked.some(k => text.includes(k));
  }

  // Strict Fresher Filter
  isFresher(title, desc) {
    const text = (title + desc).toLowerCase();
    if (/([2-9]\+?\s*(years|yrs))/i.test(text)) return false;
    if (text.includes('senior') || text.includes('lead') || text.includes('manager')) return false;
    return true;
  }

  // Scoring Logic
  scoreJob(title, company, desc) {
    let score = 0;
    const topTier = ['google', 'microsoft', 'amazon', 'coinbase', 'deloitte', 'oracle', 'accenture', 'tcs', 'infosys', 'wipro'];
    if (topTier.some(c => company.toLowerCase().includes(c))) score += 5;
    if (desc.length > 500) score += 2;
    if (title.toLowerCase().includes('engineer')) score += 1;
    return score;
  }

  async scrapeLinkedIn(keyword) {
    const jobs = [];
    const pages = [0, 25, 50]; // Fetch multiple pages for high volume

    try {
      for (const start of pages) {
        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(this.location)}&f_TPR=r86400&f_E=1%2C2&start=${start}`;
        console.log(`📡 Fetching ${keyword} (Page ${start / 25 + 1})...`);

        const response = await axios.get(url, { headers: this.getHeaders(), timeout: 15000 });
        const $ = cheerio.load(response.data);
        const listItems = $('li');

        if (listItems.length === 0) break;

        for (let i = 0; i < listItems.length; i++) {
          const el = listItems[i];
          const title = $(el).find('.base-search-card__title').text().trim();
          const company = $(el).find('.base-search-card__subtitle').text().trim();
          const link = $(el).find('a.base-card__full-link').attr('href')?.split('?')[0];

          if (title && company && link) {
            const jobId = link.split('-').pop();
            const details = await this.fetchShortDetails(jobId);

            if (this.isRelevantJob(title, details) && this.isFresher(title, details)) {
              jobs.push({
                id: jobId,
                title,
                company,
                location: $(el).find('.job-search-card__location').text().trim(),
                link,
                description: details.substring(0, 1000), // Slightly longer description
                score: this.scoreJob(title, company, details),
                category: this.detectCategory(title, details)
              });
              console.log(`📝 Added [${jobs.length}]: ${title}`);
            }
            await new Promise(r => setTimeout(r, 800));
          }
          if (jobs.length >= 50) break;
        }
        if (jobs.length >= 50) break;
      }
    } catch (e) {
      console.error(`Scrape Error [${keyword}]:`, e.message);
    }
    return jobs;
  }

  async fetchShortDetails(jobId) {
    try {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
      const res = await axios.get(url, { headers: this.getHeaders(), timeout: 10000 });
      const $ = cheerio.load(res.data);
      return $('.description__text').text().trim();
    } catch {
      return '';
    }
  }

  detectCategory(title, desc) {
    const text = (title + desc).toLowerCase();
    if (text.includes('frontend') || text.includes('react')) return 'frontend';
    if (text.includes('backend') || text.includes('node')) return 'backend';
    if (text.includes('full stack')) return 'fullstack';
    if (text.includes('data')) return 'data';
    if (text.includes('testing') || text.includes('qa')) return 'testing';
    return 'support';
  }

  async run() {
    console.log("🚀 Data Engine Started: Ingesting Fresh Jobs...");
    let allJobs = [];

    for (const kw of this.keywords) {
      console.log(`🔍 Searching: ${kw}`);
      const batch = await this.scrapeLinkedIn(kw);
      allJobs = [...allJobs, ...batch];
    }

    // Deduplicate by Title + Company
    const uniqueJobs = Array.from(new Map(allJobs.map(j => [`${j.title}-${j.company}`.toLowerCase(), j])).values());

    // Sort by Score
    uniqueJobs.sort((a, b) => b.score - a.score);

    // Split into 3 Batches
    const batchSize = Math.ceil(uniqueJobs.length / 3);
    const batches = {
      1: uniqueJobs.slice(0, batchSize),
      2: uniqueJobs.slice(batchSize, batchSize * 2),
      3: uniqueJobs.slice(batchSize * 2)
    };

    console.log(`📦 Distribution: B1:${batches[1].length}, B2:${batches[2].length}, B3:${batches[3].length}`);

    // New Structured Storage: daily_jobs/{date}/batch_{n}
    const todayStr = DateTime.now().toISODate(); // e.g. 2026-04-25

    for (const bKey in batches) {
      const subColPath = `daily_jobs/${todayStr}/batch_${bKey}`;
      const batchRef = collection(db, subColPath);

      console.log(`💾 Saving ${batches[bKey].length} jobs to ${subColPath}...`);

      for (const job of batches[bKey]) {
        try {
          await addDoc(batchRef, {
            ...job,
            status: "pending",
            contentGenerated: false,
            createdAt: Timestamp.now()
          });
        } catch (e) {
          console.error(`Firestore Error [Batch ${bKey}]:`, e.message);
        }
      }
    }

    console.log("✅ Data Engine Finished: Jobs Pushed to Date-Based Batches.");
  }
}

const engine = new DataEngine();
engine.run();

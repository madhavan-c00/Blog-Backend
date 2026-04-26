import axios from 'axios';
import * as cheerio from 'cheerio';
import UserAgent from 'user-agents';
import fs from 'fs';
import path from 'path';

class JobsScraper {
  constructor() {
    this.ua = new UserAgent({ deviceCategory: 'desktop' });
  }

  getHeaders() {
    return {
      'User-Agent': this.ua.toString(),
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.google.com/'
    };
  }

  // =========================
  // 🔥 FILTER: IT ROLES ONLY
  // =========================

  isRelevantJob(job) {
    const text = (job.title + (job.description || '')).toLowerCase();

    const dev = [
      'developer','engineer','frontend','backend','full stack',
      'react','node','java','python','software'
    ];

    const data = [
      'data analyst','data science','machine learning','sql','analytics'
    ];

    const qa = [
      'testing','qa','tester','automation','selenium','manual testing'
    ];

    const support = [
      'technical support','it support','help desk','system support'
    ];

    const ops = [
      'mis','it operations','system admin','administrator'
    ];

    const blocked = [
      'marketing','sales','hr','finance','logistics','content writer'
    ];

    const isAllowed =
      dev.some(k => text.includes(k)) ||
      data.some(k => text.includes(k)) ||
      qa.some(k => text.includes(k)) ||
      support.some(k => text.includes(k)) ||
      ops.some(k => text.includes(k));

    const isBlocked = blocked.some(k => text.includes(k));

    return isAllowed && !isBlocked;
  }

  // =========================
  // 👶 FILTER: FRESHER ONLY
  // =========================

  isFresher(job) {
    const text = (job.title + (job.description || '')).toLowerCase();

    if (/([2-9]\+?\s*(years|yrs))/i.test(text)) return false;

    return true;
  }

  // =========================
  // 🔁 DEDUPE
  // =========================

  dedupeJobs(jobs) {
    const seen = new Set();

    return jobs.filter(job => {
      const key = job.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // =========================
  // 🧹 CLEAN DESCRIPTION
  // =========================

  cleanDescription(desc) {
    if (!desc) return '';

    return desc
      .replace(/\s+/g, ' ')
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .trim()
      .slice(0, 800);
  }

  // =========================
  // 🏷️ CATEGORY
  // =========================

  getCategory(job) {
    const text = (job.title + (job.description || '')).toLowerCase();

    if (text.includes('frontend') || text.includes('react')) return 'frontend';
    if (text.includes('backend') || text.includes('node')) return 'backend';
    if (text.includes('full stack')) return 'fullstack';

    if (text.includes('data') || text.includes('analytics')) return 'data';
    if (text.includes('testing') || text.includes('qa')) return 'testing';

    if (text.includes('support')) return 'support';
    if (text.includes('mis') || text.includes('operations')) return 'operations';

    return 'other';
  }

  // =========================
  // 🏷️ TAG EXTRACTION
  // =========================

  extractTags(job) {
    const text = (job.title + (job.description || '')).toLowerCase();
    const tags = [];

    const techKeywords = [
      'react','node','java','python','sql','mongodb',
      'aws','docker','angular','next'
    ];

    techKeywords.forEach(k => {
      if (text.includes(k)) tags.push(k);
    });

    return tags;
  }

  // =========================
  // ⭐ SCORING
  // =========================

  scoreJob(job) {
    let score = 0;

    const topCompanies = [
      'coinbase','american express','oracle','deloitte'
    ];

    if (topCompanies.some(c => job.company.toLowerCase().includes(c))) score += 3;
    if ((job.description || '').length > 300) score += 1;
    if (job.title.toLowerCase().includes('engineer')) score += 1;

    return score;
  }

  // =========================
  // 🔍 SCRAPE LINKEDIN
  // =========================

  async scrapeLinkedIn(keyword, location) {
    const jobs = [];
    const pages = [0, 25];

    for (const start of pages) {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&f_TPR=r86400&f_E=1%2C2&start=${start}`;

      try {
        console.log(`📡 Fetching LinkedIn: ${keyword} (Page ${start/25 + 1})`);
        const response = await axios.get(url, {
          headers: this.getHeaders(),
          timeout: 15000
        });

        const $ = cheerio.load(response.data);
        const listItems = $('li');

        for (let i = 0; i < listItems.length; i++) {
          const el = listItems[i];

          const title = $(el).find('.base-search-card__title').text().trim();
          const company = $(el).find('.base-search-card__subtitle').text().trim();
          const loc = $(el).find('.job-search-card__location').text().trim();
          const link = $(el).find('a.base-card__full-link').attr('href');

          if (!title || !company || !link) continue;

          const jobId = link.split('?')[0].split('-').pop();

          console.log(`📝 Detailing [${i+1}]: ${title.substring(0,30)}...`);
          const details = await this.fetchDetails(jobId);

          const job = {
            id: jobId,
            title,
            company,
            location: loc,
            link: link.split('?')[0],
            description: this.cleanDescription(details.description),
            source: 'LinkedIn',
            posted: new Date().toISOString()
          };

          // 🔥 APPLY PIPELINE
          if (!this.isRelevantJob(job)) {
             console.log("⏩ Skipping: Non-IT role");
             continue;
          }
          if (!this.isFresher(job)) {
             console.log("⏩ Skipping: Not a fresher role");
             continue;
          }

          job.category = this.getCategory(job);
          job.tags = this.extractTags(job);
          job.score = this.scoreJob(job);

          jobs.push(job);

          await new Promise(r => setTimeout(r, 1000)); // Increased delay to avoid 429
        }
      } catch (err) {
        if (err.response && err.response.status === 429) {
          console.error("⛔ LinkedIn blocked us (429). Waiting 30 seconds...");
          await new Promise(r => setTimeout(r, 30000));
        } else {
          console.error(`Error: ${err.message}`);
        }
      }
    }

    return jobs;
  }

  async fetchDetails(jobId) {
    try {
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
      const res = await axios.get(url, {
        headers: this.getHeaders(),
        timeout: 10000
      });

      const $ = cheerio.load(res.data);

      return {
        description: $('.description__text').text().trim()
      };
    } catch {
      return { description: '' };
    }
  }

  // =========================
  // 🚀 MAIN PIPELINE
  // =========================

  async run() {
    console.log("\n🚀 Smart Job Pipeline Started\n");

    const keywords = [
      'Software Engineer',
      'Frontend Developer',
      'Backend Developer',
      'Data Analyst',
      'QA Tester',
      'IT Support'
    ];

    let allJobs = [];

    for (const kw of keywords) {
      console.log(`🔍 CATEGORY: ${kw}`);
      const jobs = await this.scrapeLinkedIn(kw, 'India');
      allJobs = [...allJobs, ...jobs];

      await new Promise(r => setTimeout(r, 3000)); 
    }

    console.log(`\n📦 Raw Jobs Found: ${allJobs.length}`);

    // 🔁 DEDUPE
    const uniqueJobs = this.dedupeJobs(allJobs);

    // ⭐ SORT
    uniqueJobs.sort((a, b) => b.score - a.score);

    console.log(`✅ Final Filtered Jobs: ${uniqueJobs.length}`);

    // 💾 SAVE
    const filePath = path.join(process.cwd(), 'jobs_cleaned.json');
    fs.writeFileSync(filePath, JSON.stringify(uniqueJobs, null, 2));

    console.log(`📁 Saved to: ${filePath}\n`);
  }
}

const scraper = new JobsScraper();
scraper.run();

import { db } from "./firebase.js";
import { collection, getDocs } from "firebase/firestore";
import { hooks } from "./reelTemplates.js";
import axios from "axios";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import FormData from "form-data";
import dotenv from "dotenv";

dotenv.config();

async function generateTikTokAudioSegment(text, outputPath) {
    const res = await axios.post('https://tiktok-tts.weilnet.workers.dev/api/generation', {
        text: text.substring(0, 300),
        voice: "en_us_001"
    });
    if (res.data?.data) {
        fs.writeFileSync(outputPath, Buffer.from(res.data.data, 'base64'));
        return true;
    }
    return false;
}

function getAudioDuration(filePath) {
    try {
        const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`).toString();
        return parseFloat(output);
    } catch (e) {
        return 0;
    }
}

async function sendToTelegram(videoPath, caption) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.error("❌ Telegram credentials missing in .env");
        return;
    }

    console.log(`📤 Sending Reel to Telegram...`);
    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('video', fs.createReadStream(videoPath));
        form.append('caption', caption);

        const res = await axios.post(`https://api.telegram.org/bot${token}/sendVideo`, form, {
            headers: { ...form.getHeaders() },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (res.data?.ok) {
            console.log("✅ Reel successfully sent to Telegram!");
        } else {
            console.error("❌ Telegram API error:", res.data);
        }
    } catch (e) {
        console.error("❌ Failed to send to Telegram:", e.message);
    }
}

async function createBatchReel(jobs, date, batchName, videoTemplatePath) {
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    const cta = "Apply now. Link in bio.";
    
    const outputDir = path.join(process.cwd(), "output", "reels", `${batchName}_${date}_telegram`);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const segments = [];
    
    // 1. Hook
    const hookAudioRaw = path.join(outputDir, "hook_raw.mp3");
    const hookAudioProcessed = path.join(outputDir, "hook.mp3");
    await generateTikTokAudioSegment(hook, hookAudioRaw);
    execSync(`ffmpeg -y -i "${hookAudioRaw}" -af "atempo=0.95" "${hookAudioProcessed}"`, { stdio: 'ignore' });
    segments.push({ text: hook, audio: hookAudioProcessed, duration: getAudioDuration(hookAudioProcessed) });

    // 2. Jobs
    for (let i = 0; i < jobs.length; i++) {
        const j = jobs[i];
        const jobText = `${j.company} is hiring for ${j.title} in ${j.location || 'India'}`;
        const srtText = `${j.company} hiring for\n${j.title}\n${j.location || 'India'}`;
        
        const rawPath = path.join(outputDir, `job_${i}_raw.mp3`);
        const procPath = path.join(outputDir, `job_${i}.mp3`);
        
        await generateTikTokAudioSegment(jobText, rawPath);
        execSync(`ffmpeg -y -i "${rawPath}" -af "atempo=0.95" "${procPath}"`, { stdio: 'ignore' });
        segments.push({ text: srtText, audio: procPath, duration: getAudioDuration(procPath) });
    }

    // 3. CTA
    const ctaAudioRaw = path.join(outputDir, "cta_raw.mp3");
    const ctaAudioProcessed = path.join(outputDir, "cta.mp3");
    await generateTikTokAudioSegment(cta, ctaAudioRaw);
    execSync(`ffmpeg -y -i "${ctaAudioRaw}" -af "atempo=0.95" "${ctaAudioProcessed}"`, { stdio: 'ignore' });
    segments.push({ text: cta, audio: ctaAudioProcessed, duration: getAudioDuration(ctaAudioProcessed) });

    // 4. Concat
    const concatListPath = path.join(outputDir, "concat.txt");
    const concatContent = segments.map(s => `file '${s.audio.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);
    const finalAudioPath = path.join(outputDir, "final_audio.mp3");
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalAudioPath}"`, { stdio: 'ignore' });

    // 5. SRT
    let currentTime = 0;
    const srtLines = segments.map((s, i) => {
        const formatTime = (seconds) => {
            const date = new Date(0);
            date.setSeconds(seconds);
            const ms = Math.floor((seconds % 1) * 1000);
            return date.toISOString().substring(11, 19) + "," + ms.toString().padStart(3, '0');
        };
        const start = currentTime;
        const end = currentTime + s.duration;
        currentTime = end + 0.1;
        return `${i + 1}\n${formatTime(start)} --> ${formatTime(end)}\n${s.text}\n`;
    });
    fs.writeFileSync(path.join(outputDir, "final.srt"), srtLines.join('\n'));

    // 6. Video
    const srtPath = path.join(outputDir, "final.srt");
    const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const finalVideoPath = path.join(process.cwd(), "output", "reels", `${batchName}_${date}_telegram_reel.mp4`);

    console.log(`🎬 Compiling Telegram Ready Reel...`);
    const cmd = `ffmpeg -y -i "${videoTemplatePath}" -i "${finalAudioPath}" -shortest -vf "subtitles='${escapedSrtPath}':force_style='FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=1,Alignment=2'" -map 0:v -map 1:a -c:v libx264 -preset fast "${finalVideoPath}"`;
    execSync(cmd, { stdio: 'inherit' });
    
    // 7. Send to Telegram
    const caption = `🚀 Batch Reel for ${date} (${batchName})\nJobs included: ${jobs.length}`;
    await sendToTelegram(finalVideoPath, caption);

    // 8. Cleanup - Delete temporary files and folder to save storage
    console.log(`🧹 Cleaning up temporary files for ${batchName}...`);
    try {
        fs.rmSync(outputDir, { recursive: true, force: true });
        console.log(`✅ Cleanup complete.`);
    } catch (e) {
        console.error(`⚠️ Cleanup failed:`, e.message);
    }
}

async function processBatch() {
    const batchName = process.argv[2] || "batch_1";
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`🚀 [REEL] Starting Reel for ${batchName} on ${today}...`);
    
    const batchRef = collection(db, "daily_batches", today, batchName);
    const snap = await getDocs(batchRef);
    const jobs = [];
    snap.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (data.processed) jobs.push(data);
    });

    if (jobs.length === 0) return console.log("⚠️ No jobs.");

    const videoTemplate = path.join(process.cwd(), "YouCut_20260426_205508453.mp4");
    if (!fs.existsSync(videoTemplate)) return console.error("❌ Video not found.");

    await createBatchReel(jobs.slice(0, 5), today, batchName, videoTemplate);
}

processBatch().catch(console.error);

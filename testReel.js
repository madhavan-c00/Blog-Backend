import axios from "axios";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Set your desired voice here:
// en_us_006 = Male 1
// en_us_007 = Male 2
// en_us_009 = Male 3
// en_us_001 = Female 1 (Classic TikTok)
const VOICE = "en_us_006"; // Male Voice

async function generateTikTokAudioSegment(text, outputPath) {
    console.log(`Generating audio for: "${text.substring(0, 50)}..." with voice ${VOICE}`);
    try {
        const res = await axios.post('https://tiktok-tts.weilnet.workers.dev/api/generation', {
            text: text.substring(0, 300),
            voice: VOICE
        });
        if (res.data?.data) {
            fs.writeFileSync(outputPath, Buffer.from(res.data.data, 'base64'));
            return true;
        }
    } catch (e) {
        console.error("Error calling TikTok TTS API:", e.message);
    }
    return false;
}

function getAudioDuration(filePath) {
    try {
        const output = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`).toString();
        return parseFloat(output);
    } catch (e) {
        console.error("Error getting duration:", e.message);
        return 0;
    }
}

async function runTestReel() {
    console.log("🚀 Starting Test Reel Generation...");

    // TEST CONTENT (Mock Jobs)
    const hook = "Top 3 exciting opportunities for freshers hiring this week. Don't miss out!";
    const cta = "Apply right now. The link is in the bio.";
    const jobs = [
        { company: "Google", title: "Software Engineer", location: "Bangalore" },
        { company: "Microsoft", title: "Data Analyst", location: "Hyderabad" },
        { company: "Amazon", title: "Frontend Developer", location: "Remote" }
    ];

    const outputDir = path.join(process.cwd(), "output", "test_reel");
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
        const jobText = `${j.company} is hiring for ${j.title} in ${j.location}`;
        const srtText = `${j.company} hiring for\n${j.title}\n${j.location}`;

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

    // 4. Concat Audio
    console.log("🔗 Concatenating audio segments...");
    const concatListPath = path.join(outputDir, "concat.txt");
    const concatContent = segments.map(s => `file '${s.audio.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);
    const finalAudioPath = path.join(outputDir, "final_audio.mp3");
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalAudioPath}"`, { stdio: 'ignore' });

    // 5. Generate SRT
    console.log("📝 Generating subtitles (SRT)...");
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

    // 6. Generate Final Video using Silent Video Template
    const videoTemplatePath = path.join(process.cwd(), "Final_Video_Silent.mp4");
    if (!fs.existsSync(videoTemplatePath)) {
        console.error("❌ Template video not found at:", videoTemplatePath);
        return;
    }

    const srtPath = path.join(outputDir, "final.srt");
    const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const finalVideoPath = path.join(process.cwd(), "output", "test_reel_FINAL_SILENT_BASE.mp4");

    console.log(`🎬 Compiling Final Test Reel using Silent Template...`);
    
    // Using the silent video as base
    // -map 0:v (video from silent file)
    // -map 1:a (audio from generated TTS)
    const cmd = `ffmpeg -y -i "${videoTemplatePath}" -i "${finalAudioPath}" -map 0:v -map 1:a -c:v libx264 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles='${escapedSrtPath}':force_style='FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2'" "${finalVideoPath}"`;
    
    execSync(cmd, { stdio: 'inherit' });
    
    console.log(`✅ Test Reel successfully created at: ${finalVideoPath}`);
}

runTestReel().catch(console.error);

/**
 * Veo API Client for E2E Testing
 *
 * Direct API calls (not MCP) for simpler testing
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Configuration
const OUTPUT_DIR = path.join(os.homedir(), "Documents", "veo_generated_test");
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 10000;

// Ensure output directory exists
export function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    return OUTPUT_DIR;
}

// Get Gemini client
export function getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
    }
    return new GoogleGenAI({ apiKey });
}

// Generate unique filename
export function generateFilename(prefix = "test") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${id}.mp4`;
}

// Poll operation until complete
export async function pollOperation(ai, operation, onProgress) {
    let attempts = 0;
    let currentOp = operation;

    while (!currentOp.done && attempts < MAX_POLL_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;

        if (onProgress) {
            onProgress(attempts, MAX_POLL_ATTEMPTS);
        }

        currentOp = await ai.operations.getVideosOperation({
            operation: currentOp
        });

        if (currentOp.error) {
            throw new Error(`Video generation failed: ${JSON.stringify(currentOp.error)}`);
        }
    }

    if (!currentOp.done) {
        throw new Error("Video generation timed out");
    }

    return currentOp;
}

// Save video from operation
export async function saveVideoFromOperation(operation, filename) {
    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
        throw new Error("No video in response");
    }

    ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, filename);
    let buffer;

    // Try videoBytes first (base64 encoded)
    if (video.videoBytes) {
        console.error("  Using videoBytes (base64)...");
        buffer = Buffer.from(video.videoBytes, "base64");
    }
    // Then try URI with API key
    else if (video.uri) {
        console.error(`  Downloading from URI: ${video.uri.substring(0, 80)}...`);

        const apiKey = process.env.GEMINI_API_KEY;

        // Build URL with API key as query param (required for googleapis.com endpoints)
        const downloadUrl = new URL(video.uri);
        if (apiKey && downloadUrl.hostname.includes('googleapis.com')) {
            downloadUrl.searchParams.set('key', apiKey);
        }

        const response = await fetch(downloadUrl.toString());

        if (!response.ok) {
            // If that fails, try with auth header instead
            console.error(`  Query param auth failed (${response.status}), trying header auth...`);
            const response2 = await fetch(video.uri, {
                headers: {
                    "x-goog-api-key": apiKey
                }
            });
            if (!response2.ok) {
                throw new Error(`Failed to download video: ${response2.status} ${response2.statusText}`);
            }
            buffer = Buffer.from(await response2.arrayBuffer());
        } else {
            buffer = Buffer.from(await response.arrayBuffer());
        }
    } else {
        throw new Error("No video URI or videoBytes in response");
    }

    fs.writeFileSync(filePath, buffer);

    return {
        path: filePath,
        size: buffer.length
    };
}

// Generate video (blocking)
export async function generateVideo(options) {
    const {
        prompt,
        model = "veo-3.1-generate-preview",
        aspectRatio = "16:9",
        duration = 4,
        onProgress
    } = options;

    const ai = getClient();
    const startTime = Date.now();

    console.error(`Starting video generation: "${prompt.substring(0, 50)}..."`);

    const operation = await ai.models.generateVideos({
        model,
        source: { prompt },
        config: {
            aspectRatio,
            durationSeconds: duration,
            numberOfVideos: 1
        }
    });

    const completedOp = await pollOperation(ai, operation, onProgress);
    const filename = generateFilename("video");
    const result = await saveVideoFromOperation(completedOp, filename);

    return {
        ...result,
        prompt,
        model,
        aspectRatio,
        duration,
        generationTime: Date.now() - startTime
    };
}

// Generate video from image (blocking)
export async function generateFromImage(options) {
    const {
        imagePath,
        prompt,
        model = "veo-3.1-generate-preview",
        duration = 4,
        onProgress
    } = options;

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image not found: ${imagePath}`);
    }

    const ai = getClient();
    const startTime = Date.now();

    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString("base64");
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    console.error(`Starting image-to-video: "${prompt.substring(0, 50)}..."`);

    const operation = await ai.models.generateVideos({
        model,
        source: {
            prompt,
            image: {
                mimeType,
                data: imageBase64
            }
        },
        config: {
            durationSeconds: duration,
            numberOfVideos: 1
        }
    });

    const completedOp = await pollOperation(ai, operation, onProgress);
    const filename = generateFilename("animated");
    const result = await saveVideoFromOperation(completedOp, filename);

    return {
        ...result,
        prompt,
        imagePath,
        model,
        duration,
        generationTime: Date.now() - startTime
    };
}

// Generate transition video (blocking)
export async function generateTransition(options) {
    const {
        firstFrame,
        lastFrame,
        prompt,
        model = "veo-3.1-generate-preview",
        duration = 4,
        onProgress
    } = options;

    if (!fs.existsSync(firstFrame)) {
        throw new Error(`First frame not found: ${firstFrame}`);
    }
    if (!fs.existsSync(lastFrame)) {
        throw new Error(`Last frame not found: ${lastFrame}`);
    }

    const ai = getClient();
    const startTime = Date.now();

    const getMimeType = (p) => {
        const ext = path.extname(p).toLowerCase();
        return ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    };

    const firstBuffer = fs.readFileSync(firstFrame);
    const lastBuffer = fs.readFileSync(lastFrame);

    console.error(`Starting transition: "${prompt.substring(0, 50)}..."`);

    const operation = await ai.models.generateVideos({
        model,
        source: {
            prompt,
            image: {
                mimeType: getMimeType(firstFrame),
                data: firstBuffer.toString("base64")
            }
        },
        config: {
            durationSeconds: duration,
            numberOfVideos: 1,
            lastFrame: {
                mimeType: getMimeType(lastFrame),
                data: lastBuffer.toString("base64")
            }
        }
    });

    const completedOp = await pollOperation(ai, operation, onProgress);
    const filename = generateFilename("transition");
    const result = await saveVideoFromOperation(completedOp, filename);

    return {
        ...result,
        prompt,
        firstFrame,
        lastFrame,
        model,
        duration,
        generationTime: Date.now() - startTime
    };
}

// Cleanup test outputs
export function cleanup(filePaths) {
    let deleted = 0;
    let bytesRecovered = 0;

    for (const filePath of filePaths) {
        try {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                bytesRecovered += stats.size;
                fs.unlinkSync(filePath);
                deleted++;
            }
        } catch (err) {
            console.error(`Failed to delete ${filePath}:`, err.message);
        }
    }

    return { deleted, bytesRecovered };
}

// Clean all test outputs
export function cleanupAll() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        return { deleted: 0, bytesRecovered: 0 };
    }

    const files = fs.readdirSync(OUTPUT_DIR);
    const filePaths = files.map(f => path.join(OUTPUT_DIR, f));
    return cleanup(filePaths);
}

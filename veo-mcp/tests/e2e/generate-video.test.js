/**
 * E2E Tests: Text-to-Video Generation
 *
 * IMPORTANT: These tests make real API calls and cost credits!
 * Run sparingly with: npm run test:e2e
 *
 * To run a single test:
 *   npm run test:single -- "basic-generation"
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import {
    generateVideo,
    cleanupAll,
    ensureOutputDir
} from "../helpers/veo-client.js";

// Track generated files for cleanup
const generatedFiles = [];

describe("veo_generate_video", { timeout: 300000 }, () => {
    before(() => {
        // Verify API key is set
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY must be set to run E2E tests");
        }
        ensureOutputDir();
        console.log("Starting text-to-video E2E tests...");
    });

    after(() => {
        // Optional: Uncomment to auto-cleanup after tests
        // const result = cleanupAll();
        // console.log(`Cleanup: ${result.deleted} files, ${(result.bytesRecovered / 1024 / 1024).toFixed(2)} MB recovered`);
        console.log(`Generated ${generatedFiles.length} test videos`);
    });

    it("basic-generation: generates video from text prompt", async () => {
        const result = await generateVideo({
            prompt: "A calm ocean wave rolling onto a sandy beach at sunset, 4K cinematic",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        // Verify video was created
        assert.ok(result.path, "Video path should be returned");
        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.ok(result.path.endsWith(".mp4"), "Should be MP4 format");
        assert.ok(result.size > 0, "Video should have content");

        console.log(`  Generated: ${result.path}`);
        console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Time: ${(result.generationTime / 1000).toFixed(1)}s`);
    });

    it("aspect-ratio-landscape: generates 16:9 video", async () => {
        const result = await generateVideo({
            prompt: "Aerial drone shot of mountains with flowing river, epic landscape",
            aspectRatio: "16:9",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.strictEqual(result.aspectRatio, "16:9");

        console.log(`  Generated landscape video: ${result.path}`);
    });

    it("aspect-ratio-portrait: generates 9:16 video", async () => {
        const result = await generateVideo({
            prompt: "Smartphone video of coffee being poured into a cup, close-up",
            aspectRatio: "9:16",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.strictEqual(result.aspectRatio, "9:16");

        console.log(`  Generated portrait video: ${result.path}`);
    });

    it("duration-4s: generates 4-second video", async () => {
        const result = await generateVideo({
            prompt: "A butterfly landing on a flower, macro close-up",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.strictEqual(result.duration, 4);

        console.log(`  Generated 4s video: ${result.path}`);
    });

    it("duration-8s: generates 8-second video", async () => {
        const result = await generateVideo({
            prompt: "Time-lapse of clouds moving across a mountain peak at golden hour",
            duration: 8,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.strictEqual(result.duration, 8);

        console.log(`  Generated 8s video: ${result.path}`);
    });

    it("model-fast: uses fast model variant", async () => {
        const result = await generateVideo({
            prompt: "A cat stretching on a sunny windowsill",
            model: "veo-3.1-fast-generate-preview",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.ok(result.model.includes("fast"), "Should use fast model");

        console.log(`  Generated with fast model: ${result.path}`);
        console.log(`  Time: ${(result.generationTime / 1000).toFixed(1)}s`);
    });
});
